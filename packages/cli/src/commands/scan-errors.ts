import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import {
  ClaudeSessionSource,
  ClaudeCodeLLMClient,
  SqliteEventLog,
  SqliteCandidateQueue,
  CompositeErrorSignalCollector,
  openDb,
} from "@teamagent/adapters";
import type { PersistedEvent } from "@teamagent/types";
import {
  filterSignals,
  buildErrorBatches,
} from "@teamagent/core";
import type { LLMClient } from "@teamagent/ports";
import type { KnowledgeEntry, ParsedSession } from "@teamagent/types";

export interface ScanErrorsOptions {
  mode: "efficient" | "full";
  sinceRaw?: string;
  minFreq: number;
  dryRun: boolean;
  quiet: boolean;
  homeDir?: string;
  projectsRoot?: string;
  eventsDbPath?: string;
  candidatesDbPath?: string;
  llmClient?: LLMClient;
  now?: () => Date;
}

const SCAN_STATE_FILENAME = "scan-state.json";

export function resolveSince(sinceRaw: string | undefined, homeDir: string, now: Date): Date {
  if (!sinceRaw) {
    const statePath = path.join(homeDir, ".teamagent", SCAN_STATE_FILENAME);
    try {
      const state = JSON.parse(fs.readFileSync(statePath, "utf-8")) as Record<string, unknown>;
      if (state.lastScanAt) return new Date(String(state.lastScanAt));
    } catch {
      // default: 24h ago
    }
    return new Date(now.getTime() - 24 * 60 * 60 * 1000);
  }
  if (/^\d+h$/.test(sinceRaw)) {
    const hours = parseInt(sinceRaw, 10);
    return new Date(now.getTime() - hours * 60 * 60 * 1000);
  }
  if (/^\d+d$/.test(sinceRaw)) {
    const days = parseInt(sinceRaw, 10);
    return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  }
  const d = new Date(sinceRaw);
  if (isNaN(d.getTime())) {
    throw new Error(
      `--since 格式无效: "${sinceRaw}"。接受格式: "24h"（小时）、"7d"（天）或 ISO 日期 "2026-01-01"`,
    );
  }
  return d;
}

function saveScanState(homeDir: string, now: Date, mode: string): void {
  const dir = path.join(homeDir, ".teamagent");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, SCAN_STATE_FILENAME),
    JSON.stringify({ lastScanAt: now.toISOString(), lastScanMode: mode }, null, 2),
  );
}

function validateAndBuildEntry(
  raw: Record<string, unknown>,
  id: string,
  now: Date,
): KnowledgeEntry | null {
  const { category, tags, type, nature, trigger, wrong_pattern, correct_pattern, reasoning } = raw;
  if (!["C", "E", "S", "K"].includes(String(category))) return null;
  if (!["avoidance", "practice"].includes(String(type))) return null;
  if (!["objective", "subjective"].includes(String(nature))) return null;
  if (typeof trigger !== "string" || !trigger.trim()) return null;
  if (typeof correct_pattern !== "string" || !correct_pattern.trim()) return null;
  if (typeof reasoning !== "string" || !reasoning.trim()) return null;

  const ts = now.toISOString();
  return {
    id,
    scope: { level: "personal" },
    category: category as "C" | "E" | "S" | "K",
    tags: Array.isArray(tags)
      ? (tags as unknown[]).filter((t): t is string => typeof t === "string")
      : [],
    type: type as "avoidance" | "practice",
    nature: nature as "objective" | "subjective",
    trigger: String(trigger).trim(),
    wrong_pattern: typeof wrong_pattern === "string" ? wrong_pattern : "",
    correct_pattern: String(correct_pattern).trim(),
    reasoning: String(reasoning).trim(),
    confidence: 0.5,
    enforcement: "suggest",
    status: "active",
    hit_count: 0,
    success_count: 0,
    override_count: 0,
    evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
    created_at: ts,
    last_hit_at: "",
    last_validated_at: ts,
    source: "accumulated",
    conflict_with: [],
    current_tier: "experimental",
    max_tier_ever: "experimental",
    tier_entered_at: "",
    demerit: 0,
    demerit_last_updated: "",
    resurrect_count: 0,
  };
}

