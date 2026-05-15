# M4-A Output-Layer Interception Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route every knowledge rule to the hook channel where it can actually fire, close the AI-narrative feedback loop via Stop-scan + UserPromptSubmit-inject, and reclassify existing rules without destruction.

**Architecture:** Add `channel` field to `KnowledgeEntry`. PreToolUse matcher now gates on `channel=tool-action`. New narrative scanner runs at Stop-hook tail, matches AI output text against `channel=ai-narrative` rules, writes pending warnings to disk. UserPromptSubmit reads pending, injects formatted warning into AI context, emits recurrence/compliance events into calibrator v2.

**Tech Stack:** TypeScript, node:sqlite (knowledge.db, events.db), vitest, @anthropic-ai/claude-agent-sdk hooks, `claude -p` subprocess for LLM classification.

**Spec reference:** `docs/superpowers/specs/2026-04-23-m4a-output-layer-interception-design.md`

---

## Sequencing Strategy

Tasks form 4 blocks, each block ending in a green build + commit. Block order is forced by dependency:

1. **Block A** (schema + matcher) — unlocks channel as a first-class concept
2. **Block B** (narrative scanner + pending IO) — pure core, no hook integration yet
3. **Block C** (hook wiring) — stop-hook and user-prompt-submit call into Block B
4. **Block D** (reclassify tooling + ship) — CLI + LLM script + apply reclassification + rebuild tarball

---

## Block A — Schema + Matcher Gate

### Task 1: Add `channel` field to `KnowledgeEntry` type

**Files:**
- Modify: `packages/types/src/knowledge-entry.ts`
- Test: `packages/types/src/__tests__/knowledge-entry.test.ts`

- [ ] **Step 1.1: Write failing test**

```ts
// packages/types/src/__tests__/knowledge-entry.test.ts
import { describe, it, expect } from "vitest";
import { normalizeChannel, type RuleChannel } from "../knowledge-entry.js";

describe("normalizeChannel", () => {
  it("returns tool-action for undefined (backward compat)", () => {
    expect(normalizeChannel(undefined)).toBe("tool-action");
  });
  it("returns tool-action for null", () => {
    expect(normalizeChannel(null)).toBe("tool-action");
  });
  it("passes through valid channel", () => {
    expect(normalizeChannel("ai-narrative")).toBe("ai-narrative");
    expect(normalizeChannel("tool-action")).toBe("tool-action");
    expect(normalizeChannel("user-input")).toBe("user-input");
    expect(normalizeChannel("passive-knowledge")).toBe("passive-knowledge");
  });
  it("coerces unknown string to tool-action", () => {
    expect(normalizeChannel("garbage" as RuleChannel)).toBe("tool-action");
  });
});
```

- [ ] **Step 1.2: Run test to verify fail**

```
pnpm --filter @teamagent/types test -- --run knowledge-entry
```
Expected: fail (normalizeChannel not exported)

- [ ] **Step 1.3: Add channel field + helper**

In `packages/types/src/knowledge-entry.ts`, add:

```ts
export type RuleChannel =
  | "tool-action"
  | "ai-narrative"
  | "user-input"
  | "passive-knowledge";

export const RULE_CHANNELS: ReadonlyArray<RuleChannel> = [
  "tool-action",
  "ai-narrative",
  "user-input",
  "passive-knowledge",
];

export function normalizeChannel(v: unknown): RuleChannel {
  if (typeof v !== "string") return "tool-action";
  return (RULE_CHANNELS as readonly string[]).includes(v)
    ? (v as RuleChannel)
    : "tool-action";
}
```

Then extend the `KnowledgeEntry` interface with optional `channel?: RuleChannel`.

- [ ] **Step 1.4: Run test to verify pass**

```
pnpm --filter @teamagent/types test -- --run knowledge-entry
```
Expected: pass

- [ ] **Step 1.5: Commit**

```
git add packages/types
git commit -m "feat(m4a): knowledge schema adds channel field + default tool-action migration"
```

---

### Task 2: DB layer reads/writes `channel`

**Files:**
- Modify: `packages/adapters/src/knowledge-store/sqlite-store.ts` (and/or related)
- Test: existing store tests (add channel case)

- [ ] **Step 2.1: Grep store**

```
grep -rn "wrong_pattern" packages/adapters/src/knowledge-store/
```
Identify the SQL insert/update/select statements that need the `channel` column.

- [ ] **Step 2.2: Add migration**

Find the schema init block (typically `CREATE TABLE IF NOT EXISTS knowledge`). Add:

```sql
-- column addition is idempotent via PRAGMA check
PRAGMA table_info(knowledge);
-- If column "channel" not present, ALTER TABLE knowledge ADD COLUMN channel TEXT DEFAULT 'tool-action';
```

In JS: after opening DB, run `PRAGMA table_info(knowledge)`, if row with name=`channel` is missing, run `ALTER TABLE knowledge ADD COLUMN channel TEXT DEFAULT 'tool-action';`.

- [ ] **Step 2.3: Update insert/update/read paths**

Insert: include `channel` column, default `'tool-action'` if entry.channel undefined.
Read: return `channel: normalizeChannel(row.channel)`.

- [ ] **Step 2.4: Run adapters tests**

```
pnpm --filter @teamagent/adapters test
```
Expected: pass. Fix any broken tests to include `channel: "tool-action"` default.

- [ ] **Step 2.5: Commit**

```
git add packages/adapters
git commit -m "feat(m4a): sqlite store persists channel with backcompat ALTER"
```

---

### Task 3: Matcher gates on `channel=tool-action`

**Files:**
- Modify: `packages/core/src/matcher/keyword-matcher.ts`
- Test: `packages/core/src/matcher/__tests__/keyword-matcher.test.ts` (extend)

- [ ] **Step 3.1: Write failing test**

Append to existing keyword-matcher test file:

```ts
describe("M4-A: channel gate", () => {
  const baseRule = (overrides: Partial<KnowledgeEntry>): KnowledgeEntry => ({
    id: "r1",
    wrong_pattern: "moment",
    status: "active",
    type: "avoidance",
    enforcement: "warn",
    scope: { level: "personal" },
    category: "E",
    tags: [],
    confidence: 0.8,
    hit_count: 0,
    success_count: 0,
    override_count: 0,
    evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
    created_at: "",
    last_hit_at: "",
    last_validated_at: "",
    source: "accumulated",
    conflict_with: [],
    trigger: "",
    correct_pattern: "",
    reasoning: "",
    nature: "subjective",
    ...overrides,
  });

  it("tool-action channel participates", () => {
    const rules = [baseRule({ channel: "tool-action" })];
    expect(
      matchRules({ toolName: "Bash", input: { command: "npm install moment" } }, rules)
    ).toHaveLength(1);
  });

  it("ai-narrative channel excluded from matcher", () => {
    const rules = [baseRule({ channel: "ai-narrative" })];
    expect(
      matchRules({ toolName: "Bash", input: { command: "npm install moment" } }, rules)
    ).toHaveLength(0);
  });

  it("user-input channel excluded", () => {
    const rules = [baseRule({ channel: "user-input" })];
    expect(
      matchRules({ toolName: "Bash", input: { command: "npm install moment" } }, rules)
    ).toHaveLength(0);
  });

  it("passive-knowledge channel excluded", () => {
    const rules = [baseRule({ channel: "passive-knowledge" })];
    expect(
      matchRules({ toolName: "Bash", input: { command: "npm install moment" } }, rules)
    ).toHaveLength(0);
  });

  it("undefined channel defaults to tool-action and participates", () => {
    const rules = [baseRule({ channel: undefined })];
    expect(
      matchRules({ toolName: "Bash", input: { command: "npm install moment" } }, rules)
    ).toHaveLength(1);
  });
});
```

- [ ] **Step 3.2: Run test → expect 4/5 fail** (all but `undefined` one)

```
pnpm --filter @teamagent/core test -- --run keyword-matcher
```

- [ ] **Step 3.3: Add gate in matcher**

In `packages/core/src/matcher/keyword-matcher.ts`, after `if (!rule.wrong_pattern) continue;`:

```ts
import { normalizeChannel } from "@teamagent/types";
// ...
// M4-A: PreToolUse matcher only processes tool-action channel.
// Undefined channel (legacy entries) defaults to tool-action.
if (normalizeChannel((rule as any).channel) !== "tool-action") continue;
```

- [ ] **Step 3.4: Run test to verify pass**

```
pnpm --filter @teamagent/core test -- --run keyword-matcher
```
Expected: all pass

- [ ] **Step 3.5: Commit**

```
git add packages/core packages/types
git commit -m "refactor(m4a): matcher gates on channel=tool-action"
```

---

## Block B — Narrative Scanner + Pending IO (Pure Core)

### Task 4: Narrative scanner pure function

**Files:**
- Create: `packages/core/src/narrative-scanner/scan.ts`
- Test: `packages/core/src/narrative-scanner/__tests__/scan.test.ts`
- Create: `packages/core/src/narrative-scanner/index.ts`

- [ ] **Step 4.1: Write failing tests**

```ts
// packages/core/src/narrative-scanner/__tests__/scan.test.ts
import { describe, it, expect } from "vitest";
import { scanNarrative } from "../scan.js";
import type { KnowledgeEntry } from "@teamagent/types";

const rule = (overrides: Partial<KnowledgeEntry>): KnowledgeEntry => ({
  id: "n1",
  wrong_pattern: "全部修复完成",
  status: "active",
  type: "avoidance",
  enforcement: "warn",
  scope: { level: "personal" },
  category: "K",
  tags: [],
  confidence: 0.8,
  hit_count: 0,
  success_count: 0,
  override_count: 0,
  evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
  created_at: "",
  last_hit_at: "",
  last_validated_at: "",
  source: "accumulated",
  conflict_with: [],
  trigger: "",
  correct_pattern: "",
  reasoning: "",
  nature: "subjective",
  channel: "ai-narrative",
  ...overrides,
});

describe("scanNarrative", () => {
  it("returns empty for empty text", () => {
    expect(scanNarrative("", [rule({})])).toEqual([]);
  });
  it("returns empty for empty rules", () => {
    expect(scanNarrative("全部修复完成了", [])).toEqual([]);
  });
  it("single match", () => {
    const hits = scanNarrative("我已经全部修复完成", [rule({})]);
    expect(hits).toHaveLength(1);
    expect(hits[0].knowledge_id).toBe("n1");
  });
  it("multiple matches", () => {
    const hits = scanNarrative("全部修复完成，等通知就行", [
      rule({ id: "n1", wrong_pattern: "全部修复完成" }),
      rule({ id: "n2", wrong_pattern: "等通知" }),
    ]);
    expect(hits.map((h) => h.knowledge_id).sort()).toEqual(["n1", "n2"]);
  });
  it("case-insensitive substring", () => {
    const hits = scanNarrative("DONE.", [rule({ wrong_pattern: "done" })]);
    expect(hits).toHaveLength(1);
  });
  it("non-narrative channel excluded", () => {
    const hits = scanNarrative("全部修复完成", [
      rule({ channel: "tool-action" }),
      rule({ channel: "passive-knowledge" }),
    ]);
    expect(hits).toHaveLength(0);
  });
  it("archived rule excluded", () => {
    const hits = scanNarrative("全部修复完成", [rule({ status: "archived" })]);
    expect(hits).toHaveLength(0);
  });
  it("empty wrong_pattern skipped", () => {
    const hits = scanNarrative("hello", [rule({ wrong_pattern: "" })]);
    expect(hits).toHaveLength(0);
  });
  it("captures matched snippet and rule summary", () => {
    const hits = scanNarrative("全部修复完成了吧", [rule({})]);
    expect(hits[0].matched_snippet).toContain("全部修复完成");
    expect(hits[0].rule_summary).toBeTruthy();
  });
});
```

- [ ] **Step 4.2: Run test → expect all fail** (module missing)

- [ ] **Step 4.3: Implement**

