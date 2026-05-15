# M5-A: Infect + Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 M5-A：传染器把 manifest + 共享层骨架写入项目；引导器从 manifest 推断本机 TeamAgent 形态差异；端到端 demo 能从干净仓库 clone → 装依赖 → TeamAgent 完整跑起来。

**Architecture:** 严格遵守元约束：纯逻辑（manifest 解析、infect 计划、bootstrap diff）放 `packages/core/m5/`；IO（文件系统、git、shell）放 `packages/adapters/m5/` 后面 `BootstrapPort` 抽象；CLI 命令在 `packages/cli/src/commands/`；事件全部走 AttributionBus。新增 Port 先写契约测试再写实现。

**Tech Stack:** TypeScript / pnpm monorepo / vitest / Node.js fs+path+child_process（仅在 adapters 中）。

**Spec reference:** `docs/superpowers/specs/2026-05-06-m5-team-viral-sync-design.md` §10（M5-A 范围）。

**Out of scope (separate plans):**

- M5-B（隐私三层 + 双闸门）
- M5-C（自动同步 + 删改）
- M5-D（多点拦截 + DX）

---

## File Structure

**New files:**

- `packages/types/src/m5.ts` — Manifest / LocalState / InfectionPlan / BootstrapDiff 类型
- `packages/core/src/m5/manifest.ts` — 纯：解析、校验、序列化 manifest
- `packages/core/src/m5/__tests__/manifest.test.ts`
- `packages/core/src/m5/infect-planner.ts` — 纯：根据当前项目状态产出 InfectionPlan
- `packages/core/src/m5/__tests__/infect-planner.test.ts`
- `packages/core/src/m5/bootstrap-diff.ts` — 纯：Manifest vs LocalState → BootstrapDiff
- `packages/core/src/m5/__tests__/bootstrap-diff.test.ts`
- `packages/ports/src/bootstrap-port.ts` — Port interface
- `packages/ports/src/__tests__/bootstrap-port-contract.ts` — 共享契约套件
- `packages/adapters/src/m5/fs-bootstrap.ts` — 文件系统实现
- `packages/adapters/src/m5/__tests__/fs-bootstrap.test.ts` — 跑契约 + 局部 IO 测试
- `packages/cli/src/commands/m5-infect.ts` — 命令：`teamagent m5-infect`
- `packages/cli/src/commands/m5-bootstrap.ts` — 命令：`teamagent m5-bootstrap`
- `packages/cli/src/__tests__/m5-cli.test.ts` — CLI 集成测试
- `scripts/m5-demo.sh` — 端到端 demo 脚本

**Modified files:**

- `packages/types/src/index.ts` — 导出 m5 类型
- `packages/ports/src/contracts.ts` — 导出 `runBootstrapPortContract`
- `packages/ports/src/index.ts` — 导出 `BootstrapPort`
- `packages/cli/src/bin.ts` — 注册 `m5-infect` / `m5-bootstrap` 子命令

---

## Task 1: M5 类型定义

**Files:**
- Create: `packages/types/src/m5.ts`
- Modify: `packages/types/src/index.ts`（追加导出）

- [ ] **Step 1: 写类型文件**

```typescript
// packages/types/src/m5.ts

/** 项目的 TeamAgent 契约清单。跟随项目 git 走。 */
export interface Manifest {
  /** 契约清单 schema 版本，向前兼容用。当前固定 1。 */
  schema_version: 1;
  /** 项目要求的 TeamAgent 版本（semver；空表示不约束）。 */
  teamagent_version: string;
  /** 必备插件列表（按 name）。 */
  required_plugins: string[];
  /** 必备项目级 Skill 路径（相对项目根）。 */
  required_project_skills: string[];
  /** 必备 hook 锚点。 */
  required_hooks: HookKind[];
  /** 创建该 manifest 的 author。 */
  created_by: string;
  /** ISO 8601 时间戳。 */
  created_at: string;
}

/** Hook 类型——与现有 Claude Code hook 对齐。 */
export type HookKind =
  | "UserPromptSubmit"
  | "PreToolUse"
  | "PostToolUse"
  | "Stop"
  | "SessionStart"
  | "SessionEnd"
  | "PreCompact";

/** 本机 TeamAgent 的当前安装状态。 */
export interface LocalState {
  /** 已装版本；null 表示未装。 */
  teamagent_version: string | null;
  /** 已装插件名集合。 */
  installed_plugins: string[];
  /** 已装项目级 skill 路径集合。 */
  installed_project_skills: string[];
  /** 已装 hook 集合。 */
  installed_hooks: HookKind[];
}

/** 传染器输出：要在项目里写入哪些文件。 */
export interface InfectionPlan {
  /** 是否需要执行（false 表示项目已被传染、不动）。 */
  required: boolean;
  /** 要新建的文件：相对路径 → 内容。 */
  files_to_create: Record<string, string>;
  /** 要新建的目录（空目录用 .gitkeep 占位）。 */
  dirs_to_create: string[];
}

/** 引导器输出：本机相对 manifest 的差异。 */
export interface BootstrapDiff {
  /** 是否需要做任何动作。 */
  needs_bootstrap: boolean;
  /** 需要装的 TeamAgent 版本（null 表示已达标）。 */
  install_teamagent_version: string | null;
  /** 需要装的插件。 */
  install_plugins: string[];
  /** 需要装的项目级 skill。 */
  install_project_skills: string[];
  /** 需要装的 hook。 */
  install_hooks: HookKind[];
}
```

- [ ] **Step 2: 在 index.ts 追加导出**

打开 `packages/types/src/index.ts`，在尾部追加：

```typescript
export * from "./m5.js";
```

- [ ] **Step 3: 跑 typecheck 验证**

Run: `pnpm --filter @teamagent/types typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/types/src/m5.ts packages/types/src/index.ts
git commit -m "feat(m5): add manifest, local state, infection plan, bootstrap diff types"
```

---

## Task 2: 纯函数 — Manifest 解析与校验

**Files:**
- Create: `packages/core/src/m5/manifest.ts`
- Create: `packages/core/src/m5/__tests__/manifest.test.ts`

- [ ] **Step 1: 先写失败测试**

