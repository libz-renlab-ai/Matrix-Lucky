#!/usr/bin/env node
/**
 * Seed isolated SQLite databases for the statusline live demo.
 *
 * Usage:
 *   node teamagent-statusline-demo-seed.cjs <db-path> <kind> <rows-json>
 *
 * Where:
 *   kind = "knowledge" | "events"
 *   rows-json = JSON array of rows with shape:
 *     knowledge: { status, type?, created_at }
 *     events:    { kind, timestamp }
 *
 * Used by `teamagent-statusline-demo.sh` to seed sandbox DBs without
 * touching the user's real ~/.teamagent. Standalone CJS so it works
 * with the same `node:sqlite` builtin that the production statusline
 * relies on.
 */
"use strict";

const { DatabaseSync } = require("node:sqlite");
const fs = require("node:fs");
const path = require("node:path");

function die(msg) {
  process.stderr.write(`teamagent-statusline-demo-seed: ${msg}\n`);
  process.exit(1);
}

const [, , dbPath, kind, rowsJson] = process.argv;
if (!dbPath || !kind || !rowsJson) {
  die("usage: <db-path> <knowledge|events> <rows-json>");
}

let rows;
try {
  rows = JSON.parse(rowsJson);
  if (!Array.isArray(rows)) throw new Error("rows must be a JSON array");
} catch (err) {
  die(`bad rows-json: ${err.message}`);
}

fs.mkdirSync(path.dirname(dbPath), { recursive: true });
fs.rmSync(dbPath, { force: true });

const db = new DatabaseSync(dbPath);
try {
  if (kind === "knowledge") {
    db.exec(`CREATE TABLE knowledge (
      status TEXT,
      type TEXT,
      created_at TEXT
    );`);
    const ins = db.prepare(
      "INSERT INTO knowledge (status, type, created_at) VALUES (?, ?, ?)",
    );
    for (const r of rows) {
      ins.run(r.status, r.type ?? null, r.created_at);
    }
  } else if (kind === "events") {
    db.exec(`CREATE TABLE events (
      kind TEXT,
      timestamp TEXT
    );`);
    const ins = db.prepare("INSERT INTO events (kind, timestamp) VALUES (?, ?)");
    for (const r of rows) {
      ins.run(r.kind, r.timestamp);
    }
  } else {
    die(`unknown kind: ${kind}`);
  }
} finally {
  db.close();
}

process.stdout.write(`seeded ${kind}(${rows.length} rows) -> ${dbPath}\n`);