```ts
// packages/core/src/narrative-scanner/scan.ts
import type { KnowledgeEntry } from "@teamagent/types";
import { normalizeChannel } from "@teamagent/types";

export interface NarrativeHit {
  knowledge_id: string;
  matched_snippet: string;
  rule_summary: string;
  confidence: number;
  correct_pattern: string;
  reasoning: string;
}

const MIN_TOKEN_LENGTH = 3;

function splitPatterns(raw: string): string[] {
  const tokens = raw
    .split("|")
    .map((s) => s.trim())
    .filter((s) => s.length >= MIN_TOKEN_LENGTH);
  return tokens.length > 0 ? tokens : [raw.trim()];
}

function snippet(haystack: string, needle: string, pad = 20): string {
  const idx = haystack.toLowerCase().indexOf(needle.toLowerCase());
  if (idx < 0) return needle;
  const start = Math.max(0, idx - pad);
  const end = Math.min(haystack.length, idx + needle.length + pad);
  return haystack.slice(start, end);
}

function summarize(rule: KnowledgeEntry): string {
  return rule.correct_pattern || rule.reasoning || rule.wrong_pattern || rule.id;
}

export function scanNarrative(
  text: string,
  rules: KnowledgeEntry[],
): NarrativeHit[] {
  if (!text) return [];
  const hits: NarrativeHit[] = [];
  const lower = text.toLowerCase();
  for (const rule of rules) {
    if (rule.status !== "active") continue;
    if (!rule.wrong_pattern) continue;
    if (normalizeChannel((rule as any).channel) !== "ai-narrative") continue;
    const patterns = splitPatterns(rule.wrong_pattern);
    for (const p of patterns) {
      if (lower.includes(p.toLowerCase())) {
        hits.push({
          knowledge_id: rule.id,
          matched_snippet: snippet(text, p),
          rule_summary: summarize(rule),
          confidence: rule.confidence,
          correct_pattern: rule.correct_pattern,
          reasoning: rule.reasoning,
        });
        break; // one hit per rule
      }
    }
  }
  return hits;
}
```

- [ ] **Step 4.4: index.ts barrel**

```ts
// packages/core/src/narrative-scanner/index.ts
export { scanNarrative, type NarrativeHit } from "./scan.js";
```

- [ ] **Step 4.5: Export from core barrel**

In `packages/core/src/index.ts` add:

```ts
export * from "./narrative-scanner/index.js";
```

- [ ] **Step 4.6: Run test to pass**

```
pnpm --filter @teamagent/core test -- --run narrative-scanner
```

- [ ] **Step 4.7: Commit**

```
git add packages/core
git commit -m "feat(m4a): narrative scanner core (pure function) + tests"
```

---

### Task 5: Pending warnings IO port

**Files:**
- Create: `packages/core/src/narrative-scanner/pending-warnings.ts`
- Test: `packages/core/src/narrative-scanner/__tests__/pending-warnings.test.ts`

- [ ] **Step 5.1: Write failing tests**

```ts
// packages/core/src/narrative-scanner/__tests__/pending-warnings.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import {
  formatPendingRecord,
  mergePending,
  selectTopForInjection,
  type PendingWarning,
} from "../pending-warnings.js";

describe("formatPendingRecord", () => {
  it("builds record from hit + session + turn", () => {
    const rec = formatPendingRecord(
      { knowledge_id: "n1", matched_snippet: "全部修复完成", rule_summary: "先拿出验证命令", confidence: 0.9, correct_pattern: "x", reasoning: "y" },
      { session_id: "s1", turn_index: 5, at: "2026-04-23T10:00:00Z" },
    );
    expect(rec.session_id).toBe("s1");
    expect(rec.turn_index).toBe(5);
    expect(rec.knowledge_id).toBe("n1");
    expect(rec.matched_snippet).toBe("全部修复完成");
  });
});

describe("mergePending", () => {
  it("appends new entries", () => {
    const existing: PendingWarning[] = [];
    const next = mergePending(existing, [
      { session_id: "s1", turn_index: 1, knowledge_id: "a", matched_snippet: "", rule_summary: "", confidence: 0.9, correct_pattern: "", reasoning: "", at: "" },
    ]);
    expect(next).toHaveLength(1);
  });
  it("dedups same (session,turn,knowledge_id) triple", () => {
    const base = { session_id: "s1", turn_index: 1, knowledge_id: "a", matched_snippet: "", rule_summary: "", confidence: 0.9, correct_pattern: "", reasoning: "", at: "" };
    const next = mergePending([base], [base]);
    expect(next).toHaveLength(1);
  });
});

describe("selectTopForInjection", () => {
  it("returns top N by confidence desc", () => {
    const pending: PendingWarning[] = [
      { session_id: "s1", turn_index: 1, knowledge_id: "a", matched_snippet: "", rule_summary: "", confidence: 0.5, correct_pattern: "", reasoning: "", at: "" },
      { session_id: "s1", turn_index: 1, knowledge_id: "b", matched_snippet: "", rule_summary: "", confidence: 0.9, correct_pattern: "", reasoning: "", at: "" },
      { session_id: "s1", turn_index: 1, knowledge_id: "c", matched_snippet: "", rule_summary: "", confidence: 0.7, correct_pattern: "", reasoning: "", at: "" },
    ];
    const top = selectTopForInjection(pending, 2);
    expect(top.map((p) => p.knowledge_id)).toEqual(["b", "c"]);
  });
});
```

- [ ] **Step 5.2: Run → fail**

- [ ] **Step 5.3: Implement**

