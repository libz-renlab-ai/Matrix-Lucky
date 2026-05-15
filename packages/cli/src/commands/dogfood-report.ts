import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { execSync } from "node:child_process";
import { DualLayerStore, SqliteEventLog, openDb } from "@teamagent/adapters";
import type { KnowledgeEntry, PersistedEvent } from "@teamagent/types";

export interface DogfoodReportOptions {
  cwd?: string;
  homeDir?: string;
  projectDbPath?: string;
  userGlobalDbPath?: string;
  eventsDbPath?: string;
  /** 输出 Markdown 路径；默认 docs/dogfood/自举报告.md */
  outputPath?: string;
  now?: () => Date;
}

export interface DogfoodReportResult {
  outputPath: string;
  totalEntries: number;
  totalEvents: number;
  scopes: Record<"personal" | "team" | "global", number>;
  topFired: Array<{ knowledge_id: string; trigger: string; fires: number }>;
  topConfidenceGain: Array<{ knowledge_id: string; trigger: string; totalDelta: number }>;
  archivedCount: number;
}

function resolvePaths(opts: DogfoodReportOptions) {
  const home = opts.homeDir ?? os.homedir();
  const cwd = opts.cwd ?? process.cwd();
  return {
    home,
    cwd,
    projectDbPath:
      opts.projectDbPath ?? path.join(cwd, ".teamagent", "knowledge.db"),
    userGlobalDbPath:
      opts.userGlobalDbPath ?? path.join(home, ".teamagent", "global.db"),
    eventsDbPath:
      opts.eventsDbPath ?? path.join(home, ".teamagent", "events.db"),
    outputPath: opts.outputPath ?? path.join(cwd, "docs", "dogfood", "自举报告.md"),
  };
}

