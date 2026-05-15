import fs from "node:fs";
import path from "node:path";
import { execSync as nodeExecSync } from "node:child_process";
import { executeTeamExport, executeTeamImport } from "./team-transfer.js";

export interface ParsedGitSyncArgs {
  subcommand: "push" | "pull";
  remote: string;
  branch?: string;
  rulesFile?: string;
  cwd?: string;
}

export function parseGitSyncArgs(argv: string[]): ParsedGitSyncArgs {
  const [subcommand, ...flags] = argv;
  if (subcommand !== "push" && subcommand !== "pull") {
    throw new Error(`Usage: teamagent sync <push|pull> --remote <url> [--branch <branch>] [--cwd <path>]`);
  }
  let remote: string | undefined;
  let branch: string | undefined;
  let rulesFile: string | undefined;
  let cwd: string | undefined;
  for (let i = 0; i < flags.length; i++) {
    const f = flags[i]!;
    if (f.startsWith("--remote=")) { remote = f.slice("--remote=".length); }
    else if (f === "--remote" && flags[i + 1]) { remote = flags[++i]; }
    else if (f.startsWith("--branch=")) { branch = f.slice("--branch=".length); }
    else if (f === "--branch" && flags[i + 1]) { branch = flags[++i]; }
    else if (f.startsWith("--rules-file=")) { rulesFile = f.slice("--rules-file=".length); }
    else if (f === "--rules-file" && flags[i + 1]) { rulesFile = flags[++i]; }
    else if (f.startsWith("--cwd=")) { cwd = f.slice("--cwd=".length); }
    else if (f === "--cwd" && flags[i + 1]) { cwd = flags[++i]; }
  }
  if (!remote) throw new Error("Missing required flag: --remote");
  return { subcommand, remote, branch, rulesFile, cwd };
}

export interface GitSyncOptions {
  /** Working directory (project root with .teamagent/) */
  cwd?: string;
  homeDir?: string;
  /** Remote URL or bare repo path — required */
  remote: string;
  /** Branch to push/pull (default: "main") */
  branch?: string;
  /** Relative path of rules bundle inside repo (default: ".teamagent/team-rules.json") */
  rulesFile?: string;
  /** Injected for testing; defaults to node's execSync */
  execSync?: (cmd: string, opts: { cwd: string; encoding: "utf-8" }) => string;
  /** Suppress commit when nothing changed (default: true) */
  skipCleanCommit?: boolean;
}

export interface GitSyncResult {
  ok: boolean;
  output: string;
  exported?: number;
  imported?: number;
  skipped?: number;
  pushed?: boolean;
  pulled?: boolean;
}

/**
 * Push side: export team rules → commit team-rules.json → push to remote.
 * Pure function: all IO via injected execSync and fs. No direct process.cwd().
 */