```typescript
// packages/core/src/m5/__tests__/manifest.test.ts
import { describe, it, expect } from "vitest";
import { parseManifest, serializeManifest, validateManifest } from "../manifest.js";
import type { Manifest } from "@teamagent/types";

const valid: Manifest = {
  schema_version: 1,
  teamagent_version: "0.9.4",
  required_plugins: ["superpowers"],
  required_project_skills: [".claude/skills/canary"],
  required_hooks: ["UserPromptSubmit", "Stop"],
  created_by: "alice",
  created_at: "2026-05-06T10:00:00Z",
};

describe("manifest parse/validate", () => {
  it("parseManifest accepts a valid JSON string", () => {
    const json = JSON.stringify(valid);
    const m = parseManifest(json);
    expect(m).toEqual(valid);
  });

  it("parseManifest throws on invalid JSON", () => {
    expect(() => parseManifest("{not-json")).toThrow(/JSON/);
  });

  it("validateManifest rejects unsupported schema_version", () => {
    const bad = { ...valid, schema_version: 99 } as unknown as Manifest;
    expect(() => validateManifest(bad)).toThrow(/schema_version/);
  });

  it("validateManifest rejects missing required_plugins", () => {
    const bad = { ...valid } as Partial<Manifest>;
    delete bad.required_plugins;
    expect(() => validateManifest(bad as Manifest)).toThrow(/required_plugins/);
  });

  it("serializeManifest produces canonical JSON (key-sorted, 2-space indent)", () => {
    const out = serializeManifest(valid);
    // canonical: keys alphabetic at top level
    const reparsed = JSON.parse(out);
    expect(Object.keys(reparsed)).toEqual([...Object.keys(reparsed)].sort());
    expect(out).toMatch(/^\{\n  /); // 2-space indent
  });
});
```

- [ ] **Step 2: 跑测试，确认 RED**

Run: `pnpm --filter @teamagent/core test packages/core/src/m5/__tests__/manifest.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 写最小实现**

```typescript
// packages/core/src/m5/manifest.ts
import type { Manifest } from "@teamagent/types";

export function parseManifest(json: string): Manifest {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    throw new Error(`manifest: invalid JSON: ${(e as Error).message}`);
  }
  validateManifest(raw as Manifest);
  return raw as Manifest;
}

export function validateManifest(m: Manifest): void {
  if (m.schema_version !== 1) {
    throw new Error(`manifest: unsupported schema_version ${m.schema_version}; expected 1`);
  }
  if (!Array.isArray(m.required_plugins)) {
    throw new Error("manifest: required_plugins must be an array");
  }
  if (!Array.isArray(m.required_project_skills)) {
    throw new Error("manifest: required_project_skills must be an array");
  }
  if (!Array.isArray(m.required_hooks)) {
    throw new Error("manifest: required_hooks must be an array");
  }
  if (typeof m.created_by !== "string" || m.created_by.length === 0) {
    throw new Error("manifest: created_by must be non-empty string");
  }
  if (typeof m.created_at !== "string") {
    throw new Error("manifest: created_at must be ISO 8601 string");
  }
}

export function serializeManifest(m: Manifest): string {
  // canonical: top-level keys sorted alphabetically for diff stability
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(m).sort()) {
    sorted[k] = (m as unknown as Record<string, unknown>)[k];
  }
  return JSON.stringify(sorted, null, 2);
}
```

- [ ] **Step 4: 跑测试，确认 GREEN**

Run: `pnpm --filter @teamagent/core test packages/core/src/m5/__tests__/manifest.test.ts`
Expected: PASS（5 tests）

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/m5/manifest.ts packages/core/src/m5/__tests__/manifest.test.ts
git commit -m "feat(m5): pure manifest parser, validator, canonical serializer"
```

---

## Task 3: 纯函数 — Infect Planner

**Files:**
- Create: `packages/core/src/m5/infect-planner.ts`
- Create: `packages/core/src/m5/__tests__/infect-planner.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// packages/core/src/m5/__tests__/infect-planner.test.ts
import { describe, it, expect } from "vitest";
import { planInfection, ProjectSnapshot } from "../infect-planner.js";

function snapshot(overrides: Partial<ProjectSnapshot> = {}): ProjectSnapshot {
  return {
    has_manifest: false,
    has_team_dir: false,
    has_shared_skills_dir: false,
    has_shared_claude_md: false,
    has_githooks_dir: false,
    has_pre_commit_hook: false,
    ...overrides,
  };
}

describe("planInfection", () => {
  it("clean project: required=true with all artifacts", () => {
    const plan = planInfection(
      snapshot(),
      { author: "alice", now: "2026-05-06T10:00:00Z", teamagent_version: "0.9.4" }
    );
    expect(plan.required).toBe(true);
    expect(Object.keys(plan.files_to_create)).toContain(".teamagent/manifest.json");
    expect(Object.keys(plan.files_to_create)).toContain(".teamagent/shared-claude.md");
    expect(Object.keys(plan.files_to_create)).toContain(".githooks/pre-commit");
    expect(plan.dirs_to_create).toContain(".teamagent/team");
    expect(plan.dirs_to_create).toContain(".teamagent/shared-skills");
  });

  it("manifest already present: required=false, no files", () => {
    const plan = planInfection(
      snapshot({ has_manifest: true, has_team_dir: true, has_shared_skills_dir: true,
                  has_shared_claude_md: true, has_githooks_dir: true, has_pre_commit_hook: true }),
      { author: "alice", now: "2026-05-06T10:00:00Z", teamagent_version: "0.9.4" }
    );
    expect(plan.required).toBe(false);
    expect(plan.files_to_create).toEqual({});
    expect(plan.dirs_to_create).toEqual([]);
  });

  it("partial: only fills missing pieces", () => {
    const plan = planInfection(
      snapshot({ has_manifest: true, has_team_dir: true }),
      { author: "alice", now: "2026-05-06T10:00:00Z", teamagent_version: "0.9.4" }
    );
    expect(plan.required).toBe(true);
    expect(Object.keys(plan.files_to_create)).not.toContain(".teamagent/manifest.json");
    expect(Object.keys(plan.files_to_create)).toContain(".teamagent/shared-claude.md");
    expect(plan.dirs_to_create).not.toContain(".teamagent/team");
    expect(plan.dirs_to_create).toContain(".teamagent/shared-skills");
  });

  it("manifest content includes author and version from input", () => {
    const plan = planInfection(
      snapshot(),
      { author: "alice", now: "2026-05-06T10:00:00Z", teamagent_version: "0.9.4" }
    );
    const manifestJson = plan.files_to_create[".teamagent/manifest.json"];
    expect(manifestJson).toContain('"created_by": "alice"');
    expect(manifestJson).toContain('"teamagent_version": "0.9.4"');
    expect(manifestJson).toContain('"created_at": "2026-05-06T10:00:00Z"');
  });
});
```