/** 读 git log 拿提交简要时间线（按 milestone tag 聚合）。 */
function readGitTimeline(cwd: string): Array<{ hash: string; date: string; message: string }> {
  try {
    const out = execSync(
      'git log --pretty=format:"%h|%ad|%s" --date=short -100',
      // stdio: pipe stderr so a missing .git directory does not leak
      // "fatal: not a git repository" to the user's terminal — the catch
      // below already returns []. Without "ignore" / "pipe" stderr, the
      // child writes directly to our stderr.
      { cwd, encoding: "utf-8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    return out
      .split("\n")
      .map((line) => {
        const [hash, date, ...rest] = line.split("|");
        return { hash: hash ?? "", date: date ?? "", message: rest.join("|") };
      })
      .filter((c) => c.hash);
  } catch {
    return [];
  }
}

export async function executeDogfoodReport(
  opts: DogfoodReportOptions = {},
): Promise<DogfoodReportResult> {
  const paths = resolvePaths(opts);
  const now = (opts.now ?? (() => new Date()))();

  let allEntries: KnowledgeEntry[] = [];
  try {
    fs.mkdirSync(path.dirname(paths.projectDbPath), { recursive: true });
    fs.mkdirSync(path.dirname(paths.userGlobalDbPath), { recursive: true });
    if (fs.existsSync(paths.projectDbPath) || fs.existsSync(paths.userGlobalDbPath)) {
      const store = new DualLayerStore({
        projectDbPath: paths.projectDbPath,
        userGlobalDbPath: paths.userGlobalDbPath,
      });
      allEntries = store.getAll();
      store.close();
    }
  } catch {
    // DB 不可用 → 空
  }

  const personal = allEntries.filter((e) => e.scope.level === "personal");
  const global = allEntries.filter((e) => e.scope.level === "global");

  let events: PersistedEvent[] = [];
  try {
    if (fs.existsSync(paths.eventsDbPath)) {
      const eventLog = new SqliteEventLog(openDb(paths.eventsDbPath));
      events = eventLog.readAll();
      eventLog.close();
    }
  } catch {
    // events DB 不可用 → 空
  }

  const timeline = readGitTimeline(paths.cwd);

  // ---- 聚合 ----
  const triggerById = new Map<string, string>();
  for (const e of allEntries) triggerById.set(e.id, e.trigger);

  const fireCount = new Map<string, number>();
  for (const e of events) {
    if (e.knowledge_id && /^hook-pre/.test(e.kind)) {
      fireCount.set(e.knowledge_id, (fireCount.get(e.knowledge_id) ?? 0) + 1);
    }
  }
  const topFired = [...fireCount.entries()]
    .map(([knowledge_id, fires]) => ({
      knowledge_id,
      trigger: triggerById.get(knowledge_id) ?? "(已删)",
      fires,
    }))
    .sort((a, b) => b.fires - a.fires)
    .slice(0, 5);

  const deltaById = new Map<string, number>();
  for (const e of events) {
    if (
      e.kind === "calibrator.adjusted" &&
      e.knowledge_id &&
      typeof e.confidence_before === "number" &&
      typeof e.confidence_after === "number"
    ) {
      const d = e.confidence_after - e.confidence_before;
      deltaById.set(e.knowledge_id, (deltaById.get(e.knowledge_id) ?? 0) + d);
    }
  }
  const topConfidenceGain = [...deltaById.entries()]
    .map(([knowledge_id, totalDelta]) => ({
      knowledge_id,
      trigger: triggerById.get(knowledge_id) ?? "(已删)",
      totalDelta,
    }))
    .sort((a, b) => Math.abs(b.totalDelta) - Math.abs(a.totalDelta))
    .slice(0, 5);

  const archivedCount = allEntries.filter((e) => e.status === "archived").length;

  const md = renderDogfoodReport({
    now,
    personal,
    team: [],
    global,
    events,
    timeline,
    topFired,
    topConfidenceGain,
    archivedCount,
  });

  fs.mkdirSync(path.dirname(paths.outputPath), { recursive: true });
  fs.writeFileSync(paths.outputPath, md, "utf-8");

  return {
    outputPath: paths.outputPath,
    totalEntries: allEntries.length,
    totalEvents: events.length,
    scopes: { personal: personal.length, team: 0, global: global.length },
    topFired,
    topConfidenceGain,
    archivedCount,
  };
}

interface RenderInput {
  now: Date;
  personal: KnowledgeEntry[];
  team: KnowledgeEntry[];
  global: KnowledgeEntry[];
  events: PersistedEvent[];
  timeline: Array<{ hash: string; date: string; message: string }>;
  topFired: Array<{ knowledge_id: string; trigger: string; fires: number }>;
  topConfidenceGain: Array<{
    knowledge_id: string;
    trigger: string;
    totalDelta: number;
  }>;
  archivedCount: number;
}

export function renderDogfoodReport(input: RenderInput): string {
  const { now, personal, team, global, events, timeline, topFired, topConfidenceGain, archivedCount } =
    input;
  const all = [...personal, ...team, ...global];
  const active = all.filter((e) => e.status === "active");

  const byCategory: Record<string, number> = { C: 0, E: 0, S: 0, K: 0 };
  for (const e of active) byCategory[e.category] = (byCategory[e.category] ?? 0) + 1;

  const eventKinds: Record<string, number> = {};
  for (const e of events) eventKinds[e.kind] = (eventKinds[e.kind] ?? 0) + 1;

  const corrections = events.filter((e) => /^hook-pre/.test(e.kind)).length;
  const calibrations = events.filter((e) => e.kind === "calibrator.adjusted").length;

  const lines: string[] = [];
  lines.push("# TeamAgent 自举报告（Phase 2）");
  lines.push("");
  lines.push(`> 生成时间: ${now.toISOString()}`);
  lines.push("> 数据完全来自系统自身：events.db + knowledge.db + git log");
  lines.push("> 由 `teamagent dogfood-report` 自动生成，未经人工修饰");
  lines.push("");

  lines.push("## 一句话结论");
  lines.push("");
  lines.push(
    `Phase 2 期间累计积累 **${all.length} 条知识**（${active.length} 条活跃${archivedCount > 0 ? `、${archivedCount} 条自动归档` : ""}），` +
      `Hook 拦截 **${corrections} 次**，Calibrator 调整 **${calibrations} 次**。`,
  );
  lines.push("");

  lines.push("## 知识库");
  lines.push("");
  lines.push("| 维度 | 值 |");
  lines.push("|------|----|");
  lines.push(`| 总条目 | ${all.length} |`);
  lines.push(`| 活跃 | ${active.length} |`);
  lines.push(`| 自动归档 | ${archivedCount} |`);
  lines.push(`| personal | ${personal.length} |`);
  lines.push(`| global | ${global.length} |`);
  lines.push(`| C 代码层 | ${byCategory.C} |`);
  lines.push(`| E 工程层 | ${byCategory.E} |`);
  lines.push(`| S 策略层 | ${byCategory.S} |`);
  lines.push(`| K 认知层 | ${byCategory.K} |`);
  lines.push("");

  lines.push("## Hook 干预统计");
  lines.push("");
  lines.push("| 事件类型 | 次数 |");
  lines.push("|---------|------|");
  for (const [k, v] of Object.entries(eventKinds).sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${k} | ${v} |`);
  }
  lines.push("");

  lines.push(`## 命中频次 Top ${topFired.length}`);
  lines.push("");
  if (topFired.length === 0) {
    lines.push("(暂无命中记录)");
  } else {
    lines.push("| # | 命中数 | trigger | id |");
    lines.push("|---|-------|---------|-----|");
    topFired.forEach((r, i) => {
      lines.push(
        `| ${i + 1} | ${r.fires} | ${r.trigger.slice(0, 60)} | ${r.knowledge_id} |`,
      );
    });
  }
  lines.push("");

  lines.push(`## Confidence 变化 Top ${topConfidenceGain.length}`);
  lines.push("");
  if (topConfidenceGain.length === 0) {
    lines.push("(暂无校准记录——尚未跑过 calibrate)");
  } else {
    lines.push("| # | Δconfidence | trigger | id |");
    lines.push("|---|------------|---------|-----|");
    topConfidenceGain.forEach((r, i) => {
      const sign = r.totalDelta > 0 ? "+" : "";
      lines.push(
        `| ${i + 1} | ${sign}${r.totalDelta.toFixed(2)} | ${r.trigger.slice(0, 60)} | ${r.knowledge_id} |`,
      );
    });
  }
  lines.push("");

  lines.push("## Phase 2 git 时间线");
  lines.push("");
  if (timeline.length === 0) {
    lines.push("(无 git 历史)");
  } else {
    const milestones = timeline.filter((c) =>
      /^(feat|fix|chore|test|docs|ci)\((m[0-9]+|stage0|compiler|hotfix)\)/.test(
        c.message,
      ),
    );
    lines.push("| date | hash | message |");
    lines.push("|------|------|---------|");
    for (const c of milestones.slice(0, 30)) {
      lines.push(`| ${c.date} | ${c.hash} | ${c.message.slice(0, 80)} |`);
    }
  }
  lines.push("");

  lines.push("## 关于这份报告");
  lines.push("");
  lines.push(
    "Phase 2 设计意图：系统**自动生成**一份报告，作为对 'TeamAgent 是否真有用' 这个问题的**第三方独立证据**——所有数字来自磁盘上的 SQLite DB，没人手动改。",
  );

  return lines.join("\n") + "\n";
}

export function parseDogfoodReportArgs(argv: string[]): DogfoodReportOptions {
  const opts: DogfoodReportOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--output" && argv[i + 1]) {
      opts.outputPath = argv[i + 1];
      i++;
    } else if (a.startsWith("--output=")) {
      opts.outputPath = a.slice("--output=".length);
    }
  }
  return opts;
}
