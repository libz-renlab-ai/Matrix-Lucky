import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execSync } from "node:child_process";
import {
  isInfected,
  isWorktreeCheckout,
  runGitPullSafe,
  runM5Session,
} from "../m5-session-hook.js";

describe("isInfected (no walk-up; pure predicate)", () => {
  it("returns true when manifest.json exists in the given directory", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ta-m5hook-pure-"));
    try {
      fs.mkdirSync(path.join(root, ".teamagent"), { recursive: true });
      fs.writeFileSync(path.join(root, ".teamagent", "manifest.json"), "{}");
      expect(isInfected(root)).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns false from a subfolder even when parent has manifest.json", () => {
    // Walk-up belongs at runM5Session, not in this predicate. If sub itself
    // has no manifest, the answer is "this dir is not infected".
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ta-m5hook-pure-sub-"));
    try {
      fs.mkdirSync(path.join(root, ".teamagent"), { recursive: true });
      fs.writeFileSync(path.join(root, ".teamagent", "manifest.json"), "{}");
      const sub = path.join(root, "sub");
      fs.mkdirSync(sub, { recursive: true });
      expect(isInfected(sub)).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("runM5Session walk-up entry (#161)", () => {
  it("resolves projectRoot to ancestor when called from a subfolder of an infected project", async () => {
    // Plant a fully-set-up project (knowledge.db + project marker + manifest)
    // and a non-infected home so userHasTeamAgent returns false (we don't
    // want the run to actually mutate disk via runM5Infect — passing
    // shouldInfect:false short-circuits the side effects we don't have
    // fixtures for here, but we still exercise the resolution path).
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ta-m5hook-walkup-"));
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "ta-m5hook-home-"));
    try {
      // Project marker + knowledge.db so hardened walk-up accepts root
      fs.mkdirSync(path.join(root, ".teamagent"), { recursive: true });
      fs.writeFileSync(path.join(root, ".teamagent", "knowledge.db"), "");
      fs.writeFileSync(path.join(root, "package.json"), "{}");
      // Required for isGitProject(projectRoot) to pass after walk-up
      fs.mkdirSync(path.join(root, ".git"), { recursive: true });

      // Subfolder cwd (no .teamagent on its own)
      const sub = path.join(root, "packages", "deep");
      fs.mkdirSync(sub, { recursive: true });

      // Run with shouldInfect:false so we only verify that the entry walk-up
      // takes effect — no need to mock the downstream m5-* commands.
      const result = await runM5Session({
        projectRoot: sub,
        homeDir,
        shouldInfect: false,
        autoPush: false,
      });

      // No errors means walk-up resolved to root → isGitProject(root) true
      // → no early return → bootstrap/sync/publish guards saw isInfected
      // false (no manifest.json yet) → no-op silently.
      expect(result.errors).toEqual([]);
      // Walked-up root not infected (no manifest) → no published changes
      expect(result.published_changes).toBe(0);
      expect(result.pushed).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it("returns early when neither cwd nor any ancestor is a git project", async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "ta-m5hook-nogit-"));
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "ta-m5hook-nogit-home-"));
    try {
      const result = await runM5Session({
        projectRoot: cwd,
        homeDir,
        shouldInfect: false,
        autoPush: false,
      });
      expect(result).toEqual({
        infected: false,
        bootstrapped: false,
        synced: false,
        published_changes: 0,
        pushed: false,
        errors: [],
        // W15-014 adds skipped_count to the runM5Session result shape so
        // the SessionStart banner can surface skip reasons. Walk-up early
        // exits return 0.
        skipped_count: 0,
        // Phase 11 adds pulled + pull_skip_reason for the auto-pull step;
        // walk-up early exits never even attempt the pull.
        pulled: false,
        pull_skip_reason: null,
      });
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
      fs.rmSync(homeDir, { recursive: true, force: true });
    }
  });
});

/**
 * Phase 11 — runGitPullSafe must silently skip 5 known "pulling would break
 * the user's current work" scenarios + opt-out + worktree. None of these
 * should write to stdout, throw, or take longer than ~5s. We avoid network
 * by NEVER setting up an `origin` remote — that flips the second guard
 * (`no-upstream`) FAST. The earlier guards (detached / mid-rebase / dirty)
 * each fire before that one, so they're testable without a remote.
 */
describe("runGitPullSafe — 5 silent skip cases + opt-out + worktree", () => {
  /** Plain git repo with no remote — for the no-upstream / detached cases. */
  function makeRepo(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ta-pull-safe-"));
    execSync("git init --quiet --initial-branch=main", { cwd: root });
    execSync("git config user.email t@t.com", { cwd: root });
    execSync("git config user.name t", { cwd: root });
    fs.writeFileSync(path.join(root, "README.md"), "x");
    execSync("git add . && git commit --quiet -m init", { cwd: root });
    return root;
  }
  /**
   * Repo with a real bare-repo origin and `@{u}` set — needed for the
   * mid-merge / mid-rebase / dirty cases, since otherwise the upstream gate
   * short-circuits earlier with reason="no-upstream". Returns BOTH paths so
   * the caller cleans up the bare repo too.
   */
  function makeRepoWithOrigin(): { work: string; bare: string } {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ta-pull-up-"));
    const bare = path.join(dir, "origin.git");
    const work = path.join(dir, "work");
    fs.mkdirSync(bare, { recursive: true });
    fs.mkdirSync(work, { recursive: true });
    execSync(`git init --bare --quiet`, { cwd: bare });
    execSync("git init --quiet --initial-branch=main", { cwd: work });
    execSync("git config user.email t@t.com", { cwd: work });
    execSync("git config user.name t", { cwd: work });
    fs.writeFileSync(path.join(work, "README.md"), "x");
    execSync("git add . && git commit --quiet -m init", { cwd: work });
    execSync(`git remote add origin "${bare}"`, { cwd: work });
    execSync("git push --quiet -u origin main", { cwd: work });
    return { work, bare: dir };
  }

  it("opt-out via TEAMAGENT_AUTO_PULL=0 short-circuits before any git call", () => {
    const root = makeRepo();
    try {
      const r = runGitPullSafe(root, { TEAMAGENT_AUTO_PULL: "0" });
      expect(r).toEqual({ pulled: false, reason: "opt-out" });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("non-git project returns reason=null (not an error, just nothing to do)", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ta-pull-safe-nogit-"));
    try {
      const r = runGitPullSafe(root, {});
      expect(r).toEqual({ pulled: false, reason: null });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("worktree path under .codex/worktrees/ is refused", () => {
    // We don't need a real git worktree — the path-segment check fires first.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ta-pull-wt-"));
    try {
      const wt = path.join(root, ".codex", "worktrees", "issue-1");
      fs.mkdirSync(wt, { recursive: true });
      // Even with a fake .git so isGitProject is true, worktree check fires.
      fs.writeFileSync(path.join(wt, ".git"), "gitdir: ../../.git/worktrees/x");
      expect(isWorktreeCheckout(wt)).toBe(true);
      const r = runGitPullSafe(wt, {});
      expect(r).toEqual({ pulled: false, reason: "worktree" });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("detached HEAD is detected (skip case #1)", () => {
    const root = makeRepo();
    try {
      const sha = execSync("git rev-parse HEAD", { cwd: root, encoding: "utf8" }).trim();
      execSync(`git checkout --quiet --detach ${sha}`, { cwd: root });
      const r = runGitPullSafe(root, {});
      expect(r).toEqual({ pulled: false, reason: "detached" });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("no upstream tracking branch is detected (skip case #2)", () => {
    const root = makeRepo();
    try {
      // Fresh `git init` repo on `main` with no remote — `@{u}` doesn't resolve.
      const r = runGitPullSafe(root, {});
      expect(r).toEqual({ pulled: false, reason: "no-upstream" });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("mid-merge (MERGE_HEAD present) is detected (skip case #3a)", () => {
    const { work, bare } = makeRepoWithOrigin();
    try {
      const sha = execSync("git rev-parse HEAD", { cwd: work, encoding: "utf8" }).trim();
      fs.writeFileSync(path.join(work, ".git", "MERGE_HEAD"), sha);
      const r = runGitPullSafe(work, {});
      expect(r).toEqual({ pulled: false, reason: "mid-merge" });
    } finally {
      fs.rmSync(bare, { recursive: true, force: true });
    }
  });

  it("mid-rebase (rebase-merge dir) is detected (skip case #3b)", () => {
    const { work, bare } = makeRepoWithOrigin();
    try {
      fs.mkdirSync(path.join(work, ".git", "rebase-merge"), { recursive: true });
      const r = runGitPullSafe(work, {});
      expect(r).toEqual({ pulled: false, reason: "mid-rebase" });
    } finally {
      fs.rmSync(bare, { recursive: true, force: true });
    }
  });

  it("dirty working tree is detected (skip case #4)", () => {
    const { work, bare } = makeRepoWithOrigin();
    try {
      // Modify tracked file — `git diff --quiet HEAD` returns 1
      fs.writeFileSync(path.join(work, "README.md"), "dirty");
      const r = runGitPullSafe(work, {});
      expect(r).toEqual({ pulled: false, reason: "dirty" });
    } finally {
      fs.rmSync(bare, { recursive: true, force: true });
    }
  });

  it("clean repo with up-to-date upstream actually pulls (success path)", () => {
    const { work, bare } = makeRepoWithOrigin();
    try {
      const r = runGitPullSafe(work, {});
      expect(r).toEqual({ pulled: true, reason: null });
    } finally {
      fs.rmSync(bare, { recursive: true, force: true });
    }
  });
});
