import { createRequire } from "node:module";
import type { DatabaseSync } from "node:sqlite";
import { DEFAULT_FIRE_THRESHOLD } from "@teamagent/types";

// node:sqlite 是 Node 22+ 实验性内置模块，不在 builtinModules 列表里，
// vite/vitest 的静态 import 无法解析。用 createRequire 在运行时加载。
const require = createRequire(import.meta.url);
const { DatabaseSync: DatabaseSyncCtor } = require("node:sqlite") as typeof import("node:sqlite");

// sqlite-vec: load synchronously via require (same pattern as node:sqlite above)
let _sqliteVecLoad: ((db: unknown) => void) | undefined;
try {
  const mod = require("sqlite-vec") as { load?: (db: unknown) => void };
  _sqliteVecLoad = mod.load;
} catch {
  // sqlite-vec native bindings not available — vector features will be disabled
}

/** 所有 DDL 集中在这里，首次打开 DB 时幂等执行一次。 */
export const INIT_SQL = `
-- 知识主表
CREATE TABLE IF NOT EXISTS knowledge (
  id TEXT PRIMARY KEY,
  scope_level TEXT NOT NULL CHECK(scope_level IN ('personal','team','global')),
  scope_project TEXT,
  scope_paths TEXT,
  scope_file_types TEXT,
  scope_branches TEXT,
  category TEXT NOT NULL,
  tags TEXT,
  type TEXT NOT NULL,
  nature TEXT NOT NULL,
  trigger TEXT NOT NULL,
  wrong_pattern TEXT DEFAULT '',
  correct_pattern TEXT NOT NULL,
  correct_pattern_code_example TEXT,
  correct_pattern_import_path TEXT,
  correct_pattern_tldr TEXT,
  reasoning TEXT,
  when_expression TEXT,
  confidence REAL NOT NULL DEFAULT 0,
  demerit REAL NOT NULL DEFAULT 0,
  demerit_last_updated TEXT,
  current_tier TEXT NOT NULL DEFAULT 'experimental'
    CHECK(current_tier IN ('experimental','probation','stable','canonical','enforced','dormant')),
  max_tier_ever TEXT NOT NULL DEFAULT 'experimental',
  tier_entered_at TEXT NOT NULL,
  enforcement TEXT NOT NULL DEFAULT 'passive',
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active','conflict','stale','archived','dormant')),
  hit_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  override_count INTEGER NOT NULL DEFAULT 0,
  resurrect_count INTEGER NOT NULL DEFAULT 0,
  evidence TEXT,
  source TEXT NOT NULL,
  conflict_with TEXT,
  created_at TEXT NOT NULL,
  last_hit_at TEXT,
  last_validated_at TEXT,
  -- M4-A: 规则通道。tool-action 是向后兼容默认值。
  channel TEXT NOT NULL DEFAULT 'tool-action'
    CHECK(channel IN ('tool-action','ai-narrative','user-input','passive-knowledge'))
);

CREATE INDEX IF NOT EXISTS idx_knowledge_tier ON knowledge(current_tier);
CREATE INDEX IF NOT EXISTS idx_knowledge_scope ON knowledge(scope_level, scope_project);
CREATE INDEX IF NOT EXISTS idx_knowledge_status ON knowledge(status);

-- 观察表（Calibrator 用，v2 新增）
CREATE TABLE IF NOT EXISTS observations (
  id TEXT PRIMARY KEY,
  knowledge_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK(outcome IN ('success','failure')),
  source_event TEXT,
  tool_use_id TEXT,
  FOREIGN KEY(knowledge_id) REFERENCES knowledge(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_obs_knowledge ON observations(knowledge_id, timestamp DESC);

-- 事件表（替代 JsonlEventLog，全历史 append-only）
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  knowledge_id TEXT,
  tool_use_id TEXT,
  timestamp TEXT NOT NULL,
  payload TEXT
);

CREATE INDEX IF NOT EXISTS idx_events_kind ON events(kind, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_knowledge ON events(knowledge_id);

-- 候选规则队列（M2.5-half，review-candidates 用）
CREATE TABLE IF NOT EXISTS rule_candidates (
  id          TEXT PRIMARY KEY,
  entry_json  TEXT NOT NULL,
  source_signals TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','approved','rejected','skipped')),
  created_at  TEXT NOT NULL,
  reviewed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_candidates_status ON rule_candidates(status, created_at ASC);

-- schema 版本表（后续 migration 用）
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);
INSERT OR IGNORE INTO schema_version(version, applied_at) VALUES (1, datetime('now'));
`;

