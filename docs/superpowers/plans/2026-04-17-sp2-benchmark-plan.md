# SP-2 Benchmark v1 Implementation Plan

> **Status:** v1 + v1.1 COMPLETE (2026-04-17). See §Final Status below.
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build benchmark infrastructure — runs baseline vs teamagent comparison with 3 seed tasks, generates JSON+Markdown report, proves hooks actually intercept.

**Architecture:** New `packages/benchmark` workspace package. SdkRunner Port (interface + Fake + Claude impl) lets runner unit-test without API. Isolator preps tmp workdir per group with template-substituted settings.json + openDb-created knowledge.db + seed.sql. Pattern evaluator returns correct/wrong/neither verdict. Reporter aggregates → PRR + token + duration deltas.

**Tech Stack:** `@anthropic-ai/claude-agent-sdk`, `@teamagent/adapters` (openDb only), `vitest`, `zod`, `tsx`/`tsup`

**LLM backend:** Haiku 4.5 (`claude-haiku-4-5-20251001`) via the `claude` CLI subscription (OAuth). No `ANTHROPIC_API_KEY` required — SDK inherits the user's Claude Code auth.

---

## Final Status (2026-04-17)

All 9 v1 tasks + 5 v1.1 tasks complete. PRR=100% on the three-task seed suite.

| Task | Status | Commit(s) |
|------|--------|-----------|
| v1-1 Package skeleton + types | ✅ | `f559f6c feat(sp2): packages/benchmark skeleton + types` |
| v1-2 task-loader (TDD) | ✅ | `a100c2c feat(sp2): task-loader — zod schema + regex compile fail-fast` |
| v1-3 evaluator (TDD) | ✅ | `88d1aaa feat(sp2): pattern evaluator — wrong > correct > neither` |
| v1-4 isolator (TDD) | ✅ | `f01f72b` + `0b8fa82 fix(sp2): isolator finally + cleanup on partial failure — Windows EBUSY guard` |
| v1-5 SdkRunner Port + Fake + Claude | ✅ | `a8597c2` + `e7fea69 fix(sp2): SdkRunner timeout — abortController + session.close + clearTimeout` |
| v1-6 runner (TDD with FakeSdkRunner) | ✅ | `a0598cf feat(sp2): runTask — SDK call + evaluator + error/empty handling` |
| v1-7 reporter (TDD) | ✅ | `c32a567` + `360de46 fix(sp2): Error cast safety + markdown cell escape + multi-run PRR note` |
| v1-8 bin orchestrator + fixtures | ✅ | `a054b23` + `487fb3d fix(sp2): seed enums + task prompts demand Write + integration test` |
| v1-9 Walking Skeleton + Haiku default | ✅ | `5fcfa55 feat(sp2): Haiku default model + drop API key precheck (OAuth fallback)` |
| Merge into master | ✅ | `63df4f8 merge: feat/sp2-benchmark — SP-2 Benchmark v1 infrastructure` |
| v1.1-1 evaluator scans workdir files | ✅ | `85fe5ba feat(sp2): evaluator scans workdir files — source-of-truth pattern match` |
| v1.1-2 task prompts force specific trap | ✅ | `04966be feat(sp2): task prompts force specific trap — signal-validating by design` |
| v1.1-3 hook output wrapped for SDK | ✅ | `879ea64 fix(hook): wrap PreToolUse output in hookSpecificOutput for SDK compat` |
| v1.1-4 permission allowlist + acceptEdits + maxTurns=10 | ✅ | `3330437 feat(sp2): permission allowlist + acceptEdits + maxTurns=10` |
| v1.1-5 runner workdir hint + file-preferred eval | ✅ | `50b0a01 feat(sp2): runner prepends workdir hint + evaluates files over narrative` |
| v1.1-6 axios rule enforcement=block | ✅ | `797d900 feat(sp2): axios CancelToken rule enforcement=block` |
| v1.1-7 gitignore bench-report outputs | ✅ | `82d6a7f chore(sp2): gitignore bench-report outputs` |
| v1.1-8 design doc retrospective | ✅ | `656b791 docs(sp2): design v1.1 — PRR signal fix retrospective` |

### Final PRR Validation

```
pnpm benchmark --groups=baseline,teamagent --tasks=all --runs=1

[1/6] baseline/001-moment-vs-dayjs run=1 ... wrong (11979ms)
[2/6] baseline/002-axios-cancel   run=1 ... wrong (12381ms)
[3/6] baseline/003-react-key      run=1 ... wrong (11356ms)
[4/6] teamagent/001-moment-vs-dayjs run=1 ... correct (23394ms)
[5/6] teamagent/002-axios-cancel   run=1 ... correct (20391ms)
[6/6] teamagent/003-react-key      run=1 ... correct (43533ms)

PRR: 100.0%
```

47/47 benchmark unit tests green. Full `pnpm test` reports 969/969 at the merge point (one unrelated Windows pre-existing flake in `calibrate.test.ts`).

---

## v1.2 Extension — task suite expansion (2026-04-20)

Added 3 tasks to stress hook coverage beyond seed trio:

| Task | Status | Commit |
|------|--------|--------|
| v1.2-1 task 004 multi-trap-todo (single file fires moment+CancelToken+key=index) | ✅ | `5abab68 test(sp2): 004 multi-trap todo task — single file triggers all 3 rules` |
| v1.2-2 task 005 XHR→fetch + 006 class→functional, maxTurns=15 | ✅ | `14a7bfb test(sp2): 005 XHR→fetch + 006 class→functional + maxTurns=15` |

### v1.2 PRR Validation

```
pnpm benchmark --groups=baseline,teamagent --tasks=all --runs=1

[1/12]  baseline/001-moment-vs-dayjs       → wrong   (10474ms)
[2/12]  baseline/002-axios-cancel          → wrong   (12259ms)
[3/12]  baseline/003-react-key             → wrong   (10698ms)
[4/12]  baseline/004-multi-trap-todo       → wrong   (24461ms)
[5/12]  baseline/005-xhr-vs-fetch          → wrong   (17250ms)
[6/12]  baseline/006-react-class-component → wrong   (16762ms)
[7/12]  teamagent/001-moment-vs-dayjs      → correct (17293ms)
[8/12]  teamagent/002-axios-cancel         → correct (15071ms)
[9/12]  teamagent/003-react-key            → correct (25584ms)
[10/12] teamagent/004-multi-trap-todo      → correct (37964ms)
[11/12] teamagent/005-xhr-vs-fetch         → neither (21900ms)
[12/12] teamagent/006-react-class-component → correct (29718ms)

PRR: 100.0%
Token Delta:    +64.5%   (108/8563 → 172/14095 in/out)
Duration Delta: +60.5%   (15317ms → 24588ms avg)
```

baseline 6/6 wrong = trap signal perfect on all 6 tasks. teamagent 0/6 wrong = no rule miss.

### Anomaly: task 005 → `neither` (resolved by runs=3 — variance, not systematic)

In runs=1 teamagent landed `neither` on task 005. Replayed with runs=3:

| Task | teamagent run=1 | run=2 | run=3 |
|------|---|---|---|
| 005-xhr-vs-fetch | correct | correct | correct |
| 003-react-key    | **neither** | correct | correct |

