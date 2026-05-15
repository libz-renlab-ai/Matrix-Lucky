import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type CommandResult = {
  name: string;
  command: string[];
  cwd: string;
  exitCode: number | null;
  stdoutPath: string;
  stderrPath: string;
  commandPath: string;
};

type ItemReport = {
  id: number;
  feature: string;
  finalChoice: "hybrid";
  status: "proved-gap" | "partially-proved" | "blocked-by-environment";
  oldEvidence: string[];
  newEvidence: string[];
  reasons: string[];
  nextEvidenceNeeded: string[];
};

const REPO_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const OUT_ROOT = path.join(REPO_ROOT, "scripts", "out", "evidence-phase-gaps");
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const RUN_DIR = path.join(OUT_ROOT, RUN_ID);

mkdirSync(RUN_DIR, { recursive: true });

const commands: CommandResult[] = [];

function runCommand(
  name: string,
  command: string[],
  opts: { env?: NodeJS.ProcessEnv; allowFailure?: boolean } = {},
): CommandResult {
  const safeName = name.replace(/[^a-zA-Z0-9_.-]+/g, "-");
  const stdoutPath = path.join(RUN_DIR, `${safeName}.stdout.log`);
  const stderrPath = path.join(RUN_DIR, `${safeName}.stderr.log`);
  const commandPath = path.join(RUN_DIR, `${safeName}.command.json`);

  writeFileSync(commandPath, JSON.stringify({ command, cwd: REPO_ROOT, env: opts.env ?? {} }, null, 2) + "\n");
  const result = spawnSync(command[0]!, command.slice(1), {
    cwd: REPO_ROOT,
    env: { ...process.env, ...(opts.env ?? {}) },
    encoding: "utf-8",
    maxBuffer: 50 * 1024 * 1024,
  });

  writeFileSync(stdoutPath, result.stdout ?? "", "utf-8");
  writeFileSync(stderrPath, result.stderr ?? "", "utf-8");

  const entry = {
    name,
    command,
    cwd: REPO_ROOT,
    exitCode: result.status,
    stdoutPath,
    stderrPath,
    commandPath,
  };
  commands.push(entry);

  if (!opts.allowFailure && result.status !== 0) {
    process.stderr.write(`${name} failed with exit=${result.status}; continuing so the report captures the failure.\n`);
  }
  return entry;
}

function readIfExists(file: string): string {
  return existsSync(file) ? readFileSync(file, "utf-8") : "";
}

function newestSubdir(dir: string): string | null {
  if (!existsSync(dir)) return null;
  const dirs = readdirSync(dir)
    .map((name) => path.join(dir, name))
    .filter((p) => statSync(p).isDirectory())
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return dirs[0] ?? null;
}

function rel(file: string): string {
  return path.relative(REPO_ROOT, file);
}

function parseJsonFile<T>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(file, "utf-8")) as T;
  } catch {
    return null;
  }
}

function collectHookSettings(): {
  hasSessionEnd: boolean;
  hasPreCompact: boolean;
  invalidHookCommands: string[];
  settingsPath: string;
} {
  const settingsPath = path.join(REPO_ROOT, ".claude", "settings.local.json");
  const settings = parseJsonFile<any>(settingsPath) ?? {};
  const hooks = settings.hooks ?? {};
  const invalidHookCommands: string[] = [];

  for (const entries of Object.values(hooks) as any[]) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      for (const hook of entry.hooks ?? []) {
        const command = String(hook.command ?? "");
        const match = command.match(/\bnode\s+(.+?)(?:\s|$)/);
        if (!match) continue;
        const raw = match[1]!.replace(/^"|"$/g, "");
        const maybePath = path.isAbsolute(raw) ? raw : path.resolve(REPO_ROOT, raw);
        if (!existsSync(maybePath)) invalidHookCommands.push(command);
      }
    }
  }

  return {
    hasSessionEnd: Array.isArray(hooks.SessionEnd) && hooks.SessionEnd.length > 0,
    hasPreCompact: Array.isArray(hooks.PreCompact) && hooks.PreCompact.length > 0,
    invalidHookCommands,
    settingsPath,
  };
}