export const CURRENT_SCHEMA_VERSION = 8;

const V6_ADDITIONS = `
CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
  id UNINDEXED,
  trigger_description,
  pattern_description,
  tokenize='porter unicode61'
);

CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_trigger_vec USING vec0(
  id TEXT PRIMARY KEY,
  vec FLOAT[384]
);

CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_pattern_vec USING vec0(
  id TEXT PRIMARY KEY,
  vec FLOAT[384]
);
`;

const V6_FTS_ONLY = `
CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
  id UNINDEXED,
  trigger_description,
  pattern_description,
  tokenize='porter unicode61'
);
`;

const V6_ALTER_COLUMNS = [
  "trigger_description TEXT DEFAULT ''",
  "pattern_description TEXT DEFAULT ''",
  "hard_negatives BLOB",
  "threshold_alpha REAL DEFAULT 1.0",
  "threshold_beta REAL DEFAULT 1.0",
  `fire_threshold REAL DEFAULT ${DEFAULT_FIRE_THRESHOLD}`,
  "observation_window BLOB",
  "embedder_model_id TEXT DEFAULT ''",
];

function applyV6Migration(db: DatabaseSync): void {
  const existing = new Set(
    (db.prepare("PRAGMA table_info(knowledge)").all() as Array<{ name: string }>)
      .map((c) => c.name),
  );
  for (const colDef of V6_ALTER_COLUMNS) {
    const colName = colDef.split(/\s+/)[0];
    if (!colName) continue;
    if (!existing.has(colName)) {
      db.exec(`ALTER TABLE knowledge ADD COLUMN ${colDef}`);
    }
  }
  // FTS5 may not be compiled into Node 22 experimental SQLite — guard it
  try {
    db.exec(V6_FTS_ONLY);
  } catch { /* FTS5 not available in this SQLite build — BM25 search disabled */ }
  // vec0 requires sqlite-vec extension to be loaded
  if (_sqliteVecLoad) {
    try {
      db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_trigger_vec USING vec0(
        id TEXT PRIMARY KEY,
        vec FLOAT[384]
      )`);
      db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_pattern_vec USING vec0(
        id TEXT PRIMARY KEY,
        vec FLOAT[384]
      )`);
    } catch { /* vec0 not available */ }
  }
}


const V7_ALTER_COLUMNS = [
  "tool_context_description TEXT DEFAULT ''",
];

