#!/usr/bin/env tsx
/**
 * M4-A reclassify script — LLM-batch classifies each active knowledge rule
 * into one of four channels: tool-action / ai-narrative / user-input /
 * passive-knowledge.
 *
 * Produces a JSON plan + markdown report under scripts/out/. Apply via
 * `teamagent reclassify apply --plan <file>`.
 *
 * LLM: `claude -p <prompt>` subprocess. If unavailable, falls back to a
 * simple heuristic (ASCII vs non-ASCII, bracketed tags vs bare text).
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");

type Channel = "tool-action" | "ai-narrative" | "user-input" | "passive-knowledge";

interface RawRule {
  id: string;
  wrong_pattern: string;
  correct_pattern: string;
  reasoning: string;
  trigger: string;
  channel: string | null;
  enforcement: string;
  status: string;
}

interface Classification {
  channel: Channel;
  confidence: number;
  reason: string;
}

interface PlanEntry {
  id: string;
  wrong_pattern: string;
  old_channel: Channel;
  new_channel: Channel;
  old_enforcement: string;
  new_enforcement: string;
  confidence: number;
  reason: string;
}

const PROMPT = [
  "You classify a TeamAgent rule into ONE of four channels.",
  "",
  "- tool-action: wrong_pattern is a literal string appearing in a TOOL CALL argument (bash command, file path, url, edit content). Examples: \"npm install moment\", \"--dangerously-skip-permissions\", \"rm -rf\".",
  "- ai-narrative: wrong_pattern is a phrase the AI says in its assistant message, not a tool call. Often about claiming completion, waiting, hedging. Examples: phrases in Chinese about being done or waiting.",
  "- user-input: wrong_pattern is a token/tag that appears in CONTENT FED INTO THE AI (user prompt, system noise). Examples: \"<local-command-caveat>\", \"<system-reminder>\".",
  "- passive-knowledge: abstract/meta-cognitive principle without a concrete literal keyword. wrong_pattern may be empty or verbose prose. Examples: workflow principles, mindset rules, anything without a match-ready string.",
  "",
  "Output JSON on one line: {\"channel\": \"...\", \"confidence\": 0.0-1.0, \"reason\": \"...\"}. Output JSON ONLY. No markdown, no prose.",
].join("\n");

function claudeAvailable(): boolean {
  const test = spawnSync("claude", ["--version"], {
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 5000,
  });
  return test.status === 0;
}

function classifyViaLLM(rule: RawRule): Classification | null {
  const body = [
    "RULE:",
    `  wrong_pattern: ${JSON.stringify(rule.wrong_pattern)}`,
    `  correct_pattern: ${JSON.stringify(rule.correct_pattern)}`,
    `  reasoning: ${JSON.stringify(rule.reasoning)}`,
    `  trigger: ${JSON.stringify(rule.trigger)}`,
  ].join("\n");
  const r = spawnSync("claude", ["-p", `${PROMPT}\n\n${body}`], {
    encoding: "utf8",
    timeout: 60_000,
  });
  if (r.status !== 0 || !r.stdout) return null;
  try {
    const txt = r.stdout.trim();
    const m = txt.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(m ? m[0] : txt);
    if (
      ["tool-action", "ai-narrative", "user-input", "passive-knowledge"].includes(parsed.channel)
    ) {
      return {
        channel: parsed.channel as Channel,
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
        reason: String(parsed.reason || ""),
      };
    }
  } catch {
    /* fall through to heuristic */
  }
  return null;
}

function classifyViaHeuristic(rule: RawRule): Classification {
  const wp = (rule.wrong_pattern || "").trim();
  if (!wp) {
    return { channel: "passive-knowledge", confidence: 0.85, reason: "empty wrong_pattern" };
  }
  if (/^<[^>]+>$/.test(wp) || wp.includes("<system-") || wp.includes("<local-")) {
    return { channel: "user-input", confidence: 0.75, reason: "tag-like bracketed token" };
  }
  // Non-ASCII heavy (>50% non-ascii chars) → likely Chinese narrative
  const nonAsciiRatio =
    [...wp].filter((c) => c.charCodeAt(0) > 127).length / wp.length;
  if (nonAsciiRatio > 0.5) {
    return { channel: "ai-narrative", confidence: 0.65, reason: "non-ASCII phrase likely narrative" };
  }
  // Long English phrase (>40 chars, has spaces) → likely narrative too
  if (wp.length > 40 && wp.includes(" ")) {
    return { channel: "ai-narrative", confidence: 0.55, reason: "long English phrase" };
  }
  return { channel: "tool-action", confidence: 0.5, reason: "ascii literal, default tool-action" };
}

function classifyOne(rule: RawRule, useLLM: boolean): Classification {
  if (useLLM) {
    const r = classifyViaLLM(rule);
    if (r) return r;
  }
  return classifyViaHeuristic(rule);
}

