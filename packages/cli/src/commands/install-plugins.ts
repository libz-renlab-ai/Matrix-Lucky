import {
  DEFAULT_MARKETPLACES,
  DEFAULT_PLUGINS,
  formatPluginSpec,
  type MarketplaceSpec,
  type PluginSpec,
} from "@teamagent/core";
import {
  ClaudePluginInstaller,
  type StepOutcome,
} from "@teamagent/adapters";

export type InstallItemStatus = "added" | "already" | "failed" | "would-do";

export interface InstallItemResult {
  name: string;
  status: InstallItemStatus;
  detail: string;
}

export interface InstallPluginsResult {
  ok: boolean;
  dryRun: boolean;
  marketplaces: InstallItemResult[];
  plugins: InstallItemResult[];
  summary: {
    added: number;
    alreadyPresent: number;
    failed: number;
    wouldDo: number;
  };
}

export interface InstallPluginsOptions {
  dryRun?: boolean;
  /** Filter: only install plugins whose name is in this list. Unknown names produce a failed entry. */
  only?: string[];
  /** Passed through to `claude plugin install --scope`. Default: CLI default (user). */
  scope?: "user" | "project" | "local";
  /** Inject custom installer (tests). */
  installer?: ClaudePluginInstaller;
}

export function parseInstallPluginsArgs(argv: string[]): InstallPluginsOptions {
  const opts: InstallPluginsOptions = { dryRun: false };
  for (const a of argv) {
    if (a === "--dry-run") opts.dryRun = true;
    else if (a.startsWith("--only=")) {
      opts.only = a.slice("--only=".length).split(",").map((s) => s.trim()).filter(Boolean);
    } else if (a.startsWith("--scope=")) {
      const s = a.slice("--scope=".length);
      if (s === "user" || s === "project" || s === "local") opts.scope = s;
    }
  }
  return opts;
}

export async function executeInstallPlugins(
  opts: InstallPluginsOptions = {},
): Promise<InstallPluginsResult> {
  const dryRun = opts.dryRun ?? false;
  const installer = opts.installer ?? new ClaudePluginInstaller();

  const { plugins, unknown } = resolvePlugins(opts.only);
  const marketplaces = resolveMarketplaces(plugins);

  const marketplaceResults: InstallItemResult[] = [];
  const pluginResults: InstallItemResult[] = [];

  for (const m of marketplaces) {
    if (dryRun) {
      marketplaceResults.push({
        name: m.name,
        status: "would-do",
        detail: `(dry-run) would add marketplace ${m.repo}`,
      });
      continue;
    }
    const outcome = await installer.addMarketplace(m);
    marketplaceResults.push(outcomeToItem(m.name, outcome));
  }

  for (const p of plugins) {
    const spec = formatPluginSpec(p);
    if (dryRun) {
      pluginResults.push({
        name: spec,
        status: "would-do",
        detail: `(dry-run) would install ${spec}`,
      });
      continue;
    }
    const scopeOpt = opts.scope ? { scope: opts.scope } : {};
    const outcome = await installer.installPlugin(p, scopeOpt);
    pluginResults.push(outcomeToItem(spec, outcome));
  }

  for (const name of unknown) {
    pluginResults.push({
      name,
      status: "failed",
      detail: `unknown plugin: '${name}' is not in the default bundle`,
    });
  }

  const summary = {
    added: countStatus([...marketplaceResults, ...pluginResults], "added"),
    alreadyPresent: countStatus([...marketplaceResults, ...pluginResults], "already"),
    failed: countStatus([...marketplaceResults, ...pluginResults], "failed"),
    wouldDo: countStatus([...marketplaceResults, ...pluginResults], "would-do"),
  };
  const ok = summary.failed === 0;
  return { ok, dryRun, marketplaces: marketplaceResults, plugins: pluginResults, summary };
}

export function renderInstallPluginsResult(result: InstallPluginsResult): string {
  const lines: string[] = [];
  if (result.dryRun) {
    lines.push("⚠️  预览模式（--dry-run）：以下操作不会实际执行");
    lines.push("");
  }

  if (result.marketplaces.length > 0) {
    lines.push("📦 Marketplaces:");
    for (const m of result.marketplaces) {
      lines.push(`   ${iconFor(m.status)} ${m.name}  ${truncate(m.detail, 100)}`);
    }
    lines.push("");
  }

  if (result.plugins.length > 0) {
    lines.push("🔌 Plugins:");
    for (const p of result.plugins) {
      lines.push(`   ${iconFor(p.status)} ${p.name}  ${truncate(p.detail, 100)}`);
    }
    lines.push("");
  }

  const s = result.summary;
  const parts: string[] = [];
  if (s.added) parts.push(`${s.added} 新装`);
  if (s.alreadyPresent) parts.push(`${s.alreadyPresent} 已存在`);
  if (s.failed) parts.push(`${s.failed} 失败`);
  if (s.wouldDo) parts.push(`${s.wouldDo} 将执行`);
  lines.push("─".repeat(36));
  lines.push(parts.length > 0 ? parts.join("，") : "无事可做");
  if (result.ok && !result.dryRun) {
    lines.push("重启 Claude Code 让插件加载");
  }
  return lines.join("\n") + "\n";
}

// --- helpers ---

function resolvePlugins(only?: string[]): {
  plugins: PluginSpec[];
  unknown: string[];
} {
  if (!only || only.length === 0) {
    return { plugins: [...DEFAULT_PLUGINS], unknown: [] };
  }
  const byName = new Map(DEFAULT_PLUGINS.map((p) => [p.plugin, p]));
  const plugins: PluginSpec[] = [];
  const unknown: string[] = [];
  for (const name of only) {
    const hit = byName.get(name);
    if (hit) plugins.push(hit);
    else unknown.push(name);
  }
  return { plugins, unknown };
}

function resolveMarketplaces(plugins: PluginSpec[]): MarketplaceSpec[] {
  const needed = new Set(plugins.map((p) => p.marketplace));
  return DEFAULT_MARKETPLACES.filter((m) => needed.has(m.name));
}

function outcomeToItem(name: string, outcome: StepOutcome): InstallItemResult {
  return { name, status: outcome.status, detail: outcome.detail };
}

function countStatus(items: InstallItemResult[], status: InstallItemStatus): number {
  return items.filter((i) => i.status === status).length;
}

function iconFor(status: InstallItemStatus): string {
  switch (status) {
    case "added":
      return "✅";
    case "already":
      return "⏭ ";
    case "failed":
      return "❌";
    case "would-do":
      return "📝";
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