function applyV7Migration(db: DatabaseSync): void {
  const existing = new Set(
    (db.prepare("PRAGMA table_info(knowledge)").all() as Array<{ name: string }>)
      .map((c) => c.name),
  );
  for (const colDef of V7_ALTER_COLUMNS) {
    const colName = colDef.split(/\s+/)[0];
    if (!colName) continue;
    if (!existing.has(colName)) {
      db.exec(`ALTER TABLE knowledge ADD COLUMN ${colDef}`);
    }
  }
  if (_sqliteVecLoad) {
    try {
      db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_tool_vec USING vec0(
        id TEXT PRIMARY KEY,
        vec FLOAT[384]
      )`);
    } catch { /* vec0 not available */ }
  }
}


/**
 * 打开/创建 SQLite DB 并确保 schema 初始化。
 * 幂等——重复调用无副作用。
 */
export function openDb(path: string): DatabaseSync {
  // allowExtension: true is required for sqlite-vec.load() to call db.loadExtension();
  // node:sqlite forbids extension loading by default.
  const db = new DatabaseSyncCtor(path, { allowExtension: true });
  db.exec("PRAGMA busy_timeout = 5000;");
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");

  // Load sqlite-vec extension before DDL so vec0 virtual table can be created
  if (_sqliteVecLoad) {
    try { _sqliteVecLoad(db); } catch { /* ok if db doesn't support loadExtension */ }
  }

  db.exec(INIT_SQL);

  // Idempotent virtual-table creation. Lives outside the schema_version migration
  // because older DBs marked v3 applied even when CREATE silently failed (sqlite-vec
  // unloaded). IF NOT EXISTS makes re-runs cheap; outer try/catch swallows when
  // sqlite-vec is unavailable.
  try {
    db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_vec USING vec0(
      knowledge_id TEXT PRIMARY KEY,
      embedding FLOAT[384]
    )`);
  } catch { /* sqlite-vec not loaded — vector features disabled */ }

  // Migration: schema_version 1 → 2 was wiki_meta column additions (now removed in v8).
  const version = db.prepare("SELECT version FROM schema_version ORDER BY version DESC LIMIT 1").get() as { version: number } | undefined;
  if (!version || version.version < 2) {
    db.exec("INSERT OR REPLACE INTO schema_version(version, applied_at) VALUES (2, datetime('now'))");
  }

  // Migration: schema_version 2 → 3 (add knowledge_vec virtual table)
  if (!version || version.version < 3) {
    try {
      db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_vec USING vec0(
        knowledge_id TEXT PRIMARY KEY,
        embedding FLOAT[384]
      )`);
    } catch { /* ok if sqlite-vec not loaded */ }
    db.exec("INSERT OR REPLACE INTO schema_version(version, applied_at) VALUES (3, datetime('now'))");
  }

  // Migration: schema_version 3 → 4 was last_injected_at on wiki_meta (now removed in v8).
  const versionNow = db.prepare("SELECT version FROM schema_version ORDER BY version DESC LIMIT 1").get() as { version: number } | undefined;
  if (!versionNow || versionNow.version < 4) {
    db.exec("INSERT OR REPLACE INTO schema_version(version, applied_at) VALUES (4, datetime('now'))");
  }

  // Migration: schema_version 4 → 5 (M4-A: add channel column to knowledge)
  const versionM4 = db.prepare("SELECT version FROM schema_version ORDER BY version DESC LIMIT 1").get() as { version: number } | undefined;
  if (!versionM4 || versionM4.version < 5) {
    // node:sqlite ALTER TABLE throws on existing column — swallow and continue.
    try {
      db.exec("ALTER TABLE knowledge ADD COLUMN channel TEXT NOT NULL DEFAULT 'tool-action'");
    } catch { /* column already exists (fresh DB via INIT_SQL, or previous partial migration) */ }
    db.exec("INSERT OR REPLACE INTO schema_version(version, applied_at) VALUES (5, datetime('now'))");
  }

  // Migration: schema_version 5 → 6 (M4-B: semantic matching fields + FTS5 + vec0)
  const versionM4B = db.prepare("SELECT version FROM schema_version ORDER BY version DESC LIMIT 1").get() as { version: number } | undefined;
  if (!versionM4B || versionM4B.version < 6) {
    applyV6Migration(db);
    db.exec("INSERT OR REPLACE INTO schema_version(version, applied_at) VALUES (6, datetime('now'))");
  }
  // Repair partially-applied M4-B databases. Some installs reached version 6
  // before sqlite-vec/FTS tables were available, so version alone is not enough.
  applyV6Migration(db);

  // Migration: schema_version 6 → 7 (M6: tool_context_description column + knowledge_tool_vec table)
  const versionM6 = db.prepare("SELECT version FROM schema_version ORDER BY version DESC LIMIT 1").get() as { version: number } | undefined;
  if (!versionM6 || versionM6.version < 7) {
    applyV7Migration(db);
    db.exec("INSERT OR REPLACE INTO schema_version(version, applied_at) VALUES (7, datetime('now'))");
  }
  // Repair partially-applied M6 databases.
  applyV7Migration(db);

  // Migration: schema_version 7 → 8 (drop legacy wiki_* tables; the wiki feature was removed)
  const versionWikiDrop = db.prepare("SELECT version FROM schema_version ORDER BY version DESC LIMIT 1").get() as { version: number } | undefined;
  if (!versionWikiDrop || versionWikiDrop.version < 8) {
    db.exec("DROP TABLE IF EXISTS wiki_meta");
    db.exec("DROP TABLE IF EXISTS wiki_subscriptions");
    db.exec("DROP TABLE IF EXISTS wiki_rejection_log");
    db.exec("DROP TABLE IF EXISTS wiki_entries");
    db.exec("DROP TABLE IF EXISTS wiki_sources");
    db.exec("DROP TABLE IF EXISTS wiki_rejections");
    try { db.exec("DROP TABLE IF EXISTS wiki_entries_vec"); } catch {}
    try { db.exec("DROP TABLE IF EXISTS wiki_entries_fts"); } catch {}
    try { db.exec("DROP TABLE IF EXISTS wiki_vec"); } catch {}
    db.exec("INSERT OR REPLACE INTO schema_version(version, applied_at) VALUES (8, datetime('now'))");
  }

  return db;
}

/** 关闭连接（测试 cleanup 用）。 */
export function closeDb(db: DatabaseSync): void {
  db.close();
}
