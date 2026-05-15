/**
 * M5 SessionStart 集成：用户在任意 git 项目里活动时
 *   1. 自动 infect（如果项目尚未传染）
 *   2. 自动 bootstrap --apply（如果本机配置不齐）
 *   3. 自动 sync --apply（拉团队规则到本地 KB）
 *
 * 全部非阻塞、不抛错——SessionStart hook 设计契约。
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { findTeamagentRoot } from "./find-teamagent-root.js";
import { runM5Infect } from "./commands/m5-infect.js";
import { runM5Bootstrap } from "./commands/m5-bootstrap.js";
import { runM5Sync } from "./commands/m5-sync.js";
import { runM5Publish } from "./commands/m5-publish.js";

export interface M5SessionResult {
  infected: boolean;
  bootstrapped: boolean;
  synced: boolean;
  published_changes: number;
  pushed: boolean;
  /** W15-014: number of team rule files skipped during sync (corrupt JSON / future ts / schema) */
  skipped_count: number;
  /** Phase 11: 是否真的跑了 git pull（true=拉到了，false=跳过/失败/opt-out） */
  pulled: boolean;
  /**
   * Phase 11: pull 跳过的原因码（detached / no-upstream / mid-rebase / dirty /
   * timeout / opt-out / worktree / not-git）。null 表示成功 pull 或根本没尝试。
   */
  pull_skip_reason: PullSkipReason | null;
  errors: string[];
}

export type PullSkipReason =
  | "opt-out"
  | "worktree"
  | "detached"
  | "no-upstream"
  | "mid-rebase"
  | "mid-merge"
  | "dirty"
  | "timeout"
  | "fetch-failed"
  | "merge-failed";

/**
 * 检测当前用户机器是否已经"装了 TeamAgent"——按是否有用户级 knowledge.db 判断。
 * 这是"传染源"判定：只有自己装过 TA 的用户，进新项目才会自动 infect。
 */
export function userHasTeamAgent(homeDir: string): boolean {
  const dbPath = path.join(homeDir, ".teamagent", "global.db");
  return fs.existsSync(dbPath);
}

/** 当前项目是否是 git 仓库（infect 的前提）。 */
export function isGitProject(projectRoot: string): boolean {
  // worktree 时 .git 是文件，主仓库是目录——都算
  return fs.existsSync(path.join(projectRoot, ".git"));
}

/**
 * Phase 11: detect git worktree checkout (not the main checkout).
 * `.git` is a regular file pointing at `gitdir: .../worktrees/<name>` instead
 * of being a directory. We refuse to auto-pull in worktrees because:
 *   1. FIXEDFLOW driver creates `.codex/worktrees/issue-<N>/` as throwaway
 *      branches; auto-pulling them upstream defeats the per-issue isolation.
 *   2. `.claude/worktrees/<name>/` is the EnterWorktree path; it's mid-task
 *      working state, not a long-lived branch.
 *   3. Path-segment check catches the convention even when an outer process
 *      uses `git -C` from a sibling dir and `.git` lookup is inconclusive.
 */
export function isWorktreeCheckout(projectRoot: string): boolean {
  try {
    const gitPath = path.join(projectRoot, ".git");
    const stat = fs.lstatSync(gitPath);
    if (stat.isFile()) return true;
  } catch {
    // .git 不存在 / 无权限 → 让 isGitProject 那边负责拒绝
  }
  const norm = projectRoot.replace(/\\/g, "/");
  return /\/\.codex\/worktrees\//.test(norm) || /\/\.claude\/worktrees\//.test(norm);
}

/**
 * Phase 11: upstream gate for shouldInfect.
 * Returns true ONLY when `origin/HEAD:.teamagent/manifest.json` exists,
 * meaning the upstream repo is itself already a TeamAgent project. This kills
 * the previous "every random clone gets infected" surprise: a teammate `git
 * clone`-ing some-third-party-lib will NOT have TeamAgent manifests injected
 * just because they personally have `~/.teamagent/global.db` from another
 * project.
 *
 * Best-effort: any failure (no remote, no origin, no HEAD ref) returns false
 * — that's the safe default for "should we auto-adopt this repo?".
 */