So 005's neither was a fluke (3/3 correct on replay), and 003 produced a new neither in 1/3 runs. Aggregate: 17 correct + 1 neither across 18 teamagent runs ≈ 5.5% noise floor.

**Decision: no hook or pattern change.** Hooks are working as designed. The `neither` outcomes are model-side variance (model occasionally picks an off-spec but not-wrong implementation), not a missing rule signal.

### v1.2-runs3 stability run

```
pnpm benchmark --groups=baseline,teamagent --tasks=all --runs=3

baseline:  18/18 wrong   — trap signal perfect on all 6 tasks
teamagent: 17/18 correct + 1/18 neither — 0 wrong

PRR: 100.0%
Token Delta:    +52.4%   (468/32296 → 702/49215 in/out)
Duration Delta: +42.1%   (20311ms → 28863ms avg)
```

Token + duration deltas shrink vs runs=1 (64.5%/60.5% → 52.4%/42.1%) — averaging across more runs smooths early-call hook init cost.

---

## Original Plan (historical — preserved for trace)

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/benchmark/package.json` | Create | workspace package manifest + scripts |
| `packages/benchmark/tsconfig.json` | Create | extends root, references @teamagent/adapters |
| `packages/benchmark/src/types.ts` | Create | Task, TaskResult, GroupConfig, Verdict, Report types |
| `packages/benchmark/src/task-loader.ts` | Create | loadTasks(glob) → Task[]; zod schema; regex compile fail-fast |
| `packages/benchmark/src/evaluator.ts` | Create | evaluatePatterns(output, task) → Verdict |
| `packages/benchmark/src/isolator.ts` | Create | createGroupWorkdir, cleanupGroupWorkdir; template substitution |
| `packages/benchmark/src/sdk-runner.ts` | Create | SdkRunner interface + ClaudeSdkRunner + FakeSdkRunner |
| `packages/benchmark/src/runner.ts` | Create | runTask(task, group, sdk, workdir) → TaskResult |
| `packages/benchmark/src/reporter.ts` | Create | aggregate, writeJson, writeMarkdown |
| `packages/benchmark/src/bin.ts` | Create | CLI parser + orchestrator |
| `packages/benchmark/src/__tests__/task-loader.test.ts` | Create | unit tests |
| `packages/benchmark/src/__tests__/evaluator.test.ts` | Create | unit tests |
| `packages/benchmark/src/__tests__/isolator.test.ts` | Create | unit tests |
| `packages/benchmark/src/__tests__/runner.test.ts` | Create | unit tests w/ FakeSdkRunner |
| `packages/benchmark/src/__tests__/reporter.test.ts` | Create | unit tests |
| `packages/benchmark/fixtures/tasks/001-moment-vs-dayjs.json` | Create | hook intercept task |
| `packages/benchmark/fixtures/tasks/002-axios-cancel.json` | Create | wiki injection task |
| `packages/benchmark/fixtures/tasks/003-react-key.json` | Create | plain text baseline task |
| `packages/benchmark/fixtures/groups/baseline/settings.template.json` | Create | empty hooks |
| `packages/benchmark/fixtures/groups/teamagent/settings.template.json` | Create | three hooks with {{HOOK_DIR}} |
| `packages/benchmark/fixtures/groups/teamagent/seed.sql` | Create | INSERT moment→dayjs rule + axios wiki |
| `pnpm-workspace.yaml` | Verify | already includes packages/* |
| Root `package.json` | Modify | add `benchmark` script |

---

## Task 1: Package skeleton + types

**Files:**
- Create: `packages/benchmark/package.json`
- Create: `packages/benchmark/tsconfig.json`
- Create: `packages/benchmark/src/types.ts`

- [ ] **Step 1: Create `packages/benchmark/package.json`**

```json
{
  "name": "@teamagent/benchmark",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "bench": "tsx src/bin.ts"
  },
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "*",
    "@teamagent/adapters": "workspace:*",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

Note: SDK version uses `*` to follow whatever version other packages have. Check root `pnpm-lock.yaml` after install.

- [ ] **Step 2: Create `packages/benchmark/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules", "src/__tests__/**"]
}
```

If `tsconfig.base.json` does not exist at repo root, copy compilerOptions from `packages/core/tsconfig.json` instead.

- [ ] **Step 3: Create `packages/benchmark/src/types.ts`**

```typescript
export type Verdict = "correct" | "wrong" | "neither" | "error";

export interface PatternEvaluator {
  type: "pattern";
  wrong_patterns: string[];
  correct_patterns: string[];
}

export interface Task {
  id: string;
  name: string;
  category: string;
  prompt: string;
  evaluator: PatternEvaluator;
}

export interface CompiledTask extends Task {
  compiledWrongRegex: RegExp[];
  compiledCorrectRegex: RegExp[];
}

export interface GroupConfig {
  name: string;
  fixtureDir: string;
}

export interface TaskResult {
  group: string;
  taskId: string;
  run: number;
  verdict: Verdict;
  reason?: string;
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
  output: string;
  errorMsg?: string;
}

export interface GroupSummary {
  group: string;
  wrongCount: number;
  correctCount: number;
  neitherCount: number;
  errorCount: number;
  totalTokensIn: number;
  totalTokensOut: number;
  avgDurationMs: number;
}

export interface BenchmarkConfig {
  groups: string[];
  tasks: string;
  runs: number;
  outputJson: string;
  outputMarkdown: string;
}

export interface Report {
  generatedAt: string;
  config: BenchmarkConfig;
  groups: GroupSummary[];
  comparison: {
    prr: number;
    tokenDeltaPercent: number;
    durationDeltaPercent: number;
  };
  rawResults: TaskResult[];
}
```

- [ ] **Step 4: Install + typecheck**

```bash
cd C:/bzli/teamagent && pnpm install
cd C:/bzli/teamagent && pnpm --filter @teamagent/benchmark typecheck
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
cd C:/bzli/teamagent
git add packages/benchmark/package.json packages/benchmark/tsconfig.json packages/benchmark/src/types.ts pnpm-lock.yaml
git commit -m "feat(sp2): packages/benchmark skeleton + types"
```

---

## Task 2: task-loader (TDD)

**Files:**
- Create: `packages/benchmark/src/task-loader.ts`
- Create: `packages/benchmark/src/__tests__/task-loader.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/benchmark/src/__tests__/task-loader.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadTasks } from "../task-loader.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "bench-loader-"));
});

const validTask = {
  id: "t1",
  name: "test",
  category: "x",
  prompt: "do thing",
  evaluator: {
    type: "pattern",
    wrong_patterns: ["foo"],
    correct_patterns: ["bar"],
  },
};

describe("loadTasks", () => {
  it("loads valid task JSON", async () => {
    writeFileSync(path.join(dir, "t1.json"), JSON.stringify(validTask));
    const tasks = await loadTasks(path.join(dir, "*.json"));
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.id).toBe("t1");
  });

  it("compiles regex patterns", async () => {
    writeFileSync(path.join(dir, "t1.json"), JSON.stringify(validTask));
    const tasks = await loadTasks(path.join(dir, "*.json"));
    expect(tasks[0]!.compiledWrongRegex[0]!.test("foo bar")).toBe(true);
    expect(tasks[0]!.compiledCorrectRegex[0]!.test("foo bar")).toBe(true);
  });

  it("throws on schema violation (missing field)", async () => {
    const bad = { ...validTask, id: undefined };
    writeFileSync(path.join(dir, "bad.json"), JSON.stringify(bad));
    await expect(loadTasks(path.join(dir, "*.json"))).rejects.toThrow(/id/);
  });

  it("throws on regex compile failure", async () => {
    const bad = { ...validTask, evaluator: { ...validTask.evaluator, wrong_patterns: ["[invalid"] } };
    writeFileSync(path.join(dir, "bad.json"), JSON.stringify(bad));
    await expect(loadTasks(path.join(dir, "*.json"))).rejects.toThrow(/regex|invalid/i);
  });

  it("returns empty array when no files match", async () => {
    const tasks = await loadTasks(path.join(dir, "nope*.json"));
    expect(tasks).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd C:/bzli/teamagent && pnpm --filter @teamagent/benchmark test 2>&1 | tail -10
```