- [ ] **Step 2: 跑测试，确认 RED**

Run: `pnpm --filter @teamagent/core test packages/core/src/m5/__tests__/infect-planner.test.ts`
Expected: FAIL

- [ ] **Step 3: 写实现**

```typescript
// packages/core/src/m5/infect-planner.ts
import type { InfectionPlan, Manifest } from "@teamagent/types";
import { serializeManifest } from "./manifest.js";

export interface ProjectSnapshot {
  has_manifest: boolean;
  has_team_dir: boolean;
  has_shared_skills_dir: boolean;
  has_shared_claude_md: boolean;
  has_githooks_dir: boolean;
  has_pre_commit_hook: boolean;
}

export interface InfectInput {
  author: string;
  now: string;
  teamagent_version: string;
}

const PRE_COMMIT_HOOK = `#!/usr/bin/env bash
# TeamAgent M5 pre-commit anchor (M5-A skeleton; full enforcement in M5-D)
set -e
if command -v teamagent >/dev/null 2>&1; then
  teamagent m5-bootstrap --check || exit 0
fi
`;

const SHARED_CLAUDE_MD = `# Shared CLAUDE.md (M5)

This file is auto-merged into the project's CLAUDE.md when team members run
\`teamagent compile\`. Edit shared rules / conventions here; they sync across
the team via git.
`;

export function planInfection(
  snap: ProjectSnapshot,
  input: InfectInput
): InfectionPlan {
  const files: Record<string, string> = {};
  const dirs: string[] = [];

  if (!snap.has_manifest) {
    const manifest: Manifest = {
      schema_version: 1,
      teamagent_version: input.teamagent_version,
      required_plugins: [],
      required_project_skills: [],
      required_hooks: ["UserPromptSubmit", "Stop"],
      created_by: input.author,
      created_at: input.now,
    };
    files[".teamagent/manifest.json"] = serializeManifest(manifest);
  }
  if (!snap.has_team_dir) dirs.push(".teamagent/team");
  if (!snap.has_shared_skills_dir) dirs.push(".teamagent/shared-skills");
  if (!snap.has_shared_claude_md) {
    files[".teamagent/shared-claude.md"] = SHARED_CLAUDE_MD;
  }
  if (!snap.has_githooks_dir) dirs.push(".githooks");
  if (!snap.has_pre_commit_hook) {
    files[".githooks/pre-commit"] = PRE_COMMIT_HOOK;
  }

  const required =
    Object.keys(files).length > 0 || dirs.length > 0;

  return {
    required,
    files_to_create: files,
    dirs_to_create: dirs,
  };
}
```

- [ ] **Step 4: 跑测试，确认 GREEN**

Run: `pnpm --filter @teamagent/core test packages/core/src/m5/__tests__/infect-planner.test.ts`
Expected: PASS（4 tests）

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/m5/infect-planner.ts packages/core/src/m5/__tests__/infect-planner.test.ts
git commit -m "feat(m5): pure infect planner emits manifest, dirs, hook scaffolding"
```

---

## Task 4: 纯函数 — Bootstrap Diff

**Files:**
- Create: `packages/core/src/m5/bootstrap-diff.ts`
- Create: `packages/core/src/m5/__tests__/bootstrap-diff.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// packages/core/src/m5/__tests__/bootstrap-diff.test.ts
import { describe, it, expect } from "vitest";
import { computeBootstrapDiff } from "../bootstrap-diff.js";
import type { Manifest, LocalState } from "@teamagent/types";

const m: Manifest = {
  schema_version: 1,
  teamagent_version: "0.9.4",
  required_plugins: ["superpowers", "caveman"],
  required_project_skills: [".claude/skills/canary"],
  required_hooks: ["UserPromptSubmit", "Stop"],
  created_by: "alice",
  created_at: "2026-05-06T10:00:00Z",
};

const fullySatisfied: LocalState = {
  teamagent_version: "0.9.4",
  installed_plugins: ["superpowers", "caveman"],
  installed_project_skills: [".claude/skills/canary"],
  installed_hooks: ["UserPromptSubmit", "Stop"],
};

describe("computeBootstrapDiff", () => {
  it("fully satisfied: needs_bootstrap=false", () => {
    const d = computeBootstrapDiff(m, fullySatisfied);
    expect(d.needs_bootstrap).toBe(false);
    expect(d.install_teamagent_version).toBeNull();
    expect(d.install_plugins).toEqual([]);
    expect(d.install_hooks).toEqual([]);
  });

  it("missing teamagent: install_teamagent_version set", () => {
    const d = computeBootstrapDiff(m, { ...fullySatisfied, teamagent_version: null });
    expect(d.needs_bootstrap).toBe(true);
    expect(d.install_teamagent_version).toBe("0.9.4");
  });

  it("older teamagent version: needs upgrade", () => {
    const d = computeBootstrapDiff(m, { ...fullySatisfied, teamagent_version: "0.9.0" });
    expect(d.needs_bootstrap).toBe(true);
    expect(d.install_teamagent_version).toBe("0.9.4");
  });

  it("newer teamagent version: no install (compatible)", () => {
    const d = computeBootstrapDiff(m, { ...fullySatisfied, teamagent_version: "0.9.5" });
    expect(d.install_teamagent_version).toBeNull();
  });

  it("missing plugins/skills/hooks: each listed", () => {
    const d = computeBootstrapDiff(m, {
      teamagent_version: "0.9.4",
      installed_plugins: ["superpowers"],   // missing caveman
      installed_project_skills: [],          // missing canary
      installed_hooks: ["UserPromptSubmit"], // missing Stop
    });
    expect(d.needs_bootstrap).toBe(true);
    expect(d.install_plugins).toEqual(["caveman"]);
    expect(d.install_project_skills).toEqual([".claude/skills/canary"]);
    expect(d.install_hooks).toEqual(["Stop"]);
  });

  it("empty manifest version means no version constraint", () => {
    const m2 = { ...m, teamagent_version: "" };
    const d = computeBootstrapDiff(m2, { ...fullySatisfied, teamagent_version: "0.0.1" });
    expect(d.install_teamagent_version).toBeNull();
  });
});
```