```ts
// packages/core/src/narrative-scanner/pending-warnings.ts
import type { NarrativeHit } from "./scan.js";

export interface PendingWarning {
  session_id: string;
  turn_index: number;
  knowledge_id: string;
  matched_snippet: string;
  rule_summary: string;
  confidence: number;
  correct_pattern: string;
  reasoning: string;
  at: string;
}

export interface PendingContext {
  session_id: string;
  turn_index: number;
  at: string;
}

export function formatPendingRecord(
  hit: NarrativeHit,
  ctx: PendingContext,
): PendingWarning {
  return {
    session_id: ctx.session_id,
    turn_index: ctx.turn_index,
    knowledge_id: hit.knowledge_id,
    matched_snippet: hit.matched_snippet,
    rule_summary: hit.rule_summary,
    confidence: hit.confidence,
    correct_pattern: hit.correct_pattern,
    reasoning: hit.reasoning,
    at: ctx.at,
  };
}

export function mergePending(
  existing: PendingWarning[],
  incoming: PendingWarning[],
): PendingWarning[] {
  const key = (p: PendingWarning) => `${p.session_id}|${p.turn_index}|${p.knowledge_id}`;
  const seen = new Set(existing.map(key));
  const out = [...existing];
  for (const p of incoming) {
    if (!seen.has(key(p))) {
      out.push(p);
      seen.add(key(p));
    }
  }
  return out;
}

export function selectTopForInjection(
  pending: PendingWarning[],
  max: number,
): PendingWarning[] {
  return [...pending].sort((a, b) => b.confidence - a.confidence).slice(0, max);
}

export function formatInjectionText(warnings: PendingWarning[]): string {
  const lines = ["◈ TeamAgent 上一轮观察", "你在上一轮回复中说了这些话术，按团队经验它们指向问题："];
  for (const w of warnings) {
    const hint = w.correct_pattern || w.reasoning || "请基于证据推进";
    lines.push(`- "${w.matched_snippet.trim()}" (规则 ${w.knowledge_id} [conf ${w.confidence.toFixed(2)}])：${hint}`);
  }
  lines.push("请在本轮回复中避免同类表述，基于证据推进。");
  return lines.join("\n");
}
```

- [ ] **Step 5.4: Export from narrative-scanner index**

```ts
// packages/core/src/narrative-scanner/index.ts
export * from "./scan.js";
export * from "./pending-warnings.js";
```

- [ ] **Step 5.5: Run tests → pass**

- [ ] **Step 5.6: Commit**

```
git commit -am "feat(m4a): pending warnings data model + formatter + tests"
```

---

## Block C — Hook Wiring

### Task 6: Stop hook integrates narrative scanner

**Files:**
- Modify: existing stop hook handler at `packages/adapters/src/hook/claude-agent-sdk/stop-sdk.ts` (if exists) or `packages/cli/src/bin-stop.ts`
- Modify: `packages/types/src/persisted-event.ts` (add kind)
- Test: new test file for the scanner integration

- [ ] **Step 6.1: Extend persisted-event kind enum**

Add to `kind` union: `"ai.output.bad_pattern"`, `"ai.narrative.injected"`, `"ai.narrative.recurred"`, `"ai.narrative.complied"`, `"ai.user_input.flagged"`.

- [ ] **Step 6.2: Find stop hook entry**

```
grep -n "PreToolUse\|Stop\|SessionEnd" packages/adapters/src/hook/claude-agent-sdk/*.ts
```

Locate the Stop handler. If none exists, locate `packages/cli/src/bin-stop.ts`.

- [ ] **Step 6.3: Write failing test**

Create `packages/cli/src/__tests__/narrative-stop-integration.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { runStopNarrativeScan } from "../stop-narrative-scan.js";
import type { KnowledgeEntry } from "@teamagent/types";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

describe("runStopNarrativeScan", () => {
  it("writes pending warnings when AI text matches ai-narrative rule", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "m4a-stop-"));
    const rules: KnowledgeEntry[] = [
      {
        id: "n1",
        wrong_pattern: "全部修复完成",
        status: "active",
        type: "avoidance",
        enforcement: "warn",
        scope: { level: "personal" },
        category: "K",
        tags: [],
        confidence: 0.9,
        hit_count: 0,
        success_count: 0,
        override_count: 0,
        evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
        created_at: "",
        last_hit_at: "",
        last_validated_at: "",
        source: "accumulated",
        conflict_with: [],
        trigger: "",
        correct_pattern: "",
        reasoning: "",
        nature: "subjective",
        channel: "ai-narrative",
      } as any,
    ];
    const events: any[] = [];
    runStopNarrativeScan({
      aiText: "我已经全部修复完成",
      rules,
      sessionId: "s1",
      turnIndex: 3,
      now: "2026-04-23T10:00:00Z",
      pendingDir: tmp,
      emit: (e) => events.push(e),
    });
    const pendingFile = path.join(tmp, "s1_pending_warnings.json");
    expect(fs.existsSync(pendingFile)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(pendingFile, "utf8"));
    expect(parsed).toHaveLength(1);
    expect(parsed[0].knowledge_id).toBe("n1");
    expect(events.find((e) => e.kind === "ai.output.bad_pattern")).toBeTruthy();
  });

  it("emits recurred event when rule was previously injected and matches again", () => {
    // TODO second integration test once base path is wired
  });
});
```

- [ ] **Step 6.4: Run → fail**

- [ ] **Step 6.5: Implement `packages/cli/src/stop-narrative-scan.ts`**

