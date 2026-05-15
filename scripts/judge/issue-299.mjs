#!/usr/bin/env node
/**
 * Judge harness for FIXEDFLOW issue #299.
 *
 * Per docs/plans/2026-05-12-issue-299/plan.md §how-to-eval, this script
 * runs five end-to-end probes against the live build pipeline and
 * install/doctor commands, then emits a single JSON evidence artifact
 * for an external LLM judge to consume.
 *
 * Usage (from repo root):
 *
 *   node scripts/judge/issue-299.mjs
 *
 * Outputs land under:
 *
 *   docs/plans/2026-05-12-issue-299/evidence/<run_id>/judge.json
 *
 * The harness is dependency-free: only Node builtins + pnpm/node
 * child processes. It does NOT judge itself — the LLM judge consumes
 * `judge.json` per docs/AGENTIC-CODING-POLICY.md §3. We do print a
 * convenience verdict line at the end (last line of stdout) so callers
 * can spot trivial failures without reading the JSON.
 *
 * Probes:
 *   1. build_ok                                   — `pnpm --filter teamagent build` exits 0
 *   2. dist_has_tap_cjs                           — packages/teamagent/dist/bin-digital-twin-tap.cjs exists post-build
 *   3. settings_has_tap_entry                     — fresh sandbox `install-hook` registers DIGITAL_TWIN_TAG Stop entry
 *   4. doctor_exit_code_when_missing              — after deleting tap.cjs, `teamagent doctor` exits non-zero
 *   5. doctor_stderr_names_file                   — same run, output contains the bundle filename
 *   6. install_exit_code_when_missing             — with tap.cjs still deleted, `install-hook` succeeds (exit 0)
 *   7. install_stderr_warn_line_present           — same run, stderr contains the exact warn line
 *   8. other_hooks_still_installed_when_missing   — fresh sandbox still gets bin-stop.cjs / bin-pre-tool-use.cjs entries
 */

import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");

function ulid() {
  return (
    Date.now().toString(36).toUpperCase() +
    "-" +
    crypto.randomBytes(5).toString("hex").toUpperCase()
  );
}

function isWindows() {
  return process.platform === "win32";
}

function runCommand(cmd, args, opts = {}) {
  // Use shell:true on Windows so `pnpm`/`npm` shim batch files work.
  const result = spawnSync(cmd, args, {
    encoding: "utf-8",
    shell: isWindows(),
    windowsHide: true,
    ...opts,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error ? String(result.error) : null,
  };
}

function writeText(file, body) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body, "utf-8");
}

function readSettings(homeDir) {
  const p = path.join(homeDir, ".claude", "settings.json");
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}

function hasTagEntry(settings, channel, tag) {
  const list = settings?.hooks?.[channel];
  if (!Array.isArray(list)) return false;
  return list.some((e) => e?._teamagentTag === tag);
}

const RUN_ID = ulid();
const EVIDENCE_DIR = path.join(
  REPO_ROOT,
  "docs",
  "plans",
  "2026-05-12-issue-299",
  "evidence",
  RUN_ID,
);
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

const REPORT = {
  run_id: RUN_ID,
  iso: new Date().toISOString(),
  platform: process.platform,
  node_version: process.version,
};

// ─── Probe 1: build ──────────────────────────────────────────────────────────
const build = runCommand("pnpm", ["--filter", "teamagent", "build"], {
  cwd: REPO_ROOT,
});
writeText(path.join(EVIDENCE_DIR, "build.stdout.log"), build.stdout);
writeText(path.join(EVIDENCE_DIR, "build.stderr.log"), build.stderr);
writeText(path.join(EVIDENCE_DIR, "build.exitcode"), String(build.status));
REPORT.build_ok = build.status === 0;

// ─── Probe 2: dist has tap.cjs ───────────────────────────────────────────────
const distDir = path.join(REPO_ROOT, "packages", "teamagent", "dist");
const tapPath = path.join(distDir, "bin-digital-twin-tap.cjs");
REPORT.dist_has_tap_cjs = fs.existsSync(tapPath);
REPORT.tap_path = tapPath;

const binPath = path.join(distDir, "bin.js");
if (!fs.existsSync(binPath)) {
  REPORT.error = `bin.js missing at ${binPath}; build likely failed`;
  REPORT.verdict = "FAIL";
  finalize();
}

// ─── Probe 3: positive install — settings has tap entry ──────────────────────
const homePositive = fs.mkdtempSync(path.join(os.tmpdir(), "ta-299-home-pos-"));
const projPositive = fs.mkdtempSync(path.join(os.tmpdir(), "ta-299-proj-pos-"));

const installPos = runCommand("node", [binPath, "install-hook"], {
  cwd: projPositive,
  env: {
    ...process.env,
    HOME: homePositive,
    USERPROFILE: homePositive,
  },
});
writeText(path.join(EVIDENCE_DIR, "install-positive.stdout.log"), installPos.stdout);
writeText(path.join(EVIDENCE_DIR, "install-positive.stderr.log"), installPos.stderr);
writeText(path.join(EVIDENCE_DIR, "install-positive.exitcode"), String(installPos.status));