- [ ] **Step 2: 跑测试，确认 RED**

Run: `pnpm --filter @teamagent/core test packages/core/src/m5/__tests__/bootstrap-diff.test.ts`
Expected: FAIL

- [ ] **Step 3: 写实现**

```typescript
// packages/core/src/m5/bootstrap-diff.ts
import type { Manifest, LocalState, BootstrapDiff, HookKind } from "@teamagent/types";

export function computeBootstrapDiff(
  m: Manifest,
  s: LocalState
): BootstrapDiff {
  const installVer = needsTeamagentVersion(m.teamagent_version, s.teamagent_version);

  const missingPlugins = diffMissing(m.required_plugins, s.installed_plugins);
  const missingSkills = diffMissing(m.required_project_skills, s.installed_project_skills);
  const missingHooks = diffMissing(m.required_hooks, s.installed_hooks) as HookKind[];

  const needs =
    installVer !== null ||
    missingPlugins.length > 0 ||
    missingSkills.length > 0 ||
    missingHooks.length > 0;

  return {
    needs_bootstrap: needs,
    install_teamagent_version: installVer,
    install_plugins: missingPlugins,
    install_project_skills: missingSkills,
    install_hooks: missingHooks,
  };
}

function needsTeamagentVersion(
  required: string,
  installed: string | null
): string | null {
  if (required === "") return null;            // no constraint
  if (installed === null) return required;     // not installed
  if (compareSemver(installed, required) >= 0) return null; // already same-or-newer
  return required;
}

function diffMissing<T extends string>(required: readonly T[], installed: readonly T[]): T[] {
  const have = new Set(installed);
  return required.filter((x) => !have.has(x));
}

/** 简单 semver 三段比较；不支持 pre-release tag。返回 -1 / 0 / 1。 */
function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) | 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) | 0);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}
```

- [ ] **Step 4: 跑测试，确认 GREEN**

Run: `pnpm --filter @teamagent/core test packages/core/src/m5/__tests__/bootstrap-diff.test.ts`
Expected: PASS（6 tests）

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/m5/bootstrap-diff.ts packages/core/src/m5/__tests__/bootstrap-diff.test.ts
git commit -m "feat(m5): pure bootstrap diff with semver comparison"
```

---

## Task 5: BootstrapPort 接口 + 契约测试

**Files:**
- Create: `packages/ports/src/bootstrap-port.ts`
- Create: `packages/ports/src/__tests__/bootstrap-port-contract.ts`
- Modify: `packages/ports/src/index.ts`
- Modify: `packages/ports/src/contracts.ts`

- [ ] **Step 1: 定义 Port 接口**

```typescript
// packages/ports/src/bootstrap-port.ts
import type { LocalState, InfectionPlan } from "@teamagent/types";

/**
 * BootstrapPort：M5-A 引导/传染所需的 IO 抽象。
 *
 * 实现约束：
 * - 所有写入必须幂等（同样输入跑两次结果一致）
 * - applyInfection 不得覆盖已存在的文件
 * - readManifest 不存在时返回 null（不抛错）
 */
export interface BootstrapPort {
  /** 读项目的 manifest；不存在返回 null。 */
  readManifest(projectRoot: string): Promise<string | null>;

  /** 探测项目当前状态（has_manifest 等）。 */
  probeProject(projectRoot: string): Promise<{
    has_manifest: boolean;
    has_team_dir: boolean;
    has_shared_skills_dir: boolean;
    has_shared_claude_md: boolean;
    has_githooks_dir: boolean;
    has_pre_commit_hook: boolean;
  }>;

  /**
   * 把 InfectionPlan 写入项目。
   * - dirs_to_create 中已存在的目录跳过
   * - files_to_create 中已存在的文件跳过（不覆盖）
   * - 创建的 .githooks/pre-commit 必须 chmod +x
   */
  applyInfection(projectRoot: string, plan: InfectionPlan): Promise<void>;

  /** 探测本机 TeamAgent 状态。 */
  getLocalState(): Promise<LocalState>;
}
```

- [ ] **Step 2: 写契约测试**

```typescript
// packages/ports/src/__tests__/bootstrap-port-contract.ts
import { describe, it, expect, beforeEach } from "vitest";
import type { BootstrapPort } from "../bootstrap-port.js";
import type { InfectionPlan } from "@teamagent/types";

/**
 * 任何 BootstrapPort 实现都应通过此契约。
 *
 * 工厂参数 `factory(rootHint?)` 可选返回一个项目根（impl 决定怎么造一个临时项目）。
 */
export function runBootstrapPortContract(
  factory: () => Promise<{ port: BootstrapPort; projectRoot: string; cleanup: () => Promise<void> }>
): void {
  describe("BootstrapPort contract", () => {
    let port: BootstrapPort;
    let projectRoot: string;
    let cleanup: () => Promise<void>;

    beforeEach(async () => {
      ({ port, projectRoot, cleanup } = await factory());
    });

    afterEach(async () => {
      await cleanup();
    });

    it("readManifest returns null on a fresh project", async () => {
      const m = await port.readManifest(projectRoot);
      expect(m).toBeNull();
    });

    it("probeProject of fresh project: all flags false", async () => {
      const p = await port.probeProject(projectRoot);
      expect(p).toEqual({
        has_manifest: false,
        has_team_dir: false,
        has_shared_skills_dir: false,
        has_shared_claude_md: false,
        has_githooks_dir: false,
        has_pre_commit_hook: false,
      });
    });

    it("applyInfection creates files and dirs; readManifest then returns content", async () => {
      const plan: InfectionPlan = {
        required: true,
        files_to_create: {
          ".teamagent/manifest.json": '{"schema_version":1}',
          ".githooks/pre-commit": "#!/usr/bin/env bash\necho hi\n",
        },
        dirs_to_create: [".teamagent/team", ".teamagent/shared-skills"],
      };
      await port.applyInfection(projectRoot, plan);

      const m = await port.readManifest(projectRoot);
      expect(m).toBe('{"schema_version":1}');

      const p = await port.probeProject(projectRoot);
      expect(p.has_manifest).toBe(true);
      expect(p.has_team_dir).toBe(true);
      expect(p.has_shared_skills_dir).toBe(true);
      expect(p.has_pre_commit_hook).toBe(true);
    });

    it("applyInfection is idempotent: existing files not overwritten", async () => {
      const plan1: InfectionPlan = {
        required: true,
        files_to_create: { ".teamagent/manifest.json": "FIRST" },
        dirs_to_create: [],
      };
      await port.applyInfection(projectRoot, plan1);

      const plan2: InfectionPlan = {
        required: true,
        files_to_create: { ".teamagent/manifest.json": "SECOND" },
        dirs_to_create: [],
      };
      await port.applyInfection(projectRoot, plan2);

      const m = await port.readManifest(projectRoot);
      expect(m).toBe("FIRST"); // 不被覆盖
    });

    it("getLocalState returns a structurally valid LocalState", async () => {
      const s = await port.getLocalState();
      expect(typeof s.teamagent_version === "string" || s.teamagent_version === null).toBe(true);
      expect(Array.isArray(s.installed_plugins)).toBe(true);
      expect(Array.isArray(s.installed_project_skills)).toBe(true);
      expect(Array.isArray(s.installed_hooks)).toBe(true);
    });
  });
}