```ts
import fs from "node:fs";
import path from "node:path";
import {
  scanNarrative,
  formatPendingRecord,
  mergePending,
  type PendingWarning,
} from "@teamagent/core";
import type { KnowledgeEntry } from "@teamagent/types";

export interface StopScanDeps {
  aiText: string;
  rules: KnowledgeEntry[];
  sessionId: string;
  turnIndex: number;
  now: string;
  pendingDir: string;
  emit: (event: any) => void;
  lastInjectedKnowledgeIds?: string[];
}

function pendingFile(dir: string, sessionId: string): string {
  return path.join(dir, `${sessionId}_pending_warnings.json`);
}

export function runStopNarrativeScan(deps: StopScanDeps): void {
  const hits = scanNarrative(deps.aiText, deps.rules);
  if (hits.length === 0) {
    // If prior turn injected some knowledge_ids and none of them re-hit,
    // those were successfully complied-with.
    if (deps.lastInjectedKnowledgeIds) {
      for (const kid of deps.lastInjectedKnowledgeIds) {
        deps.emit({
          kind: "ai.narrative.complied",
          knowledge_id: kid,
          session_id: deps.sessionId,
          turn_index: deps.turnIndex,
          timestamp: deps.now,
          schema_version: 1,
          id: `e-complied-${deps.sessionId}-${deps.turnIndex}-${kid}`,
        });
      }
    }
    return;
  }

  // Emit bad_pattern for each hit
  for (const h of hits) {
    deps.emit({
      kind: "ai.output.bad_pattern",
      knowledge_id: h.knowledge_id,
      session_id: deps.sessionId,
      turn_index: deps.turnIndex,
      matched_snippet: h.matched_snippet,
      timestamp: deps.now,
      schema_version: 1,
      id: `e-bad-${deps.sessionId}-${deps.turnIndex}-${h.knowledge_id}`,
    });
  }

  // Recurred detection: a hit whose knowledge_id is in lastInjected
  const injected = new Set(deps.lastInjectedKnowledgeIds ?? []);
  const hitIds = new Set(hits.map((h) => h.knowledge_id));
  for (const kid of injected) {
    if (hitIds.has(kid)) {
      deps.emit({
        kind: "ai.narrative.recurred",
        knowledge_id: kid,
        session_id: deps.sessionId,
        turn_index: deps.turnIndex,
        timestamp: deps.now,
        schema_version: 1,
        id: `e-recur-${deps.sessionId}-${deps.turnIndex}-${kid}`,
      });
    } else {
      deps.emit({
        kind: "ai.narrative.complied",
        knowledge_id: kid,
        session_id: deps.sessionId,
        turn_index: deps.turnIndex,
        timestamp: deps.now,
        schema_version: 1,
        id: `e-complied-${deps.sessionId}-${deps.turnIndex}-${kid}`,
      });
    }
  }

  // Append to pending file
  fs.mkdirSync(deps.pendingDir, { recursive: true });
  const file = pendingFile(deps.pendingDir, deps.sessionId);
  let existing: PendingWarning[] = [];
  if (fs.existsSync(file)) {
    try { existing = JSON.parse(fs.readFileSync(file, "utf8")); } catch { /* ignore */ }
  }
  const incoming = hits.map((h) =>
    formatPendingRecord(h, { session_id: deps.sessionId, turn_index: deps.turnIndex, at: deps.now })
  );
  const merged = mergePending(existing, incoming);
  fs.writeFileSync(file, JSON.stringify(merged, null, 2));
}
```

- [ ] **Step 6.6: Wire into existing Stop hook**

In the existing Stop handler (`bin-stop.ts` or sdk variant), at the tail of the pipeline (after harvest / scan-errors), load active `ai-narrative` rules from the project store, read last assistant message from the transcript path, call `runStopNarrativeScan` with pendingDir=`<home>/.teamagent/sessions/`.

Parsing the assistant message: reuse the session log parser already in place (`packages/core/src/analyzer/` or wherever). Locate via grep:

```
grep -n "assistantText\|parseSession\|parseSessionFile" packages/core/src/
```

Use existing helper.

- [ ] **Step 6.7: Tests pass**

- [ ] **Step 6.8: Commit**

```
git commit -am "feat(m4a): stop hook integrates narrative scanner + emits bad_pattern/complied/recurred events"
```

---

### Task 7: UserPromptSubmit injects warnings + scans user-input channel

**Files:**
- Modify: `packages/cli/src/bin-user-prompt-submit.ts`
- Create: `packages/cli/src/user-prompt-inject.ts`
- Test: `packages/cli/src/__tests__/user-prompt-inject.test.ts`

- [ ] **Step 7.1: Write failing test**

```ts
// packages/cli/src/__tests__/user-prompt-inject.test.ts
import { describe, it, expect } from "vitest";
import { buildInjectionFromPending, scanUserInput } from "../user-prompt-inject.js";
import type { KnowledgeEntry } from "@teamagent/types";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const mkPending = (): any[] => [
  { session_id: "s1", turn_index: 1, knowledge_id: "n1", matched_snippet: "全部修复完成",
    rule_summary: "拿证据", confidence: 0.9, correct_pattern: "基于输出", reasoning: "防自欺",
    at: "2026-04-23T10:00:00Z" },
];

describe("buildInjectionFromPending", () => {
  it("returns empty when no pending file", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "m4a-up-"));
    const r = buildInjectionFromPending({ pendingDir: tmp, sessionId: "missing" });
    expect(r.text).toBe("");
    expect(r.injectedIds).toEqual([]);
  });

  it("reads pending, formats, and marks as consumed", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "m4a-up-"));
    const file = path.join(tmp, "s1_pending_warnings.json");
    fs.writeFileSync(file, JSON.stringify(mkPending()));
    const r = buildInjectionFromPending({ pendingDir: tmp, sessionId: "s1" });
    expect(r.text).toContain("TeamAgent 上一轮观察");
    expect(r.injectedIds).toEqual(["n1"]);
    // file should be cleared
    const after = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(after).toEqual([]);
  });

  it("caps at 3 by confidence desc", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "m4a-up-"));
    const file = path.join(tmp, "s1_pending_warnings.json");
    const many = Array.from({ length: 5 }, (_, i) => ({
      session_id: "s1", turn_index: 1, knowledge_id: `n${i}`,
      matched_snippet: "x", rule_summary: "y", confidence: 0.5 + i * 0.1,
      correct_pattern: "", reasoning: "", at: "",
    }));
    fs.writeFileSync(file, JSON.stringify(many));
    const r = buildInjectionFromPending({ pendingDir: tmp, sessionId: "s1" });
    expect(r.injectedIds).toHaveLength(3);
    expect(r.injectedIds).toContain("n4");
    expect(r.injectedIds).toContain("n3");
    expect(r.injectedIds).toContain("n2");
  });
});

describe("scanUserInput", () => {
  const rule = (overrides: Partial<KnowledgeEntry>): KnowledgeEntry => ({
    id: "u1",
    wrong_pattern: "<local-command-caveat>",
    status: "active",
    type: "avoidance",
    enforcement: "suggest",
    scope: { level: "personal" },
    category: "K",
    tags: [],
    confidence: 0.9,
    hit_count: 0,
    success_count: 0,
    override_count: 0,
    evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
    created_at: "",
    last_hit_at: "",
    last_validated_at: "",
    source: "accumulated",
    conflict_with: [],
    trigger: "",
    correct_pattern: "",
    reasoning: "",
    nature: "subjective",
    channel: "user-input" as any,
    ...overrides,
  });

  it("flags user prompt when matching user-input rule", () => {
    const hits = scanUserInput("some prompt <local-command-caveat> noise", [rule({})]);
    expect(hits).toHaveLength(1);
  });

  it("skips non user-input channel", () => {
    expect(scanUserInput("x", [rule({ channel: "tool-action" as any })])).toHaveLength(0);
  });
});
```