function downgradeEnforcement(enf: string, ch: Channel): string {
  if (ch === "tool-action") return enf;
  if (ch === "passive-knowledge") return "passive";
  if (ch === "user-input") return enf === "block" || enf === "warn" ? "suggest" : enf;
  if (ch === "ai-narrative") return enf === "block" ? "warn" : enf;
  return enf;
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

function renderReport(plan: PlanEntry[], total: number): string {
  const lines: string[] = [];
  lines.push(`# Reclassification Report`);
  lines.push("");
  lines.push(`Total active rules scanned: ${total}`);
  lines.push(`Changes proposed: ${plan.length}`);
  lines.push("");

  const byChannel: Record<string, number> = {};
  for (const p of plan) byChannel[p.new_channel] = (byChannel[p.new_channel] || 0) + 1;
  lines.push(`## Target distribution (changes only)`);
  lines.push("");
  for (const [k, v] of Object.entries(byChannel).sort()) lines.push(`- ${k}: ${v}`);
  lines.push("");

  const high = plan.filter((p) => p.confidence >= 0.7);
  const low = plan.filter((p) => p.confidence < 0.7);

  lines.push(`## High confidence (>= 0.7, auto-apply candidates) — ${high.length} rules`);
  lines.push("");
  lines.push(`| id | wrong_pattern | channel | enforcement | conf | reason |`);
  lines.push(`|----|---------------|---------|-------------|------|--------|`);
  for (const p of high) {
    lines.push(
      `| ${p.id} | ${truncate(p.wrong_pattern, 40).replace(/\|/g, "\\|")} | ${p.old_channel} → ${p.new_channel} | ${p.old_enforcement} → ${p.new_enforcement} | ${p.confidence.toFixed(2)} | ${truncate(p.reason, 40)} |`,
    );
  }
  lines.push("");

  lines.push(`## Needs human review (< 0.7) — ${low.length} rules`);
  lines.push("");
  lines.push(`| id | wrong_pattern | suggested channel | conf | reason |`);
  lines.push(`|----|---------------|-------------------|------|--------|`);
  for (const p of low) {
    lines.push(
      `| ${p.id} | ${truncate(p.wrong_pattern, 40).replace(/\|/g, "\\|")} | ${p.new_channel} | ${p.confidence.toFixed(2)} | ${truncate(p.reason, 40)} |`,
    );
  }
  return lines.join("\n");
}

function main() {
  const projectDb = path.join(process.cwd(), ".teamagent", "knowledge.db");
  if (!fs.existsSync(projectDb)) {
    console.error(`knowledge.db not found at ${projectDb}`);
    process.exit(1);
  }
  const db = new DatabaseSync(projectDb);

  // ensure channel column exists (idempotent)
  try {
    db.exec("ALTER TABLE knowledge ADD COLUMN channel TEXT NOT NULL DEFAULT 'tool-action'");
  } catch { /* already exists */ }

  const rows = db
    .prepare(
      `SELECT id, wrong_pattern, correct_pattern, reasoning, trigger, channel, enforcement, status
       FROM knowledge WHERE status = 'active'`,
    )
    .all() as unknown as RawRule[];
  db.close();

  const useLLM = claudeAvailable();
  console.error(`[reclassify] scanning ${rows.length} active rules (LLM=${useLLM ? "on" : "off, heuristic only"})`);

  const plan: PlanEntry[] = [];
  let i = 0;
  for (const rule of rows) {
    i++;
    const wpPreview = (rule.wrong_pattern || "").slice(0, 40);
    process.stderr.write(`[${i}/${rows.length}] ${rule.id} ${wpPreview}\n`);
    const res = classifyOne(rule, useLLM);
    const oldChannel = (rule.channel ?? "tool-action") as Channel;
    if (res.channel === oldChannel && rule.enforcement === downgradeEnforcement(rule.enforcement, res.channel)) {
      continue;
    }
    const newEnf = downgradeEnforcement(rule.enforcement, res.channel);
    plan.push({
      id: rule.id,
      wrong_pattern: rule.wrong_pattern,
      old_channel: oldChannel,
      new_channel: res.channel,
      old_enforcement: rule.enforcement,
      new_enforcement: newEnf,
      confidence: res.confidence,
      reason: res.reason,
    });
  }

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.join(process.cwd(), "scripts", "out");
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, `reclassify-${ts}.json`);
  const mdPath = path.join(outDir, `reclassify-${ts}.md`);
  fs.writeFileSync(jsonPath, JSON.stringify({ plan, generated_at: new Date().toISOString(), llm: useLLM }, null, 2));
  fs.writeFileSync(mdPath, renderReport(plan, rows.length));

  console.error("");
  console.error(`Report: ${mdPath}`);
  console.error(`Plan:   ${jsonPath}`);
  console.error(`Apply:  pnpm teamagent reclassify apply --plan ${jsonPath}`);
}

main();