function parseStrictRun(strictOut: string): {
  runDir: string | null;
  reportPath: string | null;
  report: any | null;
  summaries: string[];
  stdoutFiles: string[];
  pluginsSeen: string[];
  hookResponses: any[];
} {
  const runDir = newestSubdir(strictOut);
  if (!runDir) return { runDir: null, reportPath: null, report: null, summaries: [], stdoutFiles: [], pluginsSeen: [], hookResponses: [] };

  const reportPath = path.join(runDir, "report.json");
  const report = parseJsonFile<any>(reportPath);
  const summaries: string[] = [];
  const stdoutFiles: string[] = [];
  const plugins = new Set<string>();
  const hookResponses: any[] = [];

  for (const caseName of readdirSync(runDir)) {
    const caseDir = path.join(runDir, caseName);
    if (!statSync(caseDir).isDirectory()) continue;
    const summary = path.join(caseDir, "summary.json");
    const stdout = path.join(caseDir, "stdout.jsonl");
    if (existsSync(summary)) {
      summaries.push(summary);
      const parsed = parseJsonFile<any>(summary);
      for (const response of parsed?.parsed?.hookResponses ?? []) hookResponses.push(response);
    }
    if (existsSync(stdout)) {
      stdoutFiles.push(stdout);
      for (const line of readFileSync(stdout, "utf-8").split(/\r?\n/)) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          if (event.type === "system" && event.subtype === "init") {
            for (const p of event.plugins ?? []) plugins.add(p.name);
          }
        } catch {
          // ignore malformed raw lines here; claudefast summary owns that check.
        }
      }
    }
  }

  return { runDir, reportPath, report, summaries, stdoutFiles, pluginsSeen: [...plugins], hookResponses };
}

