import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DualLayerStore } from "@teamagent/adapters";
import { detectSensitiveText } from "@teamagent/core";
import type { KnowledgeEntry } from "@teamagent/types";

export interface TeamExportOptions {
  cwd?: string;
  homeDir?: string;
  outPath?: string;
  now?: () => Date;
}

export interface TeamImportOptions {
  cwd?: string;
  homeDir?: string;
  filePath?: string;
}

export interface TeamTransferResult {
  ok: boolean;
  output: string;
  exported?: number;
  imported?: number;
  skipped?: number;
}

export interface TeamBundle {
  schema_version: 1;
  exported_at: string;
  entries: KnowledgeEntry[];
}

function defaultPaths(cwd: string, homeDir: string) {
  return {
    projectDbPath: path.join(cwd, ".teamagent", "knowledge.db"),
    userGlobalDbPath: path.join(homeDir, ".teamagent", "global.db"),
    defaultOutPath: path.join(cwd, ".teamagent", "team-rules.json"),
  };
}

function sensitiveTextForEntry(entry: KnowledgeEntry): string {
  return [
    entry.trigger,
    entry.wrong_pattern,
    entry.correct_pattern,
    entry.reasoning,
    entry.tags.join("\n"),
  ].join("\n");
}

export function buildTeamBundle(entries: KnowledgeEntry[], exportedAt: string): TeamBundle {
  return {
    schema_version: 1,
    exported_at: exportedAt,
    entries: entries.map((entry) => ({
      ...entry,
      scope: { ...entry.scope, level: "team" },
    })),
  };
}

export function parseTeamExportArgs(argv: string[]): Pick<TeamExportOptions, "outPath"> {
  const opts: Pick<TeamExportOptions, "outPath"> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if ((a === "--out" || a === "--output") && argv[i + 1]) {
      opts.outPath = argv[++i]!;
    } else if (a.startsWith("--out=")) {
      opts.outPath = a.slice("--out=".length);
    } else if (a.startsWith("--output=")) {
      opts.outPath = a.slice("--output=".length);
    }
  }
  return opts;
}

export function parseTeamImportArgs(argv: string[]): Pick<TeamImportOptions, "filePath"> {
  const opts: Pick<TeamImportOptions, "filePath"> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if ((a === "--file" || a === "--input") && argv[i + 1]) {
      opts.filePath = argv[++i]!;
    } else if (a.startsWith("--file=")) {
      opts.filePath = a.slice("--file=".length);
    } else if (a.startsWith("--input=")) {
      opts.filePath = a.slice("--input=".length);
    }
  }
  return opts;
}

export function executeTeamExport(opts: TeamExportOptions = {}): TeamTransferResult {
  const cwd = opts.cwd ?? process.cwd();
  const homeDir = opts.homeDir ?? os.homedir();
  const now = opts.now ?? (() => new Date());
  const paths = defaultPaths(cwd, homeDir);
  const outPath = opts.outPath ?? paths.defaultOutPath;

  if (!fs.existsSync(paths.projectDbPath)) {
    return { ok: true, exported: 0, output: `No project knowledge DB found; exported 0 team rules.\n` };
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.mkdirSync(path.dirname(paths.userGlobalDbPath), { recursive: true });

  const store = new DualLayerStore({
    projectDbPath: paths.projectDbPath,
    userGlobalDbPath: paths.userGlobalDbPath,
  });
  try {
    const entries = store.findByScopeLevel("team").filter((entry) => entry.status === "active");
    const sensitive = entries
      .map((entry) => ({ entry, findings: detectSensitiveText(sensitiveTextForEntry(entry)) }))
      .filter(({ findings }) => findings.length > 0);

    if (sensitive.length > 0) {
      const details = sensitive
        .map(({ entry, findings }) => `${entry.id}: ${[...new Set(findings.map((f) => f.kind))].join(", ")}`)
        .join("; ");
      return {
        ok: false,
        exported: 0,
        output: `Blocked team export: sensitive fields detected (${details}).\n`,
      };
    }

    const bundle = buildTeamBundle(entries, now().toISOString());
    fs.writeFileSync(outPath, `${JSON.stringify(bundle, null, 2)}\n`, "utf-8");
    return {
      ok: true,
      exported: entries.length,
      output: `Exported ${entries.length} team rules to ${outPath}\n`,
    };
  } finally {
    store.close();
  }
}

export function executeTeamImport(opts: TeamImportOptions = {}): TeamTransferResult {
  const cwd = opts.cwd ?? process.cwd();
  const homeDir = opts.homeDir ?? os.homedir();
  const paths = defaultPaths(cwd, homeDir);
  const filePath = opts.filePath ?? paths.defaultOutPath;

  if (!fs.existsSync(filePath)) {
    return { ok: false, imported: 0, skipped: 0, output: `Team import file not found: ${filePath}\n` };
  }

  const bundle = JSON.parse(fs.readFileSync(filePath, "utf-8")) as TeamBundle;
  if (bundle.schema_version !== 1 || !Array.isArray(bundle.entries)) {
    return { ok: false, imported: 0, skipped: 0, output: `Invalid team import bundle: ${filePath}\n` };
  }

  fs.mkdirSync(path.dirname(paths.projectDbPath), { recursive: true });
  fs.mkdirSync(path.dirname(paths.userGlobalDbPath), { recursive: true });

  const store = new DualLayerStore({
    projectDbPath: paths.projectDbPath,
    userGlobalDbPath: paths.userGlobalDbPath,
  });
  let imported = 0;
  let skipped = 0;
  try {
    for (const entry of bundle.entries) {
      const teamEntry: KnowledgeEntry = { ...entry, scope: { ...entry.scope, level: "team" } };
      if (store.getById(teamEntry.id)) {
        skipped++;
        continue;
      }
      store.add(teamEntry);
      imported++;
    }
  } finally {
    store.close();
  }

  return {
    ok: true,
    imported,
    skipped,
    output: `Imported ${imported} team rules from ${filePath}; skipped ${skipped} existing rules.\n`,
  };
}