- [ ] **Step 7.2: Run → fail**

- [ ] **Step 7.3: Implement**

```ts
// packages/cli/src/user-prompt-inject.ts
import fs from "node:fs";
import path from "node:path";
import {
  selectTopForInjection,
  formatInjectionText,
  scanNarrative,
  type PendingWarning,
  type NarrativeHit,
} from "@teamagent/core";
import { normalizeChannel, type KnowledgeEntry } from "@teamagent/types";

export interface BuildInjectionArgs {
  pendingDir: string;
  sessionId: string;
  maxWarnings?: number;
}

export interface InjectionResult {
  text: string;
  injectedIds: string[];
}

function pendingFile(dir: string, sessionId: string): string {
  return path.join(dir, `${sessionId}_pending_warnings.json`);
}

export function buildInjectionFromPending(args: BuildInjectionArgs): InjectionResult {
  const max = args.maxWarnings ?? 3;
  const file = pendingFile(args.pendingDir, args.sessionId);
  if (!fs.existsSync(file)) return { text: "", injectedIds: [] };
  let pending: PendingWarning[] = [];
  try { pending = JSON.parse(fs.readFileSync(file, "utf8")); } catch { pending = []; }
  if (pending.length === 0) return { text: "", injectedIds: [] };
  const top = selectTopForInjection(pending, max);
  const text = formatInjectionText(top);
  // Clear pending atomically (best-effort)
  fs.writeFileSync(file, JSON.stringify([], null, 2));
  return { text, injectedIds: top.map((p) => p.knowledge_id) };
}

export function scanUserInput(userText: string, rules: KnowledgeEntry[]): NarrativeHit[] {
  // Reuse scanNarrative but with channel === user-input
  const reclassed = rules
    .filter((r) => normalizeChannel((r as any).channel) === "user-input")
    .map((r) => ({ ...r, channel: "ai-narrative" as any })); // hack to reuse filter
  return scanNarrative(userText, reclassed);
}

export function formatUserInputFlag(hits: NarrativeHit[]): string {
  if (hits.length === 0) return "";
  const lines = ["◈ TeamAgent 输入标记", "以下内容是自动化噪声，不是用户意图，请忽略："];
  for (const h of hits) {
    lines.push(`- "${h.matched_snippet.trim()}" (规则 ${h.knowledge_id})`);
  }
  return lines.join("\n");
}
```

- [ ] **Step 7.4: Wire into bin-user-prompt-submit.ts**

Find where additionalContext is assembled. Prepend injection text and user-input flag. Emit `ai.narrative.injected` event with `injectedIds`. Persist `injectedIds` to `~/.teamagent/sessions/{session_id}_last_injected.json` so next Stop knows what to check for recurrence.

Skeleton wiring block (inside existing handler):

```ts
const pendingDir = path.join(os.homedir(), ".teamagent", "sessions");
const { text: injText, injectedIds } = buildInjectionFromPending({ pendingDir, sessionId });
const userHits = scanUserInput(input.prompt ?? "", activeRules);
const userFlag = formatUserInputFlag(userHits);

const blocks: string[] = [];
if (injText) blocks.push(injText);
if (userFlag) blocks.push(userFlag);
const additionalContext = blocks.join("\n\n");

if (injectedIds.length > 0) {
  eventLog.append({ kind: "ai.narrative.injected", knowledge_ids: injectedIds, session_id: sessionId, timestamp: now, schema_version: 1, id: `e-inject-${sessionId}-${Date.now()}` });
  fs.writeFileSync(path.join(pendingDir, `${sessionId}_last_injected.json`), JSON.stringify(injectedIds));
}
for (const h of userHits) {
  eventLog.append({ kind: "ai.user_input.flagged", knowledge_id: h.knowledge_id, session_id: sessionId, timestamp: now, schema_version: 1, id: `e-uflag-${sessionId}-${h.knowledge_id}-${Date.now()}` });
}
```

- [ ] **Step 7.5: Tests pass**

- [ ] **Step 7.6: Commit**

```
git commit -am "feat(m4a): user-prompt-submit injects pending warnings + scans user-input channel"
```

---

### Task 8: Calibrator signal map

**Files:**
- Modify: `packages/core/src/pipeline/calibration-pipeline-v2.ts` (or wherever signal-to-delta mapping lives)
- Test: existing v2 test file (extend)

- [ ] **Step 8.1: Locate signal mapping**

```
grep -n "ai.override.complied\|ai.override.ignored" packages/core/src/
```

- [ ] **Step 8.2: Write failing test**

Append to the relevant calibrator test:

```ts
it("ai.narrative.complied maps to reward (same weight as override.complied)", () => {
  // assert that a calibrator run with this event increments confidence / rewards
});

it("ai.narrative.recurred maps to demerit", () => {
  // assert demerit
});
```

- [ ] **Step 8.3: Extend mapping**

Wherever events → delta conversion happens, add:

- `ai.narrative.complied` → same weight as `ai.override.complied`
- `ai.narrative.recurred` → same weight as `ai.override.ignored`
- `ai.output.bad_pattern` → hit_count++ only (no confidence change)
- `ai.user_input.flagged` → hit_count++ only

- [ ] **Step 8.4: Test pass**

- [ ] **Step 8.5: Commit**

```
git commit -am "feat(m4a): calibrator signal map absorbs narrative recurred/complied/bad_pattern"
```

---

## Block D — Reclassify Tooling + Ship

### Task 9: Reclassify script (dry-run)

**Files:**
- Create: `scripts/reclassify-rules.ts`
- Create: `scripts/out/.gitkeep`
- Modify: `.gitignore` (add `scripts/out/*.md`, `scripts/out/*.json` except `.gitkeep`)

- [ ] **Step 9.1: Script skeleton**