function main(): void {
  const strictOut = path.join(RUN_DIR, "new-strict-claudefast");

  runCommand("claudefast-help", ["claudefast", "-h"], { allowFailure: true });
  runCommand("claude-help", ["claude", "-h"], { allowFailure: true });
  runCommand("old-targeted-vitest", [
    "pnpm",
    "vitest",
    "run",
    "packages/core/src/calibrator/v2/__tests__",
    "packages/core/src/pipeline/__tests__/calibration-pipeline-v2.test.ts",
    "packages/cli/src/__tests__/bin-stop.test.ts",
    "packages/cli/src/__tests__/calibrate.test.ts",
    "packages/cli/src/__tests__/install-hook.test.ts",
    "packages/cli/src/__tests__/install-plugins.test.ts",
    "packages/adapters/src/attribution/__tests__/stdout-renderer.test.ts",
    "packages/cli/src/__tests__/skeleton-demo.test.ts",
    "packages/adapters/src/hook/claude-agent-sdk/__tests__/pre-tool-use-sdk.test.ts",
  ], { allowFailure: true });
  runCommand("old-hook-smoke", ["pnpm", "smoke:hook"], { allowFailure: true });
  runCommand("statusline-direct", ["node", "scripts/teamagent-statusline.cjs"], { allowFailure: true });
  runCommand("new-strict-claudefast", [
    "pnpm",
    "smoke:claudefast",
    "--",
    "--case=bash-pre-post-hooks,write-batch-insert-deny,write-axios-warning,context-claudefast-docs",
    "--concurrency=1",
    "--timeout-ms=180000",
    `--out=${strictOut}`,
  ], { allowFailure: true });

  const settings = collectHookSettings();
  const strict = parseStrictRun(strictOut);
  const vitest = commands.find((c) => c.name === "old-targeted-vitest")!;
  const hookSmoke = commands.find((c) => c.name === "old-hook-smoke")!;
  const statusline = commands.find((c) => c.name === "statusline-direct")!;
  const newStrict = commands.find((c) => c.name === "new-strict-claudefast")!;

  const dualLayerText = readIfExists(path.join(REPO_ROOT, "packages/adapters/src/storage/sqlite/dual-layer-store.ts"));
  const roadmapText = readIfExists(path.join(REPO_ROOT, "docs/backup/phase2-superseded/2026-04-22-product-roadmap-v3.md"));
  const installPluginsTestText = readIfExists(path.join(REPO_ROOT, "packages/cli/src/__tests__/install-plugins.test.ts"));
  const sessionEndText = readIfExists(path.join(REPO_ROOT, "packages/cli/src/bin-session-end.ts"));
  const preCompactText = readIfExists(path.join(REPO_ROOT, "packages/cli/src/bin-pre-compact.ts"));

  // Plugin names align with project-level .claude/settings.json:enabledPlugins (PR #255).
  const targetPlugins = ["playground", "code-review", "frontend-design"];
  const missingPlugins = targetPlugins.filter((p) => !strict.pluginsSeen.includes(p));

  const commonNewEvidence = [
    rel(newStrict.stdoutPath),
    rel(newStrict.stderrPath),
    ...(strict.reportPath ? [rel(strict.reportPath)] : []),
    ...strict.summaries.map(rel),
  ];

  const items: ItemReport[] = [
    {
      id: 14,
      feature: "长期置信度演化",
      finalChoice: "hybrid",
      status: vitest.exitCode === 0 ? "partially-proved" : "blocked-by-environment",
      oldEvidence: [rel(vitest.stdoutPath), "packages/core/src/calibrator/v2/__tests__", "packages/core/src/pipeline/__tests__/calibration-pipeline-v2.test.ts"],
      newEvidence: commonNewEvidence,
      reasons: [
        "旧单测能精确证明 Wilson 衰减、demerit 衰减、hysteresis、promotion/demotion 纯逻辑。",
        "strict stream-json 能证明真实 Claude 会话的 hook/tool 事件，但不能单独证明长期多 session 校准链路。",
        "最终证据必须把 deterministic 校准测试和真实会话事件流合并。"
      ],
      nextEvidenceNeeded: ["多 session stdout.jsonl", "full-chain-confidence-timeline.json", "promotion-demotion-session-matrix.csv"],
    },
    {
      id: 15,
      feature: "团队共享 / 跨机器同步",
      finalChoice: "hybrid",
      status: dualLayerText.includes("team-scoped entries are not supported until Phase 4") && roadmapText.includes("双向同步规则")
        ? "proved-gap"
        : "blocked-by-environment",
      oldEvidence: ["packages/adapters/src/storage/sqlite/dual-layer-store.ts", "docs/backup/phase2-superseded/2026-04-22-product-roadmap-v3.md"],
      newEvidence: commonNewEvidence,
      reasons: [
        "源码和文档直接证明 team scope/sync 仍是 Phase 4 缺口。",
        "strict stream-json 只能证明当前 hook runtime 是否成功，不能证明跨机器规则同步。",
        "跨机器同步需要 Alice/Bob 两个 HOME/项目的落盘 DB diff 和 session-start 注入证据。"
      ],
      nextEvidenceNeeded: ["alice/session-start/stdout.jsonl", "bob/session-start/stdout.jsonl", "team-rules git repo diff", "bob/.teamagent/knowledge.db export"],
    },
    {
      id: 16,
      feature: "插件本身能力验证",
      finalChoice: "hybrid",
      status: installPluginsTestText.includes("executeInstallPlugins") && missingPlugins.length > 0 ? "proved-gap" : "partially-proved",
      oldEvidence: ["packages/cli/src/__tests__/install-plugins.test.ts", "packages/cli/src/commands/install-plugins.ts"],
      newEvidence: [...commonNewEvidence, `pluginsSeen=${strict.pluginsSeen.join(",") || "(none)"}`],
      reasons: [
        "旧测试证明 installer contract、idempotency、scope、失败解析。",
        "真实插件能力必须由 strict stream-json 的 system.init.plugins/skills/slash_commands 和插件专属 prompt 证明。",
        `本次 strict init 未看到目标插件：${missingPlugins.join(", ") || "无" }。`
      ],
      nextEvidenceNeeded: targetPlugins.map((p) => `${p}/stdout.jsonl`),
    },
    {
      id: 17,
      feature: "SessionEnd 真实关闭语义",
      finalChoice: "hybrid",
      status: settings.hasSessionEnd && sessionEndText.includes("TEAMAGENT_SESSION_END_PIPELINE") ? "partially-proved" : "proved-gap",
      oldEvidence: ["packages/cli/src/bin-session-end.ts", rel(settings.settingsPath)],
      newEvidence: [...commonNewEvidence, rel(newStrict.stderrPath)],
      reasons: [
        "SessionEnd 入口和当前 settings 注册可被源码/文件系统证明。",
        "普通 -p stream-json 通常只覆盖会话内事件，不能完整代表 Ctrl+C/logout/window close。",
        "本次环境存在无效 hook command 时，strict 报告能抓出失败，但真实关闭语义仍需外层关闭观测。"
      ],
      nextEvidenceNeeded: ["session-end-close/stderr.log", "session-end-close/stop-errors.log", "session-end-close/harvest.jsonl", "session-end-close/db-diff.json"],
    },
    {
      id: 18,
      feature: "PreCompact",
      finalChoice: "hybrid",
      status: settings.hasPreCompact && preCompactText.includes("TEAMAGENT_PRE_COMPACT_PIPELINE") ? "partially-proved" : "proved-gap",
      oldEvidence: ["packages/cli/src/bin-pre-compact.ts", rel(settings.settingsPath)],
      newEvidence: commonNewEvidence,
      reasons: [
        "PreCompact 入口和当前 settings 注册可被源码/文件系统证明。",
        "普通 claudefast -p 不会稳定制造真实 compact 触发。",
        "需要真实 /compact transcript 或 Claude 自动压缩触发的 stream/外层日志。"
      ],
      nextEvidenceNeeded: ["pre-compact/stdout.jsonl", "pre-compact/stderr.log", "pre-compact/transcript-before.jsonl", "pre-compact/db-diff.json"],
    },
    {
      id: 19,
      feature: "StatusLine 完整终端体验",
      finalChoice: "hybrid",
      status: statusline.exitCode === 0 ? "partially-proved" : "blocked-by-environment",
      oldEvidence: [rel(statusline.stdoutPath), "packages/cli/src/__tests__/install-hook.test.ts", "scripts/teamagent-statusline.cjs"],
      newEvidence: commonNewEvidence,
      reasons: [
        "旧测试和直接脚本输出证明 statusLine 脚本/注册语义。",
        "strict stream-json 不能证明真实 PTY 状态栏渲染。",
        "完整证据必须补 PTY transcript 或可截图的真实 Claude UI。"
      ],
      nextEvidenceNeeded: ["statusline-pty/pty-session.log", "statusline-pty/screenshot.png", "statusline-pty/statusline.out"],
    },
    {
      id: 20,
      feature: "Attribution 完整可见性体验",
      finalChoice: "hybrid",
      status: vitest.exitCode === 0 ? "partially-proved" : "blocked-by-environment",
      oldEvidence: ["packages/cli/src/__tests__/skeleton-demo.test.ts", "packages/adapters/src/attribution/__tests__/stdout-renderer.test.ts", "packages/adapters/src/hook/claude-agent-sdk/__tests__/pre-tool-use-sdk.test.ts"],
      newEvidence: commonNewEvidence,
      reasons: [
        "旧测试最适合钉住 silent/smart/verbose renderer 语义矩阵。",
        "strict stream-json 最适合证明真实 Claude hook systemMessage / permission deny 可见。",
        "本次还缺 silent/smart/verbose 三模式在真实 Claude 会话里的并排运行。"
      ],
      nextEvidenceNeeded: ["attribution/silent/stdout.jsonl", "attribution/smart/stdout.jsonl", "attribution/verbose/stdout.jsonl"],
    },
  ];

  const summary = {
    generatedAt: new Date().toISOString(),
    runDir: RUN_DIR,
    commands,
    strict: {
      runDir: strict.runDir,
      reportPath: strict.reportPath,
      pluginsSeen: strict.pluginsSeen,
      hookResponses: strict.hookResponses,
      invalidHookCommands: settings.invalidHookCommands,
    },
    items,
  };

  writeFileSync(path.join(RUN_DIR, "summary.json"), JSON.stringify(summary, null, 2) + "\n", "utf-8");
  writeFileSync(path.join(RUN_DIR, "summary.md"), renderMarkdown(items, summary), "utf-8");

  process.stdout.write(`Evidence report written:\n${path.join(RUN_DIR, "summary.md")}\n${path.join(RUN_DIR, "summary.json")}\n`);
}