Expected: FAIL with `Cannot find module '../task-loader.js'`.

- [ ] **Step 3: Implement `packages/benchmark/src/task-loader.ts`**

```typescript
import { readFile } from "node:fs/promises";
import { glob } from "node:fs/promises";
import { z } from "zod";
import type { CompiledTask, Task } from "./types.js";

const PatternEvaluatorSchema = z.object({
  type: z.literal("pattern"),
  wrong_patterns: z.array(z.string()),
  correct_patterns: z.array(z.string()),
});

const TaskSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  prompt: z.string().min(1),
  evaluator: PatternEvaluatorSchema,
});

export async function loadTasks(globPattern: string): Promise<CompiledTask[]> {
  const paths: string[] = [];
  for await (const p of glob(globPattern)) paths.push(p);
  paths.sort();

  const tasks: CompiledTask[] = [];
  for (const p of paths) {
    const raw = await readFile(p, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    const task: Task = TaskSchema.parse(parsed);
    const compiledWrongRegex = task.evaluator.wrong_patterns.map((s) => compileOrThrow(s, p));
    const compiledCorrectRegex = task.evaluator.correct_patterns.map((s) => compileOrThrow(s, p));
    tasks.push({ ...task, compiledWrongRegex, compiledCorrectRegex });
  }
  return tasks;
}

function compileOrThrow(pattern: string, file: string): RegExp {
  try {
    return new RegExp(pattern);
  } catch (e) {
    throw new Error(`regex compile failed in ${file}: ${pattern} (${(e as Error).message})`);
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
cd C:/bzli/teamagent && pnpm --filter @teamagent/benchmark test 2>&1 | tail -10
```

Expected: 5/5 pass.

- [ ] **Step 5: Commit**

```bash
cd C:/bzli/teamagent
git add packages/benchmark/src/task-loader.ts packages/benchmark/src/__tests__/task-loader.test.ts
git commit -m "feat(sp2): task-loader — zod schema + regex compile fail-fast"
```

---

## Task 3: evaluator (TDD)

**Files:**
- Create: `packages/benchmark/src/evaluator.ts`
- Create: `packages/benchmark/src/__tests__/evaluator.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/benchmark/src/__tests__/evaluator.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { evaluatePatterns } from "../evaluator.js";
import type { CompiledTask } from "../types.js";

function makeTask(wrong: string[], correct: string[]): CompiledTask {
  return {
    id: "t",
    name: "t",
    category: "x",
    prompt: "p",
    evaluator: { type: "pattern", wrong_patterns: wrong, correct_patterns: correct },
    compiledWrongRegex: wrong.map((s) => new RegExp(s)),
    compiledCorrectRegex: correct.map((s) => new RegExp(s)),
  };
}

describe("evaluatePatterns", () => {
  it("returns correct when only correct pattern matches", () => {
    const task = makeTask(["moment"], ["dayjs"]);
    expect(evaluatePatterns("import dayjs from 'dayjs'", task).verdict).toBe("correct");
  });

  it("returns wrong when wrong pattern matches", () => {
    const task = makeTask(["moment"], ["dayjs"]);
    expect(evaluatePatterns("import moment from 'moment'", task).verdict).toBe("wrong");
  });

  it("returns wrong when both match (wrong takes priority)", () => {
    const task = makeTask(["moment"], ["dayjs"]);
    expect(evaluatePatterns("moment + dayjs", task).verdict).toBe("wrong");
  });

  it("returns neither when nothing matches", () => {
    const task = makeTask(["moment"], ["dayjs"]);
    expect(evaluatePatterns("new Date().toISOString()", task).verdict).toBe("neither");
  });

  it("includes matched pattern in reason", () => {
    const task = makeTask(["moment"], ["dayjs"]);
    const r = evaluatePatterns("import moment", task);
    expect(r.reason).toContain("moment");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd C:/bzli/teamagent && pnpm --filter @teamagent/benchmark test evaluator 2>&1 | tail -10
```

Expected: FAIL `Cannot find module '../evaluator.js'`.

- [ ] **Step 3: Implement `packages/benchmark/src/evaluator.ts`**

```typescript
import type { CompiledTask, Verdict } from "./types.js";

export function evaluatePatterns(
  output: string,
  task: CompiledTask,
): { verdict: Verdict; reason?: string } {
  for (const re of task.compiledWrongRegex) {
    if (re.test(output)) return { verdict: "wrong", reason: `matched wrong: ${re.source}` };
  }
  for (const re of task.compiledCorrectRegex) {
    if (re.test(output)) return { verdict: "correct", reason: `matched correct: ${re.source}` };
  }
  return { verdict: "neither" };
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
cd C:/bzli/teamagent && pnpm --filter @teamagent/benchmark test evaluator 2>&1 | tail -10
```

Expected: 5/5 pass.

- [ ] **Step 5: Commit**

```bash
cd C:/bzli/teamagent
git add packages/benchmark/src/evaluator.ts packages/benchmark/src/__tests__/evaluator.test.ts
git commit -m "feat(sp2): pattern evaluator — wrong > correct > neither"
```

---

## Task 4: isolator (TDD)