const settingsPos = readSettings(homePositive);
REPORT.install_positive_exit = installPos.status;
REPORT.settings_has_tap_entry = hasTagEntry(
  settingsPos,
  "Stop",
  "teamagent-digital-twin-tap",
);
if (settingsPos) {
  writeText(
    path.join(EVIDENCE_DIR, "settings-positive.json"),
    JSON.stringify(settingsPos, null, 2),
  );
}

// ─── Probe 4 + 5: delete tap.cjs, run doctor ─────────────────────────────────
let tapBackup = null;
if (REPORT.dist_has_tap_cjs) {
  tapBackup = `${tapPath}.judge-bak-${RUN_ID}`;
  fs.copyFileSync(tapPath, tapBackup);
  fs.unlinkSync(tapPath);
}

const doctorRun = runCommand("node", [binPath, "doctor"], {
  cwd: projPositive,
  env: {
    ...process.env,
    HOME: homePositive,
    USERPROFILE: homePositive,
  },
});
writeText(path.join(EVIDENCE_DIR, "doctor-negative.stdout.log"), doctorRun.stdout);
writeText(path.join(EVIDENCE_DIR, "doctor-negative.stderr.log"), doctorRun.stderr);
writeText(path.join(EVIDENCE_DIR, "doctor-negative.exitcode"), String(doctorRun.status));

REPORT.doctor_exit_code_when_missing = doctorRun.status;
const doctorAllText = `${doctorRun.stdout}\n${doctorRun.stderr}`;
REPORT.doctor_stderr_names_file = doctorAllText.includes("bin-digital-twin-tap.cjs");

// ─── Probe 6 + 7 + 8: install with bundle missing ────────────────────────────
const homeNegative = fs.mkdtempSync(path.join(os.tmpdir(), "ta-299-home-neg-"));
const projNegative = fs.mkdtempSync(path.join(os.tmpdir(), "ta-299-proj-neg-"));

const installNeg = runCommand("node", [binPath, "install-hook"], {
  cwd: projNegative,
  env: {
    ...process.env,
    HOME: homeNegative,
    USERPROFILE: homeNegative,
  },
});
writeText(path.join(EVIDENCE_DIR, "install-negative.stdout.log"), installNeg.stdout);
writeText(path.join(EVIDENCE_DIR, "install-negative.stderr.log"), installNeg.stderr);
writeText(path.join(EVIDENCE_DIR, "install-negative.exitcode"), String(installNeg.status));

REPORT.install_exit_code_when_missing = installNeg.status;
REPORT.install_stderr_warn_line_present =
  installNeg.stderr.includes("teamagent: skipping channel Stop") &&
  installNeg.stderr.includes("bin-digital-twin-tap.cjs") &&
  installNeg.stderr.includes("not found");

const settingsNeg = readSettings(homeNegative);
if (settingsNeg) {
  writeText(
    path.join(EVIDENCE_DIR, "settings-negative.json"),
    JSON.stringify(settingsNeg, null, 2),
  );
}
REPORT.other_hooks_still_installed_when_missing =
  hasTagEntry(settingsNeg, "PreToolUse", "teamagent-pre-tool-use") ||
  hasTagEntry(settingsNeg, "Stop", "teamagent-stop");

// ─── Restore tap.cjs so subsequent runs / consumers find a clean dist ────────
if (tapBackup && fs.existsSync(tapBackup)) {
  try {
    fs.renameSync(tapBackup, tapPath);
  } catch {
    fs.copyFileSync(tapBackup, tapPath);
    fs.unlinkSync(tapBackup);
  }
}

// Cleanup sandboxes
for (const dir of [homePositive, projPositive, homeNegative, projNegative]) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}

finalize();

function finalize() {
  const passConditions = [
    REPORT.build_ok === true,
    REPORT.dist_has_tap_cjs === true,
    REPORT.settings_has_tap_entry === true,
    typeof REPORT.doctor_exit_code_when_missing === "number" &&
      REPORT.doctor_exit_code_when_missing !== 0,
    REPORT.doctor_stderr_names_file === true,
    REPORT.install_exit_code_when_missing === 0,
    REPORT.install_stderr_warn_line_present === true,
    REPORT.other_hooks_still_installed_when_missing === true,
  ];
  REPORT.verdict = passConditions.every(Boolean) ? "PASS" : "FAIL";
  REPORT.conditions_met = passConditions.filter(Boolean).length;
  REPORT.conditions_total = passConditions.length;

  const judgeJsonPath = path.join(EVIDENCE_DIR, "judge.json");
  writeText(judgeJsonPath, JSON.stringify(REPORT, null, 2));

  process.stdout.write(JSON.stringify(REPORT, null, 2) + "\n\n");
  process.stdout.write(
    `JUDGE: ${REPORT.verdict} run_id=${RUN_ID} (${REPORT.conditions_met}/${REPORT.conditions_total})\n`,
  );
  process.stdout.write(`Evidence: ${judgeJsonPath}\n`);
  process.exit(REPORT.verdict === "PASS" ? 0 : 1);
}