export function upstreamIsTeamAgent(projectRoot: string): boolean {
  try {
    execFileSync(
      "git",
      ["cat-file", "-e", "origin/HEAD:.teamagent/manifest.json"],
      {
        cwd: projectRoot,
        stdio: ["ignore", "ignore", "ignore"],
        timeout: 2000,
      },
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Phase 11 全自动 pull —— SessionStart 阶段在 sync 前先把 origin 的最新规则
 * 拉到本地工作区，让 m5-sync 看到的就是团队最新状态。
 *
 * 5 个静默跳过条件（都是"动 pull 会破坏用户当前工作"的典型场景）：
 *   1. detached HEAD             → 没分支可 pull
 *   2. 当前分支无 upstream         → 不知道往哪 pull
 *   3. 进行中的 rebase / merge    → MERGE_HEAD / rebase-* 存在
 *   4. 工作区脏（uncommitted）   → pull 会触发 merge 冲突
 *   5. fetch 5s 内未完成          → 网络慢 / 离线，不阻塞 SessionStart
 *
 * env 开关：
 *   - TEAMAGENT_AUTO_PULL=0  → 整步骤跳过（opt-out）
 *   - TEAMAGENT_DEBUG=1      → 跳过原因 push 进 errors[]，否则全静默
 *
 * 永远不抛错；返回 reason 给 caller 决定是否打 banner。
 */
export function runGitPullSafe(
  projectRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): { pulled: boolean; reason: PullSkipReason | null } {
  if (env["TEAMAGENT_AUTO_PULL"] === "0") {
    return { pulled: false, reason: "opt-out" };
  }
  if (!isGitProject(projectRoot)) {
    return { pulled: false, reason: null };
  }
  if (isWorktreeCheckout(projectRoot)) {
    return { pulled: false, reason: "worktree" };
  }

  // 1) detached HEAD?  symbolic-ref 失败即 detached
  const sym = spawnSync("git", ["symbolic-ref", "--quiet", "HEAD"], {
    cwd: projectRoot,
    stdio: ["ignore", "ignore", "ignore"],
    timeout: 2000,
  });
  if (sym.status !== 0) return { pulled: false, reason: "detached" };

  // 2) upstream 存在?  rev-parse @{u} 失败即无 upstream
  const ups = spawnSync("git", ["rev-parse", "--quiet", "--verify", "@{u}"], {
    cwd: projectRoot,
    stdio: ["ignore", "ignore", "ignore"],
    timeout: 2000,
  });
  if (ups.status !== 0) return { pulled: false, reason: "no-upstream" };

  // 3) mid-rebase / mid-merge?
  const gitDir = path.join(projectRoot, ".git");
  if (fs.existsSync(path.join(gitDir, "MERGE_HEAD"))) {
    return { pulled: false, reason: "mid-merge" };
  }
  if (
    fs.existsSync(path.join(gitDir, "rebase-merge")) ||
    fs.existsSync(path.join(gitDir, "rebase-apply"))
  ) {
    return { pulled: false, reason: "mid-rebase" };
  }

  // 4) dirty?  diff --quiet HEAD 非 0 即脏
  const dirty = spawnSync("git", ["diff", "--quiet", "HEAD"], {
    cwd: projectRoot,
    stdio: ["ignore", "ignore", "ignore"],
    timeout: 3000,
  });
  if (dirty.status !== 0) return { pulled: false, reason: "dirty" };

  // 5) fetch 5s 超时 —— 不打扰用户的弱网环境
  const fetched = spawnSync("git", ["fetch", "--quiet", "origin"], {
    cwd: projectRoot,
    stdio: ["ignore", "ignore", "ignore"],
    timeout: 5000,
  });
  if (fetched.error && (fetched.error as NodeJS.ErrnoException).code === "ETIMEDOUT") {
    return { pulled: false, reason: "timeout" };
  }
  if (fetched.status !== 0) return { pulled: false, reason: "fetch-failed" };

  // 6) ff-only merge —— 永远不允许 SessionStart 自动制造 merge commit
  const merged = spawnSync("git", ["merge", "--ff-only", "--quiet", "@{u}"], {
    cwd: projectRoot,
    stdio: ["ignore", "ignore", "ignore"],
    timeout: 5000,
  });
  if (merged.status !== 0) return { pulled: false, reason: "merge-failed" };

  return { pulled: true, reason: null };
}

/** 当前项目是否已被 infect。
 *
 * Pure predicate over the directory passed in — does NOT walk up. The walk-up
 * for issue #161 happens at `runM5Session` entry so that the entire pipeline
 * (`isInfected` + `runM5Infect`/`runM5Bootstrap`/`runM5Sync`/`runM5Publish`)
 * sees the same resolved project root. Walking up inside this predicate alone
 * would make `isInfected(sub)` return true while the downstream commands still
 * operate on `sub`, leaving them to no-op against a non-existent
 * `sub/.teamagent/`.
 */
export function isInfected(projectRoot: string): boolean {
  return fs.existsSync(path.join(projectRoot, ".teamagent", "manifest.json"));
}

/**
 * 在 SessionStart 阶段自动跑 M5 全套。降级模式：任一失败不影响其它。
 */
export async function runM5Session(input: {
  projectRoot: string;
  homeDir: string;
  /** 是否真的"传染"——默认按 userHasTeamAgent 判断 */
  shouldInfect?: boolean;
  /** 是否在自动 commit 后也自动 push（默认 false） */
  autoPush?: boolean;
}): Promise<M5SessionResult> {
  const r: M5SessionResult = {
    infected: false,
    bootstrapped: false,
    synced: false,
    published_changes: 0,
    pushed: false,
    skipped_count: 0,
    pulled: false,
    pull_skip_reason: null,
    errors: [],
  };

  // Issue #161: SessionStart can fire from a sub-directory of an already-
  // infected project. Walk up ONCE here and use the resolved project root for
  // every downstream command — keeps `isInfected` honest as a pure predicate
  // and ensures `runM5Infect`/`Bootstrap`/`Sync`/`Publish` all operate on the
  // same root the predicate answered for. `findTeamagentRoot` falls back to
  // the input on miss, preserving the original cwd-only behaviour for fresh
  // projects with no ancestor `.teamagent/`.
  const projectRoot = findTeamagentRoot(input.projectRoot);

  if (!isGitProject(projectRoot)) {
    return r; // 非 git 项目不动
  }

  // 1) 传染：当前用户是 "传染源" 且 upstream 已是 TeamAgent 项目，且项目未被
  // 传染时自动 infect。Phase 11 收紧：除了用户自己装过 TA，还要求 origin/HEAD
  // 上的 .teamagent/manifest.json 存在 —— 否则 `git clone some-third-party-lib`
  // 会被无理由认领。input.shouldInfect 显式传入时仍优先（测试 / 强制场景）。
  const userHasTA = userHasTeamAgent(input.homeDir);
  const shouldInfect =
    input.shouldInfect ?? (userHasTA && upstreamIsTeamAgent(projectRoot));
  if (shouldInfect && !isInfected(projectRoot)) {
    try {
      const inf = await runM5Infect({ projectRoot });
      r.infected = !inf.skipped;
    } catch (e) {
      r.errors.push(`infect: ${(e as Error).message}`);
    }
  }

  // 2) bootstrap apply：项目已被 infect 时检查并补齐本机
  if (isInfected(projectRoot)) {
    try {
      const bs = await runM5Bootstrap({
        projectRoot,
        checkOnly: false,
      });
      r.bootstrapped = !!(bs.applied && bs.diff?.needs_bootstrap);
    } catch (e) {
      r.errors.push(`bootstrap: ${(e as Error).message}`);
    }
  }

  // 2.5) Phase 11 自动 git pull —— 把 origin 的最新团队规则拉到本地工作区，
  // 让下面的 m5-sync 看到的就是团队最新状态。5 个静默跳过场景 + worktree 排除
  // 在 runGitPullSafe 里实现，不抛错，永不阻塞 SessionStart。
  if (isInfected(projectRoot)) {
    try {
      const pull = runGitPullSafe(projectRoot);
      r.pulled = pull.pulled;
      r.pull_skip_reason = pull.reason;
      if (pull.reason !== null && process.env["TEAMAGENT_DEBUG"] === "1") {
        r.errors.push(`pull-skip: ${pull.reason}`);
      }
    } catch (e) {
      // runGitPullSafe 自身已经吞所有错；这里 catch 是 paranoia
      r.errors.push(`pull: ${(e as Error).message}`);
    }
  }

  // 3) sync apply：把团队规则拉进本地 KB
  if (isInfected(projectRoot)) {
    try {
      const sync = await runM5Sync({
        projectRoot,
        apply: true,
      });
      r.synced =
        !!sync.applied &&
        (sync.applied.upserted.length > 0 || sync.applied.deleted.length > 0);
      r.skipped_count = sync.skipped_files?.length ?? 0;
    } catch (e) {
      r.errors.push(`sync: ${(e as Error).message}`);
    }
  }

  // 4) publish：auto-commit pending L2 changes 并 push（spec §7 激进模式默认 push）
  // push 失败时降级为 push_error，不抛——commit 已留在本地，下次 SessionStart 再推
  if (isInfected(projectRoot)) {
    try {
      const pub = await runM5Publish({
        projectRoot,
        push: input.autoPush ?? true,
      });
      r.published_changes = pub.changes_count;
      r.pushed = pub.pushed;
    } catch (e) {
      r.errors.push(`publish: ${(e as Error).message}`);
    }
  }

  return r;
}

/** 渲染成 stderr 友好的 banner（SessionStart 的输出渠道）。 */
export function renderM5SessionBanner(r: M5SessionResult): string | null {
  const parts: string[] = [];
  if (r.infected) parts.push("🦠 项目已自动 infect");
  if (r.bootstrapped) parts.push("📦 本机已自动补齐缺失项");
  if (r.pulled) parts.push("⬇ 已自动 pull origin（fast-forward）");
  if (r.synced) parts.push("🔄 已同步团队规则");
  if (r.skipped_count > 0) {
    parts.push(
      `⚠ 同步时跳过 ${r.skipped_count} 个团队规则文件（运行 \`teamagent m5-sync\` 查看详情）`,
    );
  }
  if (r.published_changes > 0) {
    const pushNote = r.pushed ? " + push" : "（未 push）";
    parts.push(`📤 已 commit ${r.published_changes} 处 team 变化${pushNote}`);
  }
  if (r.errors.length) {
    parts.push(`⚠ M5 部分失败: ${r.errors.join("; ")}`);
  }
  if (parts.length === 0) return null;
  return `[teamagent M5] ${parts.join("，")}`;
}