export async function executeScanErrors(
  opts: ScanErrorsOptions = { mode: "efficient", minFreq: 2, dryRun: false, quiet: false },
): Promise<string> {
  const home = opts.homeDir ?? os.homedir();
  const now = opts.now ? opts.now() : new Date();
  const since = resolveSince(opts.sinceRaw, home, now);
  const projectsRoot = opts.projectsRoot ?? path.join(home, ".claude", "projects");
  const eventsDbPath = opts.eventsDbPath ?? path.join(home, ".teamagent", "events.db");
  const candidatesDbPath =
    opts.candidatesDbPath ?? path.join(home, ".teamagent", "candidates.db");

  // Read events
  let events: ReturnType<SqliteEventLog["readAll"]> = [];
  if (fs.existsSync(eventsDbPath)) {
    const eventLog = new SqliteEventLog(openDb(eventsDbPath));
    events = eventLog.readAll();
    eventLog.close();
  }

  // Read recent sessions
  const sessions: ParsedSession[] = [];
  try {
    const src = new ClaudeSessionSource(projectsRoot);
    const recent = await src.listRecent(20);
    for (const meta of recent) {
      if (meta.startTime < since.toISOString()) continue;
      try {
        sessions.push(await src.loadById(meta.sessionId));
      } catch {
        // skip individual failures
      }
    }
  } catch {
    // projects dir doesn't exist
  }

  // Collect signals
  const collector = new CompositeErrorSignalCollector({ events, sessions, since, now });
  let signals = await collector.collect(since);

  // Efficient mode: pre-filter
  if (opts.mode === "efficient") {
    signals = filterSignals(signals, {
      weightThreshold: 0.3,
      minSessions: opts.minFreq,
    });
  }

  if (signals.length === 0) {
    if (!opts.quiet) return "📭 无新错误信号，知识库无需更新。\n";
    return "";
  }

  const batches = buildErrorBatches(signals);

  const lines: string[] = [];
  lines.push(`🔍 scan-errors [${opts.mode} mode] — since ${since.toISOString()}`);
  lines.push(`  信号数: ${signals.length}，批次数: ${batches.length}`);
  lines.push("");

  if (opts.dryRun) {
    for (const batch of batches) {
      lines.push(`  [dry-run] category=${batch.category} signals=${batch.signals.length}`);
      for (const s of batch.signals) {
        lines.push(
          `    - [${s.signalType}] w=${s.weight.toFixed(2)} ${s.context.slice(0, 80)}`,
        );
      }
    }
    lines.push("");
    lines.push("  (dry-run 模式，未写入候选队列)");
    return lines.join("\n") + "\n";
  }

  // LLM extraction
  const llm = opts.llmClient ?? new ClaudeCodeLLMClient();
  fs.mkdirSync(path.dirname(candidatesDbPath), { recursive: true });
  const queueDb = openDb(candidatesDbPath);
  const queue = new SqliteCandidateQueue(queueDb);

  let totalCandidates = 0;

  for (const batch of batches) {
    let rawResponse: string;
    try {
      rawResponse = await llm.complete(batch.prompt);
    } catch (e) {
      lines.push(
        `  ⚠ LLM 调用失败 (category=${batch.category}): ${String(e).slice(0, 100)}`,
      );
      continue;
    }

    let entries: Array<Record<string, unknown>> = [];
    try {
      const fenced = rawResponse.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      const json = fenced ? fenced[1]!.trim() : rawResponse.trim();
      const parsed: unknown = JSON.parse(json);
      if (Array.isArray(parsed)) entries = parsed as Array<Record<string, unknown>>;
    } catch {
      lines.push(`  ⚠ LLM 响应解析失败 (category=${batch.category})`);
      continue;
    }

    for (const raw of entries) {
      const ts = now.toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
      const rand = Math.random().toString(36).slice(2, 8);
      const candidateId = `cand-${ts}-${rand}`;
      const entryId = `pers-${ts}-${rand}`;

      const entry = validateAndBuildEntry(raw, entryId, now);
      if (!entry) continue;

      const sourceDesc = batch.signals
        .map((s) => `${s.signalType}×${s.sessionIds.length}`)
        .join(", ");

      queue.enqueue([{ id: candidateId, entry, sourceSignals: sourceDesc }]);
      totalCandidates++;
    }
  }

  queueDb.close();
  saveScanState(home, now, opts.mode);

  // Emit error.candidate.added event
  if (totalCandidates > 0 && fs.existsSync(eventsDbPath)) {
    try {
      const eventLog = new SqliteEventLog(openDb(eventsDbPath));
      const addedEvent: PersistedEvent = {
        id: `ev-cand-added-${now.getTime()}`,
        kind: "error.candidate.added",
        timestamp: now.toISOString(),
        schema_version: 1,
      } as PersistedEvent & { count: number };
      (addedEvent as any).count = totalCandidates;
      eventLog.append(addedEvent);
      eventLog.close();
    } catch {
      // non-fatal
    }
  }

  lines.push(`  ✓ 新增候选规则: ${totalCandidates} 条`);
  if (totalCandidates > 0) {
    lines.push(`  运行 teamagent review-candidates 审核`);
  }

  return lines.join("\n") + "\n";
}

export function parseScanErrorsArgs(argv: string[]): ScanErrorsOptions {
  const opts: ScanErrorsOptions = {
    mode: "efficient",
    minFreq: 2,
    dryRun: false,
    quiet: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--mode" && argv[i + 1]) {
      const v = argv[++i]!;
      if (v === "full" || v === "efficient") opts.mode = v;
      else throw new Error(`--mode 必须是 "efficient" 或 "full"，收到: "${v}"`);
    } else if (a.startsWith("--mode=")) {
      const v = a.slice("--mode=".length);
      if (v === "full" || v === "efficient") opts.mode = v;
      else throw new Error(`--mode 必须是 "efficient" 或 "full"，收到: "${v}"`);
    } else if (a === "--min-freq" && argv[i + 1]) {
      const v = parseInt(argv[++i]!, 10);
      if (isNaN(v)) throw new Error(`--min-freq 必须是整数，收到: "${argv[i]}"`);
      opts.minFreq = v;
    } else if (a.startsWith("--min-freq=")) {
      const v = parseInt(a.slice("--min-freq=".length), 10);
      if (isNaN(v)) throw new Error(`--min-freq 必须是整数，收到: "${a.slice("--min-freq=".length)}"`);
      opts.minFreq = v;
    } else if (a === "--dry-run") {
      opts.dryRun = true;
    } else if (a === "--quiet") {
      opts.quiet = true;
    } else if (a === "--since" && argv[i + 1]) {
      opts.sinceRaw = argv[++i];
    } else if (a.startsWith("--since=")) {
      opts.sinceRaw = a.slice("--since=".length);
    }
  }
  return opts;
}