export function executeGitSyncPush(opts: GitSyncOptions): GitSyncResult {
  const cwd = opts.cwd ?? process.cwd();
  const branch = opts.branch ?? "main";
  const rulesFile = opts.rulesFile ?? ".teamagent/team-rules.json";
  const exec = opts.execSync ?? ((cmd, o) => nodeExecSync(cmd, { ...o, stdio: "pipe" }).toString());
  const log: string[] = [];

  // Step 1: export rules to bundle file
  const outPath = path.isAbsolute(rulesFile) ? rulesFile : path.join(cwd, rulesFile);
  const exportResult = executeTeamExport({
    cwd,
    homeDir: opts.homeDir,
    outPath,
  });
  log.push(exportResult.output.trim());
  if (!exportResult.ok) {
    return { ok: false, output: log.join("\n") };
  }

  // Step 2: ensure git repo exists; init if not
  const gitDir = path.join(cwd, ".git");
  if (!fs.existsSync(gitDir)) {
    exec("git init", { cwd, encoding: "utf-8" });
    exec(`git checkout -b ${branch}`, { cwd, encoding: "utf-8" });
    log.push(`Initialized git repo in ${cwd}`);
  }

  // Step 3: ensure remote is set
  try {
    const remotes = exec("git remote", { cwd, encoding: "utf-8" });
    if (!remotes.includes("origin")) {
      exec(`git remote add origin "${opts.remote}"`, { cwd, encoding: "utf-8" });
      log.push(`Added remote origin: ${opts.remote}`);
    }
  } catch {
    exec(`git remote add origin "${opts.remote}"`, { cwd, encoding: "utf-8" });
    log.push(`Added remote origin: ${opts.remote}`);
  }

  // Step 4: stage and commit rules bundle (create empty bundle if export produced nothing)
  if (!fs.existsSync(outPath)) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify({ schema_version: 1, exported_at: new Date().toISOString(), entries: [] }));
    log.push("Created empty team-rules.json (no rules to export)");
  }
  exec(`git add "${rulesFile}"`, { cwd, encoding: "utf-8" });

  let pushed = false;
  try {
    const status = exec("git status --porcelain", { cwd, encoding: "utf-8" });
    const hasChanges = status.trim().length > 0;

    if (hasChanges || !(opts.skipCleanCommit ?? true)) {
      exec(
        `git -c user.email="teamagent@sync" -c user.name="TeamAgent Sync" commit -m "sync: update team-rules.json"`,
        { cwd, encoding: "utf-8" },
      );
      log.push("Committed team-rules.json");
    } else {
      log.push("No changes to commit — rules already up to date");
    }

    exec(`git push origin ${branch}`, { cwd, encoding: "utf-8" });
    pushed = true;
    log.push(`Pushed to remote (branch: ${branch})`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.push(`Git push failed: ${msg}`);
    return { ok: false, output: log.join("\n"), pushed: false };
  }

  return {
    ok: true,
    output: log.join("\n"),
    exported: exportResult.exported,
    pushed,
  };
}

/**
 * Pull side: clone or pull remote → import team-rules.json into local store.
 * Pure function: all IO via injected execSync and fs.
 */
export function executeGitSyncPull(opts: GitSyncOptions): GitSyncResult {
  const cwd = opts.cwd ?? process.cwd();
  const branch = opts.branch ?? "main";
  const rulesFile = opts.rulesFile ?? ".teamagent/team-rules.json";
  const exec = opts.execSync ?? ((cmd, o) => nodeExecSync(cmd, { ...o, stdio: "pipe" }).toString());
  const log: string[] = [];

  // Step 1: clone or pull
  const gitDir = path.join(cwd, ".git");
  let pulled = false;
  try {
    if (!fs.existsSync(gitDir)) {
      exec(`git clone "${opts.remote}" .`, { cwd, encoding: "utf-8" });
      log.push(`Cloned from ${opts.remote}`);
    } else {
      exec(`git fetch origin`, { cwd, encoding: "utf-8" });
      exec(`git checkout ${branch}`, { cwd, encoding: "utf-8" });
      exec(`git merge --ff-only origin/${branch}`, { cwd, encoding: "utf-8" });
      log.push(`Pulled from origin/${branch}`);
    }
    pulled = true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.push(`Git pull failed: ${msg}`);
    return { ok: false, output: log.join("\n"), pulled: false };
  }

  // Step 2: import rules bundle
  const filePath = path.isAbsolute(rulesFile) ? rulesFile : path.join(cwd, rulesFile);
  if (!fs.existsSync(filePath)) {
    log.push(`No team-rules.json found at ${filePath} after pull — remote may be empty`);
    return { ok: false, output: log.join("\n"), pulled };
  }

  const importResult = executeTeamImport({
    cwd,
    homeDir: opts.homeDir,
    filePath,
  });
  log.push(importResult.output.trim());

  return {
    ok: importResult.ok,
    output: log.join("\n"),
    imported: importResult.imported,
    skipped: importResult.skipped,
    pulled,
  };
}