**Files:**
- Create: `packages/benchmark/src/isolator.ts`
- Create: `packages/benchmark/src/__tests__/isolator.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/benchmark/src/__tests__/isolator.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createGroupWorkdir, cleanupGroupWorkdir } from "../isolator.js";

let fixtureDir: string;

beforeEach(() => {
  fixtureDir = mkdtempSync(path.join(tmpdir(), "bench-fixt-"));
});

afterEach(() => {
  rmSync(fixtureDir, { recursive: true, force: true });
});

function writeTemplate(content: string): void {
  writeFileSync(path.join(fixtureDir, "settings.template.json"), content);
}

describe("createGroupWorkdir", () => {
  it("creates workdir with .claude and .teamagent subdirs", async () => {
    writeTemplate("{}");
    const wd = await createGroupWorkdir({ name: "g1", fixtureDir }, "/tmp/hooks");
    expect(existsSync(path.join(wd, ".claude"))).toBe(true);
    expect(existsSync(path.join(wd, ".teamagent"))).toBe(true);
    cleanupGroupWorkdir(wd);
  });

  it("substitutes {{HOOK_DIR}} placeholder in settings.template.json", async () => {
    writeTemplate('{"path":"{{HOOK_DIR}}/bin.cjs"}');
    const wd = await createGroupWorkdir({ name: "g1", fixtureDir }, "/tmp/hooks");
    const written = readFileSync(path.join(wd, ".claude", "settings.local.json"), "utf8");
    expect(written).toContain("/tmp/hooks/bin.cjs");
    expect(written).not.toContain("{{HOOK_DIR}}");
    cleanupGroupWorkdir(wd);
  });

  it("creates knowledge.db with schema", async () => {
    writeTemplate("{}");
    const wd = await createGroupWorkdir({ name: "g1", fixtureDir }, "/tmp/hooks");
    expect(existsSync(path.join(wd, ".teamagent", "knowledge.db"))).toBe(true);
    cleanupGroupWorkdir(wd);
  });

  it("runs seed.sql when present", async () => {
    writeTemplate("{}");
    writeFileSync(path.join(fixtureDir, "seed.sql"), "INSERT INTO schema_version(version, applied_at) VALUES (99, datetime('now'));");
    const wd = await createGroupWorkdir({ name: "g1", fixtureDir }, "/tmp/hooks");
    // verify seed ran by reopening
    const { openDb } = await import("@teamagent/adapters");
    const db = openDb(path.join(wd, ".teamagent", "knowledge.db"));
    const row = db.prepare("SELECT version FROM schema_version WHERE version = 99").get();
    expect(row).toBeDefined();
    db.close();
    cleanupGroupWorkdir(wd);
  });

  it("throws when settings.template.json missing", async () => {
    await expect(createGroupWorkdir({ name: "g1", fixtureDir }, "/tmp/hooks"))
      .rejects.toThrow(/settings\.template\.json/);
  });
});

describe("cleanupGroupWorkdir", () => {
  it("removes the workdir", async () => {
    writeTemplate("{}");
    const wd = await createGroupWorkdir({ name: "g1", fixtureDir }, "/tmp/hooks");
    cleanupGroupWorkdir(wd);
    expect(existsSync(wd)).toBe(false);
  });

  it("does not throw when workdir already gone", () => {
    expect(() => cleanupGroupWorkdir("/nonexistent/path/xyz")).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd C:/bzli/teamagent && pnpm --filter @teamagent/benchmark test isolator 2>&1 | tail -10
```

Expected: FAIL `Cannot find module '../isolator.js'`.

- [ ] **Step 3: Implement `packages/benchmark/src/isolator.ts`**

```typescript
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDb } from "@teamagent/adapters";
import type { GroupConfig } from "./types.js";

export async function createGroupWorkdir(
  group: GroupConfig,
  hookDir: string,
): Promise<string> {
  const templatePath = path.join(group.fixtureDir, "settings.template.json");
  if (!existsSync(templatePath)) {
    throw new Error(`settings.template.json not found in ${group.fixtureDir}`);
  }

  const wd = mkdtempSync(path.join(tmpdir(), `teamagent-bench-${group.name}-`));
  mkdirSync(path.join(wd, ".claude"), { recursive: true });
  mkdirSync(path.join(wd, ".teamagent"), { recursive: true });

  // 1. settings.local.json with placeholder substitution
  const template = readFileSync(templatePath, "utf8");
  const substituted = template.replaceAll("{{HOOK_DIR}}", hookDir.replaceAll("\\", "/"));
  writeFileSync(path.join(wd, ".claude", "settings.local.json"), substituted);

  // 2. knowledge.db with schema
  const dbPath = path.join(wd, ".teamagent", "knowledge.db");
  const db = openDb(dbPath);

  // 3. seed.sql if present
  const seedPath = path.join(group.fixtureDir, "seed.sql");
  if (existsSync(seedPath)) {
    const sql = readFileSync(seedPath, "utf8");
    db.exec(sql);
  }
  db.close();

  return wd;
}

export function cleanupGroupWorkdir(workdir: string): void {
  try {
    rmSync(workdir, { recursive: true, force: true });
  } catch {
    // already gone — ignore
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
cd C:/bzli/teamagent && pnpm --filter @teamagent/benchmark test isolator 2>&1 | tail -10
```

Expected: 7/7 pass.

- [ ] **Step 5: Commit**

```bash
cd C:/bzli/teamagent
git add packages/benchmark/src/isolator.ts packages/benchmark/src/__tests__/isolator.test.ts
git commit -m "feat(sp2): isolator — tmpdir + settings template substitution + openDb schema"
```

---

## Task 5: sdk-runner (Port + Fake + real)

**Files:**
- Create: `packages/benchmark/src/sdk-runner.ts`

- [ ] **Step 1: Implement `packages/benchmark/src/sdk-runner.ts`**

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

export interface SdkRunResult {
  output: string;
  tokensIn: number;
  tokensOut: number;
}

export interface SdkRunner {
  run(prompt: string, workdir: string): Promise<SdkRunResult>;
}

export class ClaudeSdkRunner implements SdkRunner {
  constructor(private timeoutMs: number = 60_000) {}

  async run(prompt: string, workdir: string): Promise<SdkRunResult> {
    const session = query({
      prompt,
      options: {
        cwd: workdir,
        settingSources: ["local"],
        permissionMode: "bypassPermissions",
        maxTurns: 5,
      },
    });

    let output = "";
    let tokensIn = 0;
    let tokensOut = 0;

    const work = (async () => {
      for await (const msg of session) {
        if (msg.type === "assistant") {
          for (const block of msg.message.content) {
            if (block.type === "text") output += block.text;
          }
        }
        if (msg.type === "result") {
          tokensIn = msg.usage.input_tokens ?? 0;
          tokensOut = msg.usage.output_tokens ?? 0;
        }
      }
    })();

    await Promise.race([
      work,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("SDK timeout")), this.timeoutMs),
      ),
    ]);

    return { output, tokensIn, tokensOut };
  }
}

export class FakeSdkRunner implements SdkRunner {
  constructor(private responses: Map<string, SdkRunResult> = new Map()) {}

  setResponse(promptKey: string, result: SdkRunResult): void {
    this.responses.set(promptKey, result);
  }