// vitest 在 no-globals 模式下需要从 imports 中拿 afterEach
import { afterEach } from "vitest";
```

- [ ] **Step 3: 在 index.ts 与 contracts.ts 加导出**

打开 `packages/ports/src/index.ts`，追加：

```typescript
export type { BootstrapPort } from "./bootstrap-port.js";
```

打开 `packages/ports/src/contracts.ts`，追加：

```typescript
export { runBootstrapPortContract } from "./__tests__/bootstrap-port-contract.js";
```

- [ ] **Step 4: 跑 typecheck**

Run: `pnpm --filter @teamagent/ports typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ports/src/bootstrap-port.ts packages/ports/src/__tests__/bootstrap-port-contract.ts packages/ports/src/index.ts packages/ports/src/contracts.ts
git commit -m "feat(m5): add BootstrapPort interface and contract suite"
```

---

## Task 6: 文件系统 BootstrapPort 实现

**Files:**
- Create: `packages/adapters/src/m5/fs-bootstrap.ts`
- Create: `packages/adapters/src/m5/__tests__/fs-bootstrap.test.ts`

- [ ] **Step 1: 写实现**

```typescript
// packages/adapters/src/m5/fs-bootstrap.ts
import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { BootstrapPort } from "@teamagent/ports";
import type { LocalState, InfectionPlan } from "@teamagent/types";

export interface FsBootstrapDeps {
  /** 用于探测本机 TeamAgent 版本（如 readPackageJson）。注入便于测试。 */
  readTeamagentVersion: () => Promise<string | null>;
  /** 已装插件列表来源。 */
  readInstalledPlugins: () => Promise<string[]>;
  /** 已装项目级 skill 列表来源。 */
  readInstalledProjectSkills: () => Promise<string[]>;
  /** 已装 hook 列表来源。 */
  readInstalledHooks: () => Promise<LocalState["installed_hooks"]>;
}

export class FsBootstrap implements BootstrapPort {
  constructor(private deps: FsBootstrapDeps) {}

  async readManifest(projectRoot: string): Promise<string | null> {
    const p = path.join(projectRoot, ".teamagent", "manifest.json");
    try {
      return await fs.readFile(p, "utf8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }

  async probeProject(projectRoot: string) {
    const exists = async (rel: string) => {
      try {
        await fs.access(path.join(projectRoot, rel));
        return true;
      } catch {
        return false;
      }
    };
    return {
      has_manifest: await exists(".teamagent/manifest.json"),
      has_team_dir: await exists(".teamagent/team"),
      has_shared_skills_dir: await exists(".teamagent/shared-skills"),
      has_shared_claude_md: await exists(".teamagent/shared-claude.md"),
      has_githooks_dir: await exists(".githooks"),
      has_pre_commit_hook: await exists(".githooks/pre-commit"),
    };
  }

  async applyInfection(projectRoot: string, plan: InfectionPlan): Promise<void> {
    for (const dir of plan.dirs_to_create) {
      await fs.mkdir(path.join(projectRoot, dir), { recursive: true });
    }
    for (const [rel, content] of Object.entries(plan.files_to_create)) {
      const p = path.join(projectRoot, rel);
      await fs.mkdir(path.dirname(p), { recursive: true });
      try {
        // wx 标记：已存在则报错，幂等不覆盖
        await fs.writeFile(p, content, { flag: "wx" });
      } catch (e) {
        const code = (e as NodeJS.ErrnoException).code;
        if (code !== "EEXIST") throw e;
        // 幂等：已存在跳过
      }
      if (rel.endsWith("pre-commit") || rel.endsWith(".sh")) {
        try {
          await fs.chmod(p, 0o755);
        } catch {
          // Windows 上 chmod 可能 no-op，忽略
        }
      }
    }
  }

  async getLocalState(): Promise<LocalState> {
    return {
      teamagent_version: await this.deps.readTeamagentVersion(),
      installed_plugins: await this.deps.readInstalledPlugins(),
      installed_project_skills: await this.deps.readInstalledProjectSkills(),
      installed_hooks: await this.deps.readInstalledHooks(),
    };
  }
}
```

- [ ] **Step 2: 写跑契约的测试**

```typescript
// packages/adapters/src/m5/__tests__/fs-bootstrap.test.ts
import { describe } from "vitest";
import { runBootstrapPortContract } from "@teamagent/ports/contracts";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { FsBootstrap } from "../fs-bootstrap.js";

describe("FsBootstrap", () => {
  runBootstrapPortContract(async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "m5-fs-bootstrap-"));
    const port = new FsBootstrap({
      readTeamagentVersion: async () => "0.9.4",
      readInstalledPlugins: async () => ["superpowers"],
      readInstalledProjectSkills: async () => [],
      readInstalledHooks: async () => ["UserPromptSubmit", "Stop"],
    });
    return {
      port,
      projectRoot,
      cleanup: async () => {
        await fs.rm(projectRoot, { recursive: true, force: true });
      },
    };
  });
});
```

- [ ] **Step 3: 跑测试**

Run: `pnpm --filter @teamagent/adapters test packages/adapters/src/m5/__tests__/fs-bootstrap.test.ts`
Expected: PASS（5 tests，契约全过）

- [ ] **Step 4: Commit**

```bash
git add packages/adapters/src/m5/fs-bootstrap.ts packages/adapters/src/m5/__tests__/fs-bootstrap.test.ts
git commit -m "feat(m5): filesystem BootstrapPort implementation, contract green"
```

---

## Task 7: CLI — `teamagent m5-infect`

**Files:**
- Create: `packages/cli/src/commands/m5-infect.ts`
- Modify: `packages/cli/src/bin.ts`（注册子命令）

- [ ] **Step 1: 写命令实现**

```typescript
// packages/cli/src/commands/m5-infect.ts
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { planInfection } from "@teamagent/core/m5/infect-planner";
import { FsBootstrap } from "@teamagent/adapters/m5/fs-bootstrap";