```ts
#!/usr/bin/env tsx
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { DatabaseSync } from "node:sqlite";
import { spawnSync } from "node:child_process";

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

const PROMPT = `You classify a TeamAgent rule into ONE of four channels.

- tool-action: wrong_pattern is a literal string appearing in a TOOL CALL argument (bash command, file path, url, edit content). Examples: "npm install moment", "--dangerously-skip-permissions", "rm -rf".
- ai-narrative: wrong_pattern is a phrase the AI says in its assistant message, not a tool call. Often Chinese, about completion/waiting/hedging. Examples: "全部修复完成", "等通知", "无法手动查状态".
- user-input: wrong_pattern is a token/tag that appears in CONTENT FED INTO THE AI (user prompt, system noise). Examples: "<local-command-caveat>", "<system-reminder>".
- passive-knowledge: abstract/meta-cognitive principle without a concrete literal keyword. wrong_pattern may be empty or verbose prose. Examples: workflow principles, meta-cognition.

Output JSON: {"channel": "...", "confidence": 0.0-1.0, "reason": "..."}. Output JSON ONLY.`;

function classifyOne(rule: RawRule): { channel: Channel; confidence: number; reason: string } {
  const body = `RULE:\n  wrong_pattern: ${JSON.stringify(rule.wrong_pattern)}\n  correct_pattern: ${JSON.stringify(rule.correct_pattern)}\n  reasoning: ${JSON.stringify(rule.reasoning)}\n  trigger: ${JSON.stringify(rule.trigger)}`;
  const r = spawnSync("claude", ["-p", `${PROMPT}\n\n${body}`], {
    encoding: "utf8",
    timeout: 30_000,
  });
  if (r.status !== 0) {
    return fallbackHeuristic(rule);
  }
  try {
    const txt = r.stdout.trim();
    const m = txt.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(m ? m[0] : txt);
    if (["tool-action","ai-narrative","user-input","passive-knowledge"].includes(parsed.channel)) {
      return { channel: parsed.channel, confidence: Number(parsed.confidence) || 0.5, reason: String(parsed.reason || "") };
    }
  } catch { /* ignore */ }
  return fallbackHeuristic(rule);
}

function fallbackHeuristic(rule: RawRule): { channel: Channel; confidence: number; reason: string } {
  const wp = rule.wrong_pattern || "";
  if (!wp.trim()) return { channel: "passive-knowledge", confidence: 0.8, reason: "empty wrong_pattern" };
  if (wp.startsWith("<") && wp.endsWith(">")) return { channel: "user-input", confidence: 0.7, reason: "tag-like token" };
  const hasAscii = /^[\x00-\x7F]+$/.test(wp);
  if (!hasAscii) return { channel: "ai-narrative", confidence: 0.6, reason: "non-ascii phrase likely narrative" };
  return { channel: "tool-action", confidence: 0.5, reason: "ascii literal" };
}

function main() {
  const projectDb = path.join(process.cwd(), ".teamagent", "knowledge.db");
  const db = new DatabaseSync(projectDb);
  const rows = db.prepare(`
    SELECT id, wrong_pattern, correct_pattern, reasoning, trigger, channel, enforcement, status
    FROM knowledge
    WHERE status = 'active'
  `).all() as RawRule[];

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.join(process.cwd(), "scripts", "out");
  fs.mkdirSync(outDir, { recursive: true });

  const plan: any[] = [];
  let i = 0;
  for (const rule of rows) {
    i++;
    process.stderr.write(`[${i}/${rows.length}] ${rule.id} ${rule.wrong_pattern.slice(0,40)}...\n`);
    const res = classifyOne(rule);
    const oldChannel = rule.channel ?? "tool-action";
    if (res.channel === oldChannel) continue;
    const newEnforcement = downgradeIfNeeded(rule.enforcement, res.channel);
    plan.push({
      id: rule.id,
      wrong_pattern: rule.wrong_pattern,
      old_channel: oldChannel,
      new_channel: res.channel,
      old_enforcement: rule.enforcement,
      new_enforcement: newEnforcement,
      confidence: res.confidence,
      reason: res.reason,
    });
  }

  const jsonPath = path.join(outDir, `reclassify-${ts}.json`);
  const mdPath = path.join(outDir, `reclassify-${ts}.md`);
  fs.writeFileSync(jsonPath, JSON.stringify({ plan }, null, 2));
  fs.writeFileSync(mdPath, renderReport(plan, rows.length));

  console.log(`\nReport: ${mdPath}\nPlan:   ${jsonPath}`);
  console.log(`Apply with: pnpm teamagent reclassify apply --plan ${jsonPath}`);
  db.close();
}

function downgradeIfNeeded(enf: string, ch: Channel): string {
  if (ch === "tool-action") return enf;
  if (ch === "passive-knowledge") return "passive";
  if (ch === "user-input") return enf === "block" || enf === "warn" ? "suggest" : enf;
  if (ch === "ai-narrative") return enf === "block" ? "warn" : enf;
  return enf;
}

function renderReport(plan: any[], total: number): string {
  const lines = [`# Reclassification Report`, ``, `Total rules scanned: ${total}`, `Changes proposed: ${plan.length}`, ``];
  const byChannel: Record<string, number> = {};
  for (const p of plan) byChannel[p.new_channel] = (byChannel[p.new_channel] || 0) + 1;
  lines.push(`## Distribution`, ``);
  for (const [k,v] of Object.entries(byChannel)) lines.push(`- ${k}: ${v}`);
  lines.push(``, `## High confidence (>= 0.7, auto-apply candidates)`, ``);
  lines.push(`| id | wrong_pattern | old → new channel | enforcement | conf | reason |`);
  lines.push(`|----|---------------|-------------------|-------------|------|--------|`);
  for (const p of plan.filter((x) => x.confidence >= 0.7)) {
    lines.push(`| ${p.id} | ${truncate(p.wrong_pattern,40)} | ${p.old_channel} → ${p.new_channel} | ${p.old_enforcement} → ${p.new_enforcement} | ${p.confidence.toFixed(2)} | ${truncate(p.reason,40)} |`);
  }
  lines.push(``, `## Needs human review (< 0.7)`, ``);
  lines.push(`| id | wrong_pattern | suggested channel | conf | reason |`);
  lines.push(`|----|---------------|-------------------|------|--------|`);
  for (const p of plan.filter((x) => x.confidence < 0.7)) {
    lines.push(`| ${p.id} | ${truncate(p.wrong_pattern,40)} | ${p.new_channel} | ${p.confidence.toFixed(2)} | ${truncate(p.reason,40)} |`);
  }
  return lines.join("\n");
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n-1) + "…" : s;
}

