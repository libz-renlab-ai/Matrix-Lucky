/**
 * compile-cursor — standalone Cursor .cursorrules adapter.
 *
 * Usage:
 *   teamagent compile-cursor [--out <path>] [--top <N>]
 *
 * Reads rules from the DualLayerStore (project + user-global sqlite DBs),
 * formats them as plain-text .cursorrules, and writes to the output path.
 * Default output: <cwd>/.cursorrules
 * Default top-N:  20 rules (sorted by confidence descending)
 */

import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { DualLayerStore } from "@teamagent/adapters";
import { compileCursorRules } from "@teamagent/core";

export interface CompileCursorOptions {
  /** Output path. Defaults to `<cwd>/.cursorrules` */
  out?: string;
  /** Max number of rules to include, sorted by confidence desc. Defaults to 20. */
  top?: number;
  // path injection for tests
  cwd?: string;
  homeDir?: string;
  projectDbPath?: string;
  userGlobalDbPath?: string;
}

export interface CompileCursorResult {
  outPath: string;
  ruleCount: number;
}

export function parseCompileCursorArgs(argv: string[]): CompileCursorOptions {
  const opts: CompileCursorOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--out") {
      opts.out = argv[++i];
    } else if (a.startsWith("--out=")) {
      opts.out = a.slice("--out=".length);
    } else if (a === "--top") {
      opts.top = parseInt(argv[++i] ?? "20", 10);
    } else if (a.startsWith("--top=")) {
      opts.top = parseInt(a.slice("--top=".length), 10);
    }
  }
  return opts;
}

export async function executeCompileCursor(
  opts: CompileCursorOptions = {},
): Promise<CompileCursorResult> {
  const home = opts.homeDir ?? os.homedir();
  const cwd = opts.cwd ?? process.cwd();
  const top = opts.top ?? 20;

  const projectDbPath =
    opts.projectDbPath ?? path.join(cwd, ".teamagent", "knowledge.db");
  const userGlobalDbPath =
    opts.userGlobalDbPath ?? path.join(home, ".teamagent", "global.db");
  const outPath = opts.out ?? path.join(cwd, ".cursorrules");

  fs.mkdirSync(path.dirname(projectDbPath), { recursive: true });
  fs.mkdirSync(path.dirname(userGlobalDbPath), { recursive: true });

  const store = new DualLayerStore({ projectDbPath, userGlobalDbPath });
  let entries;
  try {
    entries = store.getAll();
  } finally {
    store.close();
  }

  // Sort by confidence desc, take top N
  const sorted = [...entries]
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
    .slice(0, top);

  const output = compileCursorRules(sorted);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, output, "utf8");

  return { outPath, ruleCount: sorted.length };
}

export function renderCompileCursorResult(result: CompileCursorResult): string {
  return `Cursor rules compiled: ${result.ruleCount} rule(s) written to ${result.outPath}\n`;
}