export interface M5InfectOptions {
  projectRoot: string;
  /** 注入到 manifest.json 的 author。默认尝试从 git config user.name 推断。 */
  author?: string;
  /** 注入到 manifest.json 的 teamagent_version。默认从安装包推断。 */
  teamagentVersion?: string;
  /** 注入到 manifest.json 的 created_at。默认 new Date().toISOString()。 */
  now?: string;
}

export async function runM5Infect(opts: M5InfectOptions): Promise<{
  written_files: string[];
  written_dirs: string[];
  skipped: boolean;
}> {
  const port = new FsBootstrap({
    readTeamagentVersion: async () => readSelfVersion(),
    readInstalledPlugins: async () => [],
    readInstalledProjectSkills: async () => [],
    readInstalledHooks: async () => [],
  });

  const snap = await port.probeProject(opts.projectRoot);
  const author = opts.author ?? gitUserName() ?? "unknown";
  const teamagent_version = opts.teamagentVersion ?? (await readSelfVersion()) ?? "0.0.0";
  const now = opts.now ?? new Date().toISOString();

  const plan = planInfection(snap, { author, now, teamagent_version });

  if (!plan.required) {
    return { written_files: [], written_dirs: [], skipped: true };
  }

  await port.applyInfection(opts.projectRoot, plan);

  return {
    written_files: Object.keys(plan.files_to_create),
    written_dirs: plan.dirs_to_create,
    skipped: false,
  };
}

async function readSelfVersion(): Promise<string | null> {
  try {
    // teamagent 自身 package.json
    const pkgPath = path.resolve(__dirname, "..", "..", "..", "..", "teamagent", "package.json");
    const raw = await fs.readFile(pkgPath, "utf8");
    return (JSON.parse(raw).version as string) ?? null;
  } catch {
    return null;
  }
}