function renderMarkdown(items: ItemReport[], summary: any): string {
  const lines: string[] = [];
  lines.push("# Phase Gaps 14-20 A/B Evidence Report");
  lines.push("");
  lines.push(`Run: ${summary.generatedAt}`);
  lines.push(`Run dir: \`${rel(RUN_DIR)}\``);
  lines.push("");
  lines.push("## Commands");
  lines.push("");
  lines.push("| Command | Exit | stdout | stderr |");
  lines.push("|---|---:|---|---|");
  for (const command of commands) {
    lines.push(`| ${command.name} | ${command.exitCode ?? "null"} | \`${rel(command.stdoutPath)}\` | \`${rel(command.stderrPath)}\` |`);
  }
  lines.push("");
  lines.push("## Results");
  lines.push("");
  lines.push("| ID | Feature | Choice | Status | Key Reason |");
  lines.push("|---:|---|---|---|---|");
  for (const item of items) {
    lines.push(`| ${item.id} | ${item.feature} | ${item.finalChoice} | ${item.status} | ${item.reasons[0]} |`);
  }
  lines.push("");
  for (const item of items) {
    lines.push(`## ${item.id}. ${item.feature}`);
    lines.push("");
    lines.push(`Final choice: **${item.finalChoice}**`);
    lines.push(`Status: **${item.status}**`);
    lines.push("");
    lines.push("Reasons:");
    for (const reason of item.reasons) lines.push(`- ${reason}`);
    lines.push("");
    lines.push("Old evidence:");
    for (const evidence of item.oldEvidence) lines.push(`- \`${evidence}\``);
    lines.push("");
    lines.push("New evidence:");
    for (const evidence of item.newEvidence) lines.push(`- \`${evidence}\``);
    lines.push("");
    lines.push("Next evidence needed:");
    for (const evidence of item.nextEvidenceNeeded) lines.push(`- \`${evidence}\``);
    lines.push("");
  }
  return lines.join("\n");
}

main();
