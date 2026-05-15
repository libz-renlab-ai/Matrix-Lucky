import { spawn as nodeSpawn } from "node:child_process";
import type { MarketplaceSpec, PluginSpec } from "@teamagent/core";
import { formatPluginSpec } from "@teamagent/core";

export type PluginCmdResult =
  | { kind: "exit"; code: number; stdout: string; stderr: string }
  | { kind: "timeout" }
  | { kind: "enoent" }
  | { kind: "error"; message: string };

export interface PluginCmdSpawner {
  (args: string[], timeoutMs: number): Promise<PluginCmdResult>;
}

export interface PluginInstallerOptions {
  /** `claude` 可执行文件名（默认 'claude'）。 */
  executable?: string;
  /** 每条子命令超时毫秒（默认 60000）。 */
  timeoutMs?: number;
  /** 注入 spawner（测试用）；缺省 wrap node:child_process。 */
  spawner?: PluginCmdSpawner;
}

export interface StepOutcome {
  /** added = 新装；already = 之前已装/已注册；failed = 出错。 */
  status: "added" | "already" | "failed";
  detail: string;
}

export interface InstallPluginOptions {
  /** 传给 `claude plugin install --scope`。user/project/local。缺省 user。 */
  scope?: "user" | "project" | "local";
}

/**
 * Wraps the `claude plugin` CLI for non-interactive marketplace + plugin
 * registration. Output parsing relies on ✔/✘ symbols and "already" marker.
 * claude CLI always exits 0 (even on failure), so the payload text is truth.
 */
export class ClaudePluginInstaller {
  private readonly executable: string;
  private readonly timeoutMs: number;
  private readonly spawner: PluginCmdSpawner;

  constructor(opts: PluginInstallerOptions = {}) {
    this.executable = opts.executable ?? "claude";
    this.timeoutMs = opts.timeoutMs ?? 60_000;
    this.spawner = opts.spawner ?? this.defaultSpawner();
  }

  async addMarketplace(m: MarketplaceSpec): Promise<StepOutcome> {
    const args = ["plugin", "marketplace", "add", m.repo];
    return interpretCmd(
      await this.spawner(args, this.timeoutMs),
      `marketplace '${m.name}' (${m.repo})`,
    );
  }

  async installPlugin(
    p: PluginSpec,
    opts: InstallPluginOptions = {},
  ): Promise<StepOutcome> {
    const spec = formatPluginSpec(p);
    const args = ["plugin", "install", spec];
    if (opts.scope) args.push("--scope", opts.scope);
    return interpretCmd(
      await this.spawner(args, this.timeoutMs),
      `plugin ${spec}`,
    );
  }

  private defaultSpawner(): PluginCmdSpawner {
    const exe = this.executable;
    return (args, timeoutMs) =>
      new Promise<PluginCmdResult>((resolve) => {
        let child: ReturnType<typeof nodeSpawn>;
        try {
          child = nodeSpawn(exe, args, {
            stdio: ["ignore", "pipe", "pipe"],
            windowsHide: true,
          });
        } catch (err) {
          const msg = (err as NodeJS.ErrnoException).code === "ENOENT" ? null : String(err);
          resolve(msg ? { kind: "error", message: msg } : { kind: "enoent" });
          return;
        }

        let stdout = "";
        let stderr = "";
        let settled = false;
        const finish = (r: PluginCmdResult) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(r);
        };

        child.stdout?.on("data", (b: Buffer) => (stdout += b.toString("utf-8")));
        child.stderr?.on("data", (b: Buffer) => (stderr += b.toString("utf-8")));
        child.on("error", (err: NodeJS.ErrnoException) => {
          if (err.code === "ENOENT") finish({ kind: "enoent" });
          else finish({ kind: "error", message: err.message });
        });
        child.on("close", (code) => {
          finish({ kind: "exit", code: code ?? -1, stdout, stderr });
        });

        const timer = setTimeout(() => {
          child.kill("SIGKILL");
          finish({ kind: "timeout" });
        }, timeoutMs);
      });
  }
}

function interpretCmd(r: PluginCmdResult, subject: string): StepOutcome {
  switch (r.kind) {
    case "enoent":
      return {
        status: "failed",
        detail: "未找到 'claude' 可执行文件。请确认 Claude Code 已装且在 PATH 中",
      };
    case "timeout":
      return { status: "failed", detail: `${subject}: 命令超时 (timeout)` };
    case "error":
      return { status: "failed", detail: `${subject}: ${r.message}` };
    case "exit": {
      const combined = `${r.stdout}\n${r.stderr}`;
      if (r.code !== 0) {
        return {
          status: "failed",
          detail: `${subject}: exit=${r.code}\n${combined.trim().slice(0, 400)}`,
        };
      }
      // claude CLI exits 0 even on failure; read the payload text.
      if (/✘|Failed to |Failed: /i.test(combined)) {
        return {
          status: "failed",
          detail: `${subject}: ${extractLine(combined, /✘|Failed/) || combined.trim().slice(0, 400)}`,
        };
      }
      if (/already/i.test(combined)) {
        return { status: "already", detail: `${subject}: ${extractLine(combined, /already/i) || "already present"}` };
      }
      return { status: "added", detail: `${subject}: ${extractLine(combined, /✔|Successfully/) || "done"}` };
    }
  }
}

function extractLine(text: string, marker: RegExp): string | null {
  for (const line of text.split(/\r?\n/)) {
    if (marker.test(line)) return line.replace(/^\s+/, "").slice(0, 300);
  }
  return null;
}