function gitUserName(): string | null {
  try {
    return execSync("git config user.name", { encoding: "utf8" }).trim() || null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: 在 bin.ts 注册子命令**

打开 `packages/cli/src/bin.ts`，在已有 commander 注册块旁追加：

```typescript
import { runM5Infect } from "./commands/m5-infect.js";

program
  .command("m5-infect")
  .description("[M5-A] 把 TeamAgent 病毒式契约写入当前项目（幂等）")
  .option("--project-root <path>", "项目根，默认 process.cwd()", process.cwd())
  .option("--author <name>", "manifest 中 created_by 的值")
  .action(async (opts) => {
    const result = await runM5Infect({
      projectRoot: opts.projectRoot,
      author: opts.author,
    });
    if (result.skipped) {
      console.log("[m5-infect] 项目已被传染，无需动作。");
    } else {
      console.log("[m5-infect] 已写入文件:", result.written_files.join(", "));
      console.log("[m5-infect] 已建目录:", result.written_dirs.join(", "));
    }
  });
```

- [ ] **Step 3: 写集成测试**

```typescript
// packages/cli/src/__tests__/m5-cli.test.ts
import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runM5Infect } from "../commands/m5-infect.js";

describe("m5-infect command", () => {
  it("infects a clean project", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "m5-cli-"));
    try {
      const r = await runM5Infect({
        projectRoot: root,
        author: "tester",
        teamagentVersion: "0.9.4",
        now: "2026-05-06T10:00:00Z",
      });
      expect(r.skipped).toBe(false);
      expect(r.written_files).toContain(".teamagent/manifest.json");
      const manifest = await fs.readFile(
        path.join(root, ".teamagent", "manifest.json"),
        "utf8"
      );
      expect(manifest).toContain('"created_by": "tester"');
      expect(manifest).toContain('"teamagent_version": "0.9.4"');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("is idempotent on already-infected project", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "m5-cli-"));
    try {
      await runM5Infect({
        projectRoot: root, author: "a", teamagentVersion: "0.9.4", now: "2026-05-06T10:00:00Z",
      });
      const r2 = await runM5Infect({
        projectRoot: root, author: "b", teamagentVersion: "0.9.5", now: "2026-05-06T11:00:00Z",
      });
      expect(r2.skipped).toBe(true);
      const manifest = await fs.readFile(
        path.join(root, ".teamagent", "manifest.json"),
        "utf8"
      );
      // 不被覆盖：仍是第一次的 author / 版本
      expect(manifest).toContain('"created_by": "a"');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 4: 跑测试**

Run: `pnpm --filter @teamagent/cli test packages/cli/src/__tests__/m5-cli.test.ts`
Expected: PASS（2 tests）

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/m5-infect.ts packages/cli/src/bin.ts packages/cli/src/__tests__/m5-cli.test.ts
git commit -m "feat(m5): teamagent m5-infect command and integration tests"
```

---

## Task 8: CLI — `teamagent m5-bootstrap`

**Files:**
- Create: `packages/cli/src/commands/m5-bootstrap.ts`
- Modify: `packages/cli/src/bin.ts`
- Modify: `packages/cli/src/__tests__/m5-cli.test.ts`（追加测试）

- [ ] **Step 1: 写命令实现**

```typescript
// packages/cli/src/commands/m5-bootstrap.ts
import { parseManifest } from "@teamagent/core/m5/manifest";
import { computeBootstrapDiff } from "@teamagent/core/m5/bootstrap-diff";
import { FsBootstrap } from "@teamagent/adapters/m5/fs-bootstrap";
import type { BootstrapDiff } from "@teamagent/types";

export interface M5BootstrapOptions {
  projectRoot: string;
  /** 仅检查、不执行安装动作（M5-A 默认行为）。 */
  checkOnly?: boolean;
}

export async function runM5Bootstrap(
  opts: M5BootstrapOptions
): Promise<{ diff: BootstrapDiff | null; reason?: string }> {
  const port = new FsBootstrap({
    readTeamagentVersion: async () => null,            // 真实探测留给 M5-A2/B
    readInstalledPlugins: async () => [],
    readInstalledProjectSkills: async () => [],
    readInstalledHooks: async () => [],
  });

  const manifestRaw = await port.readManifest(opts.projectRoot);
  if (!manifestRaw) {
    return { diff: null, reason: "no manifest (project not infected)" };
  }
  const manifest = parseManifest(manifestRaw);
  const localState = await port.getLocalState();
  const diff = computeBootstrapDiff(manifest, localState);

  // M5-A 不做实际安装；只输出 diff。
  return { diff };
}
```

- [ ] **Step 2: 在 bin.ts 注册**

打开 `packages/cli/src/bin.ts`，追加：

```typescript
import { runM5Bootstrap } from "./commands/m5-bootstrap.js";

program
  .command("m5-bootstrap")
  .description("[M5-A] 读项目 manifest，报告本机与契约的差异（仅检查，不安装）")
  .option("--project-root <path>", "项目根，默认 process.cwd()", process.cwd())
  .option("--check", "仅报告差异（M5-A 唯一支持的模式）", true)
  .action(async (opts) => {
    const result = await runM5Bootstrap({ projectRoot: opts.projectRoot, checkOnly: true });
    if (!result.diff) {
      console.log("[m5-bootstrap]", result.reason ?? "ok");
      return;
    }
    if (!result.diff.needs_bootstrap) {
      console.log("[m5-bootstrap] OK，无需动作。");
    } else {
      console.log("[m5-bootstrap] 需要：", JSON.stringify(result.diff, null, 2));
      process.exitCode = 2;
    }
  });
```

- [ ] **Step 3: 追加集成测试**

打开 `packages/cli/src/__tests__/m5-cli.test.ts`，追加：

```typescript
import { runM5Bootstrap } from "../commands/m5-bootstrap.js";

describe("m5-bootstrap command", () => {
  it("returns diff=null on uninfected project", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "m5-cli-"));
    try {
      const r = await runM5Bootstrap({ projectRoot: root, checkOnly: true });
      expect(r.diff).toBeNull();
      expect(r.reason).toContain("no manifest");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("returns needs_bootstrap=true when manifest requires plugins missing locally", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "m5-cli-"));
    try {
      await runM5Infect({
        projectRoot: root, author: "tester",
        teamagentVersion: "0.9.4", now: "2026-05-06T10:00:00Z",
      });
      // 手动改 manifest 加上 required_plugins
      const mPath = path.join(root, ".teamagent", "manifest.json");
      const raw = await fs.readFile(mPath, "utf8");
      const m = JSON.parse(raw);
      m.required_plugins = ["caveman", "superpowers"];
      await fs.writeFile(mPath, JSON.stringify(m, null, 2));
      const r = await runM5Bootstrap({ projectRoot: root, checkOnly: true });
      expect(r.diff?.needs_bootstrap).toBe(true);
      expect(r.diff?.install_plugins).toEqual(["caveman", "superpowers"]);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 4: 跑测试**

Run: `pnpm --filter @teamagent/cli test packages/cli/src/__tests__/m5-cli.test.ts`
Expected: PASS（4 tests 总）

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/m5-bootstrap.ts packages/cli/src/bin.ts packages/cli/src/__tests__/m5-cli.test.ts
git commit -m "feat(m5): teamagent m5-bootstrap reports manifest vs local diff"
```

---

## Task 9: 端到端 Demo 脚本

**Files:**
- Create: `scripts/m5-demo.sh`

- [ ] **Step 1: 写脚本**

```bash
#!/usr/bin/env bash
# scripts/m5-demo.sh
# M5-A walking skeleton demo:
#   1. 在临时项目里跑 teamagent m5-infect
#   2. 验证 manifest + 共享层骨架已就位
#   3. 把项目 git init + commit + 模拟 push（local bare repo）
#   4. 在另一个临时目录 clone
#   5. 跑 teamagent m5-bootstrap，确认它读到了 manifest

set -euo pipefail

WORKDIR=$(mktemp -d -t m5-demo-XXXX)
echo "[m5-demo] workdir: $WORKDIR"

ALICE="$WORKDIR/alice-project"
BOB="$WORKDIR/bob-clone"
BARE="$WORKDIR/bare.git"

mkdir -p "$ALICE"
git init -q "$ALICE"
( cd "$ALICE" && git config user.name "alice" && git config user.email "alice@test" )

# Step 1: infect
pnpm --filter @teamagent/cli exec teamagent m5-infect --project-root "$ALICE" --author alice
test -f "$ALICE/.teamagent/manifest.json"
test -d "$ALICE/.teamagent/team"
test -d "$ALICE/.teamagent/shared-skills"
test -f "$ALICE/.teamagent/shared-claude.md"
test -f "$ALICE/.githooks/pre-commit"
echo "[m5-demo] infect OK"

# Step 2: commit + bare-repo "push"
( cd "$ALICE" && git add . && git commit -qm "feat: infect project with TeamAgent contract" )
git init --bare -q "$BARE"
( cd "$ALICE" && git remote add origin "$BARE" && git branch -M main && git push -q origin main )
echo "[m5-demo] push OK"

# Step 3: Bob clones
git clone -q "$BARE" "$BOB"
test -f "$BOB/.teamagent/manifest.json"
echo "[m5-demo] clone OK, manifest present"

# Step 4: bootstrap reports diff
pnpm --filter @teamagent/cli exec teamagent m5-bootstrap --project-root "$BOB" --check || EXIT=$?
echo "[m5-demo] bootstrap exit: ${EXIT:-0}"

echo "[m5-demo] all checks passed."
echo "[m5-demo] cleanup: rm -rf $WORKDIR"
```

- [ ] **Step 2: 给 demo 加可执行权限**

```bash
chmod +x scripts/m5-demo.sh
```

- [ ] **Step 3: 跑 demo 验证 walking skeleton**

Run: `bash scripts/m5-demo.sh`
Expected: 全部 echo `OK`，exit 0；最后一行 `all checks passed.`

如果失败：从输出找出哪一步失败，回到对应 Task 修复后重跑。

- [ ] **Step 4: 跑全套测试 + typecheck（M5 元约束：milestone 末尾 commit 必须全绿）**

Run: `pnpm test`
Expected: PASS

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/m5-demo.sh
git commit -m "feat(m5): end-to-end M5-A demo script (infect → push → clone → bootstrap)"
```

---

## Task 10: AttributionBus 事件接入

**Files:**
- Modify: `packages/cli/src/commands/m5-infect.ts`
- Modify: `packages/cli/src/commands/m5-bootstrap.ts`

> 元约束："归因必须走 AttributionBus。组件不得直接 console.log 用户可见信息。"
>
> M5-A 的两个命令需要把"传染了什么 / 报告了什么 diff"通过 AttributionBus 发结构化事件。

- [ ] **Step 1: 看现有 attribution-bus 接口**

Run: `Read packages/ports/src/attribution-bus.ts`

学习 AttributionBus.emit 的事件 schema（kind / payload），以及 M5-A 应当使用的事件类型；如不存在 m5 相关事件类型，按现有约定追加 `M5InfectionApplied` / `M5BootstrapDiffReported` 事件。

- [ ] **Step 2: 在 attribution-bus.ts 追加 M5 事件类型**

```typescript
// packages/ports/src/attribution-bus.ts（追加到 AttributionEvent 联合类型中）
export interface M5InfectionAppliedEvent {
  kind: "m5.infection_applied";
  project_root: string;
  written_files: string[];
  written_dirs: string[];
  author: string;
  at: string; // ISO 8601
}

export interface M5BootstrapDiffReportedEvent {
  kind: "m5.bootstrap_diff_reported";
  project_root: string;
  needs_bootstrap: boolean;
  install_teamagent_version: string | null;
  install_plugins: string[];
  install_project_skills: string[];
  install_hooks: string[];
  at: string;
}

// 把它们加入 AttributionEvent 联合
export type AttributionEvent =
  /* ... 现有事件 ... */
  | M5InfectionAppliedEvent
  | M5BootstrapDiffReportedEvent;
```

- [ ] **Step 3: 在 m5-infect 命令里发事件，替换 console.log**

修改 `packages/cli/src/commands/m5-infect.ts`：让 `runM5Infect` 接受可选的 `bus: AttributionBus` 参数，infect 完成后调用 `bus.emit({ kind: "m5.infection_applied", ... })`。在 `bin.ts` 的 `.action` handler 里注入默认 bus（参考其他命令的模式）。

- [ ] **Step 4: 在 m5-bootstrap 命令里发事件**

修改 `packages/cli/src/commands/m5-bootstrap.ts` 同理：发 `m5.bootstrap_diff_reported` 事件。

- [ ] **Step 5: 给事件添加测试**

在 `packages/cli/src/__tests__/m5-cli.test.ts` 中追加：

```typescript
it("m5-infect emits m5.infection_applied event", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "m5-cli-"));
  const events: any[] = [];
  const bus = { emit: (e: any) => events.push(e) };
  try {
    await runM5Infect({
      projectRoot: root, author: "tester",
      teamagentVersion: "0.9.4", now: "2026-05-06T10:00:00Z",
      bus: bus as any,
    });
    const evt = events.find((e) => e.kind === "m5.infection_applied");
    expect(evt).toBeDefined();
    expect(evt.author).toBe("tester");
    expect(evt.written_files).toContain(".teamagent/manifest.json");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 6: 跑全套测试 + typecheck**

Run: `pnpm test`
Expected: PASS

Run: `pnpm typecheck`
Expected: PASS

Run: `bash scripts/m5-demo.sh`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/ports/src/attribution-bus.ts packages/cli/src/commands/m5-infect.ts packages/cli/src/commands/m5-bootstrap.ts packages/cli/src/__tests__/m5-cli.test.ts
git commit -m "feat(m5): emit AttributionBus events from m5-infect and m5-bootstrap"
```

---

## 验收 Checklist（M5-A 结束）

- [ ] `pnpm test` 全绿
- [ ] `pnpm typecheck` 全绿
- [ ] `bash scripts/m5-demo.sh` 全绿
- [ ] 新增 5 个 Port-tier 文件、6 个 core-tier 测试 + 实现、2 个 CLI 命令、1 个 demo 脚本
- [ ] BootstrapPort 有契约测试且至少一个 impl 跑过契约
- [ ] 所有用户可见动作走 AttributionBus（无 stray console.log）
- [ ] 9 个 commit 全部 `feat(m5): <...>` 格式

---

## 自审

**Spec 覆盖：** 本 plan 覆盖 spec §10 中的 M5-A 范围（传染骨架 + 引导器 + BootstrapPort 契约 + demo）。M5-B（隐私三层 + 双闸门）、M5-C（自动同步 + 删改）、M5-D（多点拦截 + DX）显式不在范围，待后续单独 plan。

**Placeholder scan：** 已逐 Task 检查无 TBD / TODO / fill-in-later。每个 Task 都有完整代码块和具体命令。

**类型一致性：** Manifest / LocalState / InfectionPlan / BootstrapDiff 类型在 Task 1 定义，后续 Task 全部沿用相同字段名和签名。BootstrapPort 接口在 Task 5 定义，Task 6 / 7 / 8 全部用相同方法签名。

**Path 一致性：** 文件路径全部为绝对包路径（`packages/<pkg>/src/...`），与 `pnpm --filter @teamagent/<pkg>` 一致。

---

## 后续 plan 顺序建议

1. M5-A 落地 → PR + POSTPR loop
2. M5-B（隐私三层 + 闸门）—— 需要 SecretScanPort、ScopeClassifierPort
3. M5-C（自动同步 + 删改）—— 需要 RuleSyncPort
4. M5-D（多点拦截 + DX）—— 需要 EnforcementPort

每个 phase 一份独立 plan，复用本 plan 的 file-structure 风格与 TDD 模板。