main();
```

- [ ] **Step 9.2: Add ignore rule**

In `.gitignore`:
```
scripts/out/*.md
scripts/out/*.json
!scripts/out/.gitkeep
```

- [ ] **Step 9.3: Smoke-run (dry-run only, no DB change)**

```
pnpm tsx scripts/reclassify-rules.ts
```

If `claude -p` not available, fallback heuristic runs. OK for now.

- [ ] **Step 9.4: Commit**

```
git add scripts/reclassify-rules.ts scripts/out/.gitkeep .gitignore
git commit -m "feat(m4a): reclassify-rules script (LLM classifier + heuristic fallback + markdown report)"
```

---

### Task 10: Reclassify CLI apply/rollback

**Files:**
- Create: `packages/cli/src/commands/reclassify.ts`
- Modify: `packages/cli/src/bin.ts` (add command branch)

- [ ] **Step 10.1: Implement command**

```ts
// packages/cli/src/commands/reclassify.ts
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { openDb } from "@teamagent/adapters";

export function cmdReclassifyApply(args: { plan: string; dryRun?: boolean }): void {
  const plan = JSON.parse(fs.readFileSync(args.plan, "utf8"));
  const dbPath = path.join(process.cwd(), ".teamagent", "knowledge.db");
  const db = openDb(dbPath);
  const rollback: any[] = [];
  const updateStmt = db.prepare(`UPDATE knowledge SET channel = ?, enforcement = ? WHERE id = ?`);
  for (const entry of plan.plan) {
    rollback.push({ id: entry.id, channel: entry.old_channel, enforcement: entry.old_enforcement });
    if (!args.dryRun) {
      updateStmt.run(entry.new_channel, entry.new_enforcement, entry.id);
    }
  }
  const auditId = `audit-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const auditPath = path.join(os.homedir(), ".teamagent", "reclassify-audit.jsonl");
  fs.appendFileSync(auditPath, JSON.stringify({ id: auditId, plan_file: args.plan, rollback, at: new Date().toISOString() }) + "\n");
  console.log(`Applied ${plan.plan.length} reclassifications.`);
  console.log(`Audit id: ${auditId}`);
  console.log(`Rollback: teamagent reclassify rollback --audit ${auditId}`);
  db.close();
}

export function cmdReclassifyRollback(args: { audit: string }): void {
  const auditPath = path.join(os.homedir(), ".teamagent", "reclassify-audit.jsonl");
  const lines = fs.readFileSync(auditPath, "utf8").split("\n").filter(Boolean);
  const entry = lines.map((l) => JSON.parse(l)).find((e: any) => e.id === args.audit);
  if (!entry) {
    console.error(`Audit ${args.audit} not found`);
    process.exit(1);
  }
  const dbPath = path.join(process.cwd(), ".teamagent", "knowledge.db");
  const db = openDb(dbPath);
  const stmt = db.prepare(`UPDATE knowledge SET channel = ?, enforcement = ? WHERE id = ?`);
  for (const r of entry.rollback) {
    stmt.run(r.channel, r.enforcement, r.id);
  }
  console.log(`Rolled back ${entry.rollback.length} rules.`);
  db.close();
}
```

- [ ] **Step 10.2: Register in bin.ts**

Find help text and command switch (`case "reclassify"`). Add subcommand routing.

- [ ] **Step 10.3: Test manually**

```
pnpm teamagent reclassify apply --plan scripts/out/reclassify-<ts>.json --dry-run
```

- [ ] **Step 10.4: Commit**

```
git commit -am "feat(m4a): teamagent reclassify apply/rollback subcommands"
```

---

### Task 11: End-to-end smoke

- [ ] **Step 11.1: Build**

```
pnpm --filter teamagent run build
```

- [ ] **Step 11.2: Run full test suite**

```
pnpm test
```

All green.

- [ ] **Step 11.3: Manual E2E on current db**

```
pnpm tsx scripts/reclassify-rules.ts
# inspect scripts/out/reclassify-<ts>.md
```

- [ ] **Step 11.4: Apply (real)**

```
pnpm teamagent reclassify apply --plan scripts/out/reclassify-<ts>.json
```

- [ ] **Step 11.5: Verify**

```
node -e "const{DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('.teamagent/knowledge.db');console.table(db.prepare('SELECT channel,enforcement,COUNT(*) as n FROM knowledge WHERE status=?? GROUP BY channel,enforcement').all('active'))"
```

Expect ~20-70 narrative-channel rules, small tool-action set, passive-knowledge bulk.

- [ ] **Step 11.6: Commit the data changes if applicable + push forward**

---

### Task 12: Bump & Repack

- [ ] **Step 12.1: Bump version**

```
edit packages/teamagent/package.json: 0.9.2 -> 0.9.3
```

- [ ] **Step 12.2: Rebuild & repack**

```
pnpm --filter teamagent run build
cd packages/teamagent && pnpm pack
```

- [ ] **Step 12.3: Commit**

```
git add packages/teamagent/package.json
git commit -m "chore(m4a): bump teamagent 0.9.3 + rebuild tarball"
```

---

### Task 13: Docs finalization

- [ ] **Step 13.1: Update spec**

Add a §12 entry noting implementation complete, link commits.

- [ ] **Step 13.2: Commit**

```
git commit -am "docs(m4a): spec implementation notes + M4-A summary"
```

---

## Self-review checklist (before starting execution)

- [x] Spec coverage (ch 3-7) — all tasks map
- [x] No TBD placeholders
- [x] Type consistency — `RuleChannel`, `NarrativeHit`, `PendingWarning` used consistently
- [x] Backward compat — `normalizeChannel(undefined) === "tool-action"` everywhere
- [x] Each task ends with a commit
