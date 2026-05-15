import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cleanupDbBackups } from "../db-backup-cleanup.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "db-backup-cleanup-"));
});

afterEach(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

function touch(name: string, mtimeOffsetMs = 0): void {
  const full = path.join(tmpDir, name);
  fs.writeFileSync(full, "stub");
  if (mtimeOffsetMs !== 0) {
    const t = Date.now() + mtimeOffsetMs;
    fs.utimesSync(full, t / 1000, t / 1000);
  }
}

describe("cleanupDbBackups", () => {
  it("no-op when directory does not exist", () => {
    expect(() => cleanupDbBackups(path.join(tmpDir, "absent"))).not.toThrow();
  });

  it("no-op when no .before- files present", () => {
    touch("knowledge.db");
    touch("events.db");
    cleanupDbBackups(tmpDir);
    expect(fs.readdirSync(tmpDir).sort()).toEqual(["events.db", "knowledge.db"]);
  });

  it("keeps only the most recent backup by default", () => {
    touch("a.db.before-x-1", -3000);
    touch("a.db.before-x-2", -2000);
    touch("a.db.before-x-3", -1000); // newest
    cleanupDbBackups(tmpDir);
    expect(fs.readdirSync(tmpDir)).toEqual(["a.db.before-x-3"]);
  });

  it("keeps N most recent when keep>1", () => {
    touch("k.db.before-1", -4000);
    touch("k.db.before-2", -3000);
    touch("k.db.before-3", -2000);
    touch("k.db.before-4", -1000);
    cleanupDbBackups(tmpDir, 2);
    expect(fs.readdirSync(tmpDir).sort()).toEqual([
      "k.db.before-3",
      "k.db.before-4",
    ]);
  });

  it("does not touch files without .before- in name", () => {
    touch("knowledge.db");
    touch("settings.local.json.bak.123"); // .bak, not .before-
    touch("a.db.before-x-old", -3000);
    touch("a.db.before-x-new", -1000);
    cleanupDbBackups(tmpDir);
    const remaining = fs.readdirSync(tmpDir).sort();
    expect(remaining).toContain("knowledge.db");
    expect(remaining).toContain("settings.local.json.bak.123");
    expect(remaining).toContain("a.db.before-x-new");
    expect(remaining).not.toContain("a.db.before-x-old");
  });

  it("never throws when readdir fails (e.g. dir is a file)", () => {
    const filePath = path.join(tmpDir, "actually-a-file");
    fs.writeFileSync(filePath, "x");
    expect(() => cleanupDbBackups(filePath)).not.toThrow();
  });

  it("never throws when an entry is unreadable", () => {
    // Cannot reliably make an unreadable file on Windows in a unit test;
    // verify the looser contract: extra non-file entries do not cause
    // throws. Subdirectories should be skipped silently.
    fs.mkdirSync(path.join(tmpDir, "subdir.before-"));
    touch("real.db.before-1", -1000);
    expect(() => cleanupDbBackups(tmpDir)).not.toThrow();
    expect(fs.existsSync(path.join(tmpDir, "subdir.before-"))).toBe(true);
  });
});
