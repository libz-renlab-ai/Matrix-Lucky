import fs from "node:fs";
import path from "node:path";
import type { ExtractionInput } from "@teamagent/ports";

/**
 * npm audit --json 的宽松解析。只保留 high / critical 严重度。
 *
 * 期望形状（npm v7+）：
 * ```json
 * {
 *   "vulnerabilities": {
 *     "pkg-name": {
 *       "severity": "high" | "critical" | "moderate" | "low" | "info",
 *       "title": "...",
 *       "url": "..."
 *     }
 *   }
 * }
 * ```
 */
export function parseNpmAudit(raw: string): ExtractionInput[] {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!data || typeof data !== "object") return [];
  const vulns = (data as Record<string, unknown>).vulnerabilities;
  if (!vulns || typeof vulns !== "object") return [];

  const out: ExtractionInput[] = [];
  for (const [pkg, rawVuln] of Object.entries(
    vulns as Record<string, unknown>,
  )) {
    if (!rawVuln || typeof rawVuln !== "object") continue;
    const v = rawVuln as Record<string, unknown>;
    const severity =
      typeof v.severity === "string" ? v.severity.toLowerCase() : "";
    if (severity !== "high" && severity !== "critical") continue;
    const title = typeof v.title === "string" ? v.title : "";
    const url = typeof v.url === "string" ? v.url : "";
    out.push({
      kind: "npm-audit",
      context: `[severity=${severity}] ${pkg}: ${title} (${url || "no url"})`,
      weight: severity === "critical" ? 1.0 : 0.8,
    });
  }
  return out;
}

/** 根据 lockfile 检测包管理器，返回对应的 audit 命令。 */
function detectAuditCmd(cwd?: string): string {
  const dir = cwd ?? process.cwd();
  if (fs.existsSync(path.join(dir, "pnpm-lock.yaml"))) return "pnpm audit --json";
  if (fs.existsSync(path.join(dir, "yarn.lock"))) return "yarn audit --json";
  return "npm audit --json";
}

/** 调 runner 拿 audit --json 输出；自动检测 pnpm/yarn/npm，方便测试注入 runner。 */
export async function getNpmAuditOutput(
  runner: (cmd: string, opts: { cwd?: string }) => Promise<string>,
  cwd?: string,
): Promise<string> {
  const cmd = detectAuditCmd(cwd);
  try {
    return await runner(cmd, { cwd });
  } catch (err) {
    // audit 在有漏洞时 exit code 非 0；如果输出还是 JSON，优先用它
    const message = err instanceof Error ? err.message : String(err);
    const match = message.match(/\{[\s\S]*\}$/);
    if (match) return match[0];
    // 否则向上抛
    throw err;
  }
}