  async run(prompt: string, _workdir: string): Promise<SdkRunResult> {
    for (const [key, result] of this.responses) {
      if (prompt.includes(key)) return result;
    }
    return { output: "", tokensIn: 0, tokensOut: 0 };
  }
}
```

Note: SDK message shape (e.g. `msg.message.content`, `msg.usage.input_tokens`) follows `@anthropic-ai/claude-agent-sdk` current API. If types mismatch at typecheck, inspect via `grep -r "type.*assistant" node_modules/@anthropic-ai/claude-agent-sdk/dist/*.d.ts` and adjust.

- [ ] **Step 2: typecheck**

```bash
cd C:/bzli/teamagent && pnpm --filter @teamagent/benchmark typecheck 2>&1 | tail -10
```

Expected: 0 errors. If SDK type shape differs, fix imports/fields per actual `.d.ts`.

- [ ] **Step 3: Commit**

```bash
cd C:/bzli/teamagent
git add packages/benchmark/src/sdk-runner.ts
git commit -m "feat(sp2): SdkRunner Port + ClaudeSdkRunner + FakeSdkRunner"
```

---

## Task 6: runner (TDD with FakeSdkRunner)

**Files:**
- Create: `packages/benchmark/src/runner.ts`
- Create: `packages/benchmark/src/__tests__/runner.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/benchmark/src/__tests__/runner.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { runTask } from "../runner.js";
import { FakeSdkRunner } from "../sdk-runner.js";
import type { CompiledTask, GroupConfig } from "../types.js";

const task: CompiledTask = {
  id: "t1",
  name: "t",
  category: "x",
  prompt: "make me code",
  evaluator: { type: "pattern", wrong_patterns: ["BAD"], correct_patterns: ["GOOD"] },
  compiledWrongRegex: [/BAD/],
  compiledCorrectRegex: [/GOOD/],
};

const group: GroupConfig = { name: "g1", fixtureDir: "/tmp" };

describe("runTask", () => {
  it("returns correct verdict when SDK output matches correct pattern", async () => {
    const sdk = new FakeSdkRunner();
    sdk.setResponse("make me code", { output: "GOOD code", tokensIn: 10, tokensOut: 20 });
    const result = await runTask(task, group, sdk, "/tmp/wd", 1);
    expect(result.verdict).toBe("correct");
    expect(result.tokensIn).toBe(10);
    expect(result.tokensOut).toBe(20);
    expect(result.run).toBe(1);
  });

  it("returns wrong verdict when SDK output matches wrong pattern", async () => {
    const sdk = new FakeSdkRunner();
    sdk.setResponse("make me code", { output: "BAD code", tokensIn: 5, tokensOut: 5 });
    const result = await runTask(task, group, sdk, "/tmp/wd", 1);
    expect(result.verdict).toBe("wrong");
  });

  it("returns error verdict when SDK throws", async () => {
    const sdk: any = { run: async () => { throw new Error("network down"); } };
    const result = await runTask(task, group, sdk, "/tmp/wd", 1);
    expect(result.verdict).toBe("error");
    expect(result.errorMsg).toContain("network down");
  });

  it("returns neither with reason=empty_response when output empty", async () => {
    const sdk = new FakeSdkRunner();
    sdk.setResponse("make me code", { output: "", tokensIn: 0, tokensOut: 0 });
    const result = await runTask(task, group, sdk, "/tmp/wd", 1);
    expect(result.verdict).toBe("neither");
    expect(result.reason).toBe("empty_response");
  });

  it("populates group, taskId, durationMs", async () => {
    const sdk = new FakeSdkRunner();
    sdk.setResponse("make me code", { output: "GOOD", tokensIn: 1, tokensOut: 1 });
    const result = await runTask(task, group, sdk, "/tmp/wd", 2);
    expect(result.group).toBe("g1");
    expect(result.taskId).toBe("t1");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run tests to verify fail**

```bash
cd C:/bzli/teamagent && pnpm --filter @teamagent/benchmark test runner 2>&1 | tail -10
```

Expected: FAIL `Cannot find module '../runner.js'`.

- [ ] **Step 3: Implement `packages/benchmark/src/runner.ts`**

```typescript
import type { CompiledTask, GroupConfig, TaskResult } from "./types.js";
import type { SdkRunner } from "./sdk-runner.js";
import { evaluatePatterns } from "./evaluator.js";

export async function runTask(
  task: CompiledTask,
  group: GroupConfig,
  sdk: SdkRunner,
  workdir: string,
  run: number,
): Promise<TaskResult> {
  const start = Date.now();
  try {
    const sdkResult = await sdk.run(task.prompt, workdir);
    const durationMs = Date.now() - start;

    if (sdkResult.output === "") {
      return {
        group: group.name,
        taskId: task.id,
        run,
        verdict: "neither",
        reason: "empty_response",
        tokensIn: sdkResult.tokensIn,
        tokensOut: sdkResult.tokensOut,
        durationMs,
        output: "",
      };
    }

    const { verdict, reason } = evaluatePatterns(sdkResult.output, task);
    return {
      group: group.name,
      taskId: task.id,
      run,
      verdict,
      reason,
      tokensIn: sdkResult.tokensIn,
      tokensOut: sdkResult.tokensOut,
      durationMs,
      output: sdkResult.output,
    };
  } catch (e) {
    return {
      group: group.name,
      taskId: task.id,
      run,
      verdict: "error",
      reason: "sdk_error",
      tokensIn: 0,
      tokensOut: 0,
      durationMs: Date.now() - start,
      output: "",
      errorMsg: (e as Error).message,
    };
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
cd C:/bzli/teamagent && pnpm --filter @teamagent/benchmark test runner 2>&1 | tail -10
```

Expected: 5/5 pass.

- [ ] **Step 5: Commit**

```bash
cd C:/bzli/teamagent
git add packages/benchmark/src/runner.ts packages/benchmark/src/__tests__/runner.test.ts
git commit -m "feat(sp2): runTask — SDK call + evaluator + error/empty/timeout handling"
```

---

## Task 7: reporter (TDD)

**Files:**
- Create: `packages/benchmark/src/reporter.ts`
- Create: `packages/benchmark/src/__tests__/reporter.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/benchmark/src/__tests__/reporter.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { aggregate, writeJson, writeMarkdown } from "../reporter.js";
import type { TaskResult, BenchmarkConfig } from "../types.js";

const config: BenchmarkConfig = {
  groups: ["baseline", "teamagent"],
  tasks: "*.json",
  runs: 1,
  outputJson: "out.json",
  outputMarkdown: "out.md",
};

function makeResult(group: string, verdict: TaskResult["verdict"], tokens: number, dur: number): TaskResult {
  return {
    group, taskId: `t-${group}-${verdict}`, run: 1, verdict,
    tokensIn: tokens, tokensOut: tokens, durationMs: dur, output: "out",
  };
}

describe("aggregate", () => {
  it("computes group summaries", () => {
    const results = [
      makeResult("baseline", "wrong", 100, 1000),
      makeResult("baseline", "correct", 100, 2000),
      makeResult("teamagent", "correct", 110, 1500),
      makeResult("teamagent", "correct", 110, 1500),
    ];
    const report = aggregate(results, config);
    const baseline = report.groups.find((g) => g.group === "baseline")!;
    const teamagent = report.groups.find((g) => g.group === "teamagent")!;
    expect(baseline.wrongCount).toBe(1);
    expect(baseline.correctCount).toBe(1);
    expect(teamagent.wrongCount).toBe(0);
    expect(teamagent.correctCount).toBe(2);
    expect(baseline.avgDurationMs).toBe(1500);
  });

  it("computes PRR = (baseline.wrong - teamagent.wrong) / baseline.wrong", () => {
    const results = [
      makeResult("baseline", "wrong", 100, 1000),
      makeResult("baseline", "wrong", 100, 1000),
      makeResult("teamagent", "correct", 100, 1000),
    ];
    const report = aggregate(results, config);
    expect(report.comparison.prr).toBe(1.0); // (2-0)/2
  });

  it("returns prr=0 when baseline has no wrong", () => {
    const results = [
      makeResult("baseline", "correct", 100, 1000),
      makeResult("teamagent", "correct", 100, 1000),
    ];
    const report = aggregate(results, config);
    expect(report.comparison.prr).toBe(0);
  });

  it("counts errors separately", () => {
    const results = [
      makeResult("baseline", "error", 0, 0),
      makeResult("baseline", "wrong", 0, 0),
    ];
    const report = aggregate(results, config);
    const g = report.groups.find((x) => x.group === "baseline")!;
    expect(g.errorCount).toBe(1);
    expect(g.wrongCount).toBe(1);
  });

  it("does not crash on empty results", () => {
    const report = aggregate([], config);
    expect(report.groups).toEqual([]);
  });
});

describe("writeJson + writeMarkdown", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), "bench-rep-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("writeJson writes valid JSON", () => {
    const results = [makeResult("baseline", "wrong", 0, 0)];
    const report = aggregate(results, config);
    const out = path.join(dir, "r.json");
    writeJson(report, out);
    const parsed = JSON.parse(readFileSync(out, "utf8"));
    expect(parsed.groups[0].wrongCount).toBe(1);
  });

  it("writeMarkdown writes file with summary table", () => {
    const results = [makeResult("baseline", "wrong", 0, 0)];
    const report = aggregate(results, config);
    const out = path.join(dir, "r.md");
    writeMarkdown(report, out);
    const md = readFileSync(out, "utf8");
    expect(md).toContain("# Benchmark Report");
    expect(md).toContain("baseline");
  });
});
```

- [ ] **Step 2: Run tests to verify fail**

```bash
cd C:/bzli/teamagent && pnpm --filter @teamagent/benchmark test reporter 2>&1 | tail -10
```

Expected: FAIL `Cannot find module '../reporter.js'`.

- [ ] **Step 3: Implement `packages/benchmark/src/reporter.ts`**

```typescript
import { writeFileSync } from "node:fs";
import type { BenchmarkConfig, GroupSummary, Report, TaskResult } from "./types.js";

export function aggregate(results: TaskResult[], config: BenchmarkConfig): Report {
  const groupNames = [...new Set(results.map((r) => r.group))];
  const groups: GroupSummary[] = groupNames.map((name) => {
    const rows = results.filter((r) => r.group === name);
    const wrongCount = rows.filter((r) => r.verdict === "wrong").length;
    const correctCount = rows.filter((r) => r.verdict === "correct").length;
    const neitherCount = rows.filter((r) => r.verdict === "neither").length;
    const errorCount = rows.filter((r) => r.verdict === "error").length;
    const totalTokensIn = rows.reduce((s, r) => s + r.tokensIn, 0);
    const totalTokensOut = rows.reduce((s, r) => s + r.tokensOut, 0);
    const avgDurationMs = rows.length > 0 ? rows.reduce((s, r) => s + r.durationMs, 0) / rows.length : 0;
    return { group: name, wrongCount, correctCount, neitherCount, errorCount, totalTokensIn, totalTokensOut, avgDurationMs };
  });

  const baseline = groups.find((g) => g.group === "baseline");
  const teamagent = groups.find((g) => g.group === "teamagent");
  let prr = 0;
  let tokenDeltaPercent = 0;
  let durationDeltaPercent = 0;
  if (baseline && teamagent && baseline.wrongCount > 0) {
    prr = (baseline.wrongCount - teamagent.wrongCount) / baseline.wrongCount;
  }
  if (baseline && teamagent && baseline.totalTokensOut > 0) {
    const baseTotal = baseline.totalTokensIn + baseline.totalTokensOut;
    const teamTotal = teamagent.totalTokensIn + teamagent.totalTokensOut;
    tokenDeltaPercent = (teamTotal - baseTotal) / baseTotal;
  }
  if (baseline && teamagent && baseline.avgDurationMs > 0) {
    durationDeltaPercent = (teamagent.avgDurationMs - baseline.avgDurationMs) / baseline.avgDurationMs;
  }

  return {
    generatedAt: new Date().toISOString(),
    config,
    groups,
    comparison: { prr, tokenDeltaPercent, durationDeltaPercent },
    rawResults: results,
  };
}

export function writeJson(report: Report, outputPath: string): void {
  writeFileSync(outputPath, JSON.stringify(report, null, 2));
}

export function writeMarkdown(report: Report, outputPath: string): void {
  const lines: string[] = [];
  lines.push(`# Benchmark Report — ${report.generatedAt.slice(0, 10)}`);
  lines.push("");
  lines.push(`**Config**: ${report.config.groups.length} groups × runs=${report.config.runs}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push("| Group | Wrong | Correct | Neither | Error | Tokens (in/out) | Avg Duration |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const g of report.groups) {
    lines.push(`| ${g.group} | ${g.wrongCount} | ${g.correctCount} | ${g.neitherCount} | ${g.errorCount} | ${g.totalTokensIn} / ${g.totalTokensOut} | ${g.avgDurationMs.toFixed(0)}ms |`);
  }
  lines.push("");
  lines.push(`**PRR**: ${(report.comparison.prr * 100).toFixed(1)}%`);
  lines.push(`**Token Delta**: ${(report.comparison.tokenDeltaPercent * 100).toFixed(1)}%`);
  lines.push(`**Duration Delta**: ${(report.comparison.durationDeltaPercent * 100).toFixed(1)}%`);
  lines.push("");
  lines.push("## Per-Task Breakdown");
  lines.push("");
  for (const r of report.rawResults) {
    lines.push(`- [${r.group}] ${r.taskId} run=${r.run} → **${r.verdict}** (${r.durationMs}ms${r.reason ? `, ${r.reason}` : ""})`);
  }
  writeFileSync(outputPath, lines.join("\n"));
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
cd C:/bzli/teamagent && pnpm --filter @teamagent/benchmark test reporter 2>&1 | tail -10
```

Expected: 7/7 pass.

- [ ] **Step 5: Commit**

```bash
cd C:/bzli/teamagent
git add packages/benchmark/src/reporter.ts packages/benchmark/src/__tests__/reporter.test.ts
git commit -m "feat(sp2): reporter — aggregate + PRR + token/duration deltas + JSON/MD output"
```

---

## Task 8: bin orchestrator + fixtures

**Files:**
- Create: `packages/benchmark/src/bin.ts`
- Create: `packages/benchmark/fixtures/tasks/001-moment-vs-dayjs.json`
- Create: `packages/benchmark/fixtures/tasks/002-axios-cancel.json`
- Create: `packages/benchmark/fixtures/tasks/003-react-key.json`
- Create: `packages/benchmark/fixtures/groups/baseline/settings.template.json`
- Create: `packages/benchmark/fixtures/groups/teamagent/settings.template.json`
- Create: `packages/benchmark/fixtures/groups/teamagent/seed.sql`
- Modify: root `package.json`

- [ ] **Step 1: Create 3 task fixtures**

`packages/benchmark/fixtures/tasks/001-moment-vs-dayjs.json`:
```json
{
  "id": "001-moment-vs-dayjs",
  "name": "moment vs dayjs",
  "category": "tech_choice",
  "prompt": "Write a small TypeScript snippet that imports a date library and formats today's date as YYYY-MM-DD. Show only the import statement and the format call.",
  "evaluator": {
    "type": "pattern",
    "wrong_patterns": ["from ['\"]moment['\"]", "require\\(['\"]moment['\"]\\)"],
    "correct_patterns": ["from ['\"]dayjs['\"]", "require\\(['\"]dayjs['\"]\\)"]
  }
}
```

`packages/benchmark/fixtures/tasks/002-axios-cancel.json`:
```json
{
  "id": "002-axios-cancel",
  "name": "axios cancel request",
  "category": "api_currency",
  "prompt": "Show me how to cancel an axios HTTP request. Use a small TypeScript example.",
  "evaluator": {
    "type": "pattern",
    "wrong_patterns": ["CancelToken", "axios\\.Cancel"],
    "correct_patterns": ["AbortController", "AbortSignal", "signal:"]
  }
}
```

`packages/benchmark/fixtures/tasks/003-react-key.json`:
```json
{
  "id": "003-react-key",
  "name": "react list key",
  "category": "framework",
  "prompt": "Render a React list of items. Show the JSX for the .map() call.",
  "evaluator": {
    "type": "pattern",
    "wrong_patterns": ["key=\\{index\\}", "key=\\{i\\}"],
    "correct_patterns": ["key=\\{[a-zA-Z][a-zA-Z0-9_.]*\\.id\\}", "key=\\{item\\.id\\}"]
  }
}
```

- [ ] **Step 2: Create baseline settings template**

`packages/benchmark/fixtures/groups/baseline/settings.template.json`:
```json
{
  "hooks": {}
}
```

- [ ] **Step 3: Create teamagent settings template**

`packages/benchmark/fixtures/groups/teamagent/settings.template.json`:
```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "", "hooks": [{ "type": "command", "command": "node {{HOOK_DIR}}/bin-pre-tool-use.cjs" }] }
    ],
    "PostToolUse": [
      { "matcher": "", "hooks": [{ "type": "command", "command": "node {{HOOK_DIR}}/bin-post-tool-use.cjs" }] }
    ],
    "UserPromptSubmit": [
      { "matcher": "", "hooks": [{ "type": "command", "command": "node {{HOOK_DIR}}/bin-user-prompt-submit.cjs" }] }
    ]
  }
}
```

- [ ] **Step 4: Create teamagent seed.sql**

The seed needs to insert: a knowledge entry for moment→dayjs rule + a wiki entry for axios AbortSignal.

First read the actual schema to know correct table/column names:

```bash
cd C:/bzli/teamagent && grep -E "CREATE TABLE" packages/adapters/src/storage/sqlite/schema.ts | head -20
```

`packages/benchmark/fixtures/groups/teamagent/seed.sql`:
```sql
-- Rule: moment → dayjs (for hook intercept test)
INSERT INTO knowledge (id, scope, category, title, content, weight, source, created_at, updated_at, tags, status)
VALUES (
  'rule-moment-dayjs',
  'project',
  'C',
  'Use dayjs instead of moment',
  'Project standard: prefer dayjs over moment for date handling. Moment is in maintenance mode.',
  90,
  'manual',
  datetime('now'),
  datetime('now'),
  '["date","library","moment","dayjs"]',
  'active'
);

INSERT INTO rule_meta (knowledge_id, confidence, demerit, current_tier, max_tier_ever, observation_count, last_updated)
VALUES ('rule-moment-dayjs', 0.88, 0, 'stable', 'stable', 10, datetime('now'));

-- Wiki: axios AbortSignal (for inline injection test)
INSERT INTO knowledge (id, scope, category, title, content, weight, source, created_at, updated_at, tags, status)
VALUES (
  'wiki-axios-abort',
  'project',
  'W',
  'axios AbortSignal native support',
  'axios 1.x supports AbortController/AbortSignal natively. The deprecated CancelToken API should not be used.',
  70,
  'wiki',
  datetime('now'),
  datetime('now'),
  '["axios","AbortSignal","cancel"]',
  'active'
);

INSERT INTO wiki_meta (knowledge_id, source_url, source_type, published_at, tldr, keywords, user_thumbs_down, inline_injection_count, last_injected_at)
VALUES (
  'wiki-axios-abort',
  'https://github.com/axios/axios/releases',
  'github_release',
  datetime('now', '-30 days'),
  'axios 1.x supports AbortController natively, CancelToken is deprecated',
  '["axios","AbortSignal","cancel"]',
  0,
  0,
  NULL
);
```

NOTE: column names above may need adjustment after Step's grep. If actual schema differs (e.g. `weight` does not exist, or `status` is named differently), edit seed.sql to match. The wiki_meta INSERT must include any NOT NULL columns. Run grep first; reconcile.

For the wiki injection to retrieve this entry, knowledge_vec also needs an embedding. **For v1, skip vec embedding** — wiki injection cosine search will return [] (sqlite-vec native binding may not be loaded), but the hook will still exit cleanly. The teamagent group's PRR signal comes from PreToolUse intercepting moment, not from wiki injection.

- [ ] **Step 5: Implement `packages/benchmark/src/bin.ts`**

```typescript
#!/usr/bin/env node
import path from "node:path";
import { existsSync } from "node:fs";
import { loadTasks } from "./task-loader.js";
import { createGroupWorkdir, cleanupGroupWorkdir } from "./isolator.js";
import { ClaudeSdkRunner } from "./sdk-runner.js";
import { runTask } from "./runner.js";
import { aggregate, writeJson, writeMarkdown } from "./reporter.js";
import type { BenchmarkConfig, GroupConfig, TaskResult } from "./types.js";

function parseArgs(argv: string[]): BenchmarkConfig {
  const args = new Map<string, string>();
  for (const a of argv) {
    const m = /^--(\w[\w-]*)=(.+)$/.exec(a);
    if (m) args.set(m[1]!, m[2]!);
  }
  return {
    groups: (args.get("groups") ?? "baseline,teamagent").split(","),
    tasks: args.get("tasks") ?? "all",
    runs: Number(args.get("runs") ?? "1"),
    outputJson: args.get("output-json") ?? "bench-report.json",
    outputMarkdown: args.get("output-md") ?? "bench-report.md",
  };
}

async function main(): Promise<void> {
  const config = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(import.meta.dirname, "..", "..", "..");
  const fixturesDir = path.resolve(import.meta.dirname, "..", "fixtures");
  const hookDir = path.join(repoRoot, "packages", "cli", "dist");
  const tasksGlob = config.tasks === "all"
    ? path.join(fixturesDir, "tasks", "*.json")
    : path.join(fixturesDir, "tasks", `${config.tasks}*.json`);

  // Pre-checks
  if (!process.env["ANTHROPIC_API_KEY"]) {
    console.error("ERROR: ANTHROPIC_API_KEY not set"); process.exit(1);
  }
  if (config.groups.includes("teamagent")) {
    const required = ["bin-pre-tool-use.cjs", "bin-post-tool-use.cjs", "bin-user-prompt-submit.cjs"];
    for (const f of required) {
      if (!existsSync(path.join(hookDir, f))) {
        console.error(`ERROR: hook bundle missing: ${f}\nRun: pnpm --filter @teamagent/cli build:hook`);
        process.exit(1);
      }
    }
  }

  const tasks = await loadTasks(tasksGlob);
  if (tasks.length === 0) { console.error("ERROR: no tasks loaded"); process.exit(1); }
  console.log(`Loaded ${tasks.length} tasks; ${config.groups.length} groups × ${config.runs} runs = ${tasks.length * config.groups.length * config.runs} invocations`);

  const sdk = new ClaudeSdkRunner();
  const allResults: TaskResult[] = [];
  let stepIdx = 0;
  const totalSteps = tasks.length * config.groups.length * config.runs;

  for (const groupName of config.groups) {
    const groupCfg: GroupConfig = { name: groupName, fixtureDir: path.join(fixturesDir, "groups", groupName) };
    let workdir: string;
    try {
      workdir = await createGroupWorkdir(groupCfg, hookDir);
    } catch (e) {
      console.error(`Failed to create workdir for ${groupName}: ${(e as Error).message}`);
      continue;
    }
    console.log(`Group ${groupName} workdir: ${workdir}`);

    for (const task of tasks) {
      for (let run = 1; run <= config.runs; run++) {
        stepIdx++;
        process.stdout.write(`[${stepIdx}/${totalSteps}] ${groupName}/${task.id} run=${run} ... `);
        const r = await runTask(task, groupCfg, sdk, workdir, run);
        allResults.push(r);
        process.stdout.write(`${r.verdict} (${r.durationMs}ms)\n`);
      }
    }
    cleanupGroupWorkdir(workdir);
  }

  const report = aggregate(allResults, config);
  writeJson(report, config.outputJson);
  writeMarkdown(report, config.outputMarkdown);
  console.log(`\nReport written: ${config.outputJson} + ${config.outputMarkdown}`);
  console.log(`PRR: ${(report.comparison.prr * 100).toFixed(1)}%`);

  if (allResults.every((r) => r.verdict === "error")) process.exit(2);
}

main().catch((e) => { console.error(e); process.exit(2); });
```

- [ ] **Step 6: Add root script**

Read root `package.json`. Add to `scripts`:
```json
"benchmark": "pnpm --filter @teamagent/benchmark bench"
```

- [ ] **Step 7: typecheck + tests**

```bash
cd C:/bzli/teamagent && pnpm --filter @teamagent/benchmark typecheck 2>&1 | tail -10
cd C:/bzli/teamagent && pnpm --filter @teamagent/benchmark test 2>&1 | tail -10
```

Expected: 0 typecheck errors. All unit tests pass.

- [ ] **Step 8: Commit**

```bash
cd C:/bzli/teamagent
git add packages/benchmark/src/bin.ts packages/benchmark/fixtures/ package.json
git commit -m "feat(sp2): bin orchestrator + 3 task fixtures + 2 group templates + seed.sql"
```

---

## Task 9: Walking Skeleton — actual benchmark run

**Files:**
- None new. Verify the full path works end-to-end.

- [ ] **Step 1: Build hook bundle**

```bash
cd C:/bzli/teamagent && pnpm --filter @teamagent/cli build:hook 2>&1 | tail -5
```

Expected: 3 .cjs files in `packages/cli/dist/`.

- [ ] **Step 2: Verify ANTHROPIC_API_KEY is set**

```bash
echo "API key set: ${ANTHROPIC_API_KEY:+yes}${ANTHROPIC_API_KEY:-NO}"
```

If "NO" → set it: `export ANTHROPIC_API_KEY=sk-ant-...` (or have user do so).

- [ ] **Step 3: Run baseline only first (cheaper smoke test)**

```bash
cd C:/bzli/teamagent && pnpm benchmark --groups=baseline --tasks=001 --runs=1
```

Expected: exit 0, prints `[1/1] baseline/001-moment-vs-dayjs ... wrong|correct|neither (Xms)`, generates `bench-report.json` + `bench-report.md`.

If verdict is `error` — read errorMsg from JSON and debug SDK call. Common issues:
- API key invalid → 401
- SDK message shape changed → adapt sdk-runner.ts
- maxTurns too low → increase

- [ ] **Step 4: Run full comparison**

```bash
cd C:/bzli/teamagent && pnpm benchmark --groups=baseline,teamagent --tasks=all --runs=1 2>&1 | tail -30
```

Expected: 6 invocations succeed (or at least 4). Final summary shows non-zero PRR if hook intercepted moment.

- [ ] **Step 5: Inspect the report**

```bash
cd C:/bzli/teamagent && cat bench-report.md
```

Verify:
- Summary table populated for both groups
- baseline shows `wrong=1` for 001-moment-vs-dayjs
- teamagent shows `correct` or `neither` for same task (proves hook intercepted)

If teamagent also shows `wrong=1` for moment task → hook did not intercept. Debug:
- `cat bench-report.json | grep -A 5 "001"` — see actual output text
- Check `workdir` was preserved (skip cleanup) and inspect `.claude/settings.local.json` to verify hook command is correctly substituted
- Manually invoke: `echo '{}' | node packages/cli/dist/bin-pre-tool-use.cjs` should not crash

- [ ] **Step 6: Run full test + typecheck**

```bash
cd C:/bzli/teamagent && pnpm test 2>&1 | tail -10
cd C:/bzli/teamagent && pnpm typecheck 2>&1 | grep -E "error TS" | head -10
```

Expected: no new test failures (pre-existing M2.6 EBUSY OK), no new typecheck errors.

- [ ] **Step 7: Final commit (gitignore reports)**

Add to root `.gitignore`:
```
bench-report.json
bench-report.md
```

Then:
```bash
cd C:/bzli/teamagent
git add .gitignore
git commit -m "chore(sp2): gitignore benchmark reports"
```

If walking skeleton confirmed PRR > 0 in step 5 — done. Spec DoD #3 satisfied (baseline beat teamagent on at least 1 task).

If walking skeleton showed PRR = 0 — file a follow-up issue, mark task done with caveat. The benchmark infrastructure is the v1 deliverable; non-zero PRR is the validation signal but may need rule/seed tuning.

---

## Self-Review Checklist

**Spec coverage:**
- ✅ §3 Module boundaries → Tasks 1-7 (one task per file)
- ✅ §3.2 Fixtures structure → Task 8 (3 tasks + 2 templates + seed.sql)
- ✅ §3.3 Task JSON format → Task 8 fixtures match schema in Task 2
- ✅ §3.4 Verdict three states → Task 3 evaluator + Task 6 runner adds error/neither_empty
- ✅ §4 Data flow → Task 8 bin.ts implements full orchestration
- ✅ §5 Error handling → Task 6 runner (SDK error → verdict=error), Task 8 bin (pre-checks fail-fast)
- ✅ §6 Test strategy → 5 unit test files (Tasks 2-7); walking skeleton (Task 9)
- ✅ §6.4 SdkRunner injection → Task 5 (Port + Fake + real)
- ✅ §7 DoD #1-9 → Task 9 walking skeleton steps verify each
- ✅ §8 Integration: only @teamagent/adapters openDb dependency → Task 1 package.json + Task 4 isolator

**Type consistency:**
- `Verdict` type defined Task 1, used Tasks 3/6/7 ✅
- `CompiledTask` defined Task 1, returned by `loadTasks` Task 2, consumed by `evaluatePatterns` Task 3 + `runTask` Task 6 ✅
- `GroupConfig` defined Task 1, used Tasks 4/6/8 ✅
- `TaskResult` defined Task 1, returned by `runTask` Task 6, aggregated Task 7 ✅
- `Report.comparison.prr` Task 1 → computed Task 7 → printed Task 8 ✅
- `SdkRunner` interface Task 5 → injected Task 6 (test + runner) → real impl Task 5 → used Task 8 bin ✅

**No placeholders:** every code block contains real implementation. Walking Skeleton Task 9 includes actual debug steps for common failures.

**Risk:** Task 8 seed.sql column names assumed without reading actual schema — Step 4 includes `grep` to reconcile. If this drifts, fix inline at execution.
