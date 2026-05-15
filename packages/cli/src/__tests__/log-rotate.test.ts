import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { rotateIfTooLarge, DEFAULT_MAX_LOG_BYTES } from "../log-rotate.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "log-rotate-"));
});

afterEach(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe("rotateIfTooLarge", () => {
  it("no-op when file does not exist", () => {
    const p = path.join(tmpDir, "absent.log");
    expect(() => rotateIfTooLarge(p, 100)).not.toThrow();
    expect(fs.existsSync(p)).toBe(false);
    expect(fs.existsSync(`${p}.1`)).toBe(false);
  });

  it("no-op when file is below threshold", () => {
    const p = path.join(tmpDir, "small.log");
    fs.writeFileSync(p, "x".repeat(50), "utf-8");
    rotateIfTooLarge(p, 100);
    expect(fs.existsSync(p)).toBe(true);
    expect(fs.existsSync(`${p}.1`)).toBe(false);
    expect(fs.statSync(p).size).toBe(50);
  });

  it("rotates file at threshold to .1 and clears original", () => {
    const p = path.join(tmpDir, "big.log");
    fs.writeFileSync(p, "x".repeat(500), "utf-8");
    rotateIfTooLarge(p, 100);
    expect(fs.existsSync(p)).toBe(false);
    expect(fs.existsSync(`${p}.1`)).toBe(true);
    expect(fs.statSync(`${p}.1`).size).toBe(500);
  });

  it("overwrites prior .1 when rotating again", () => {
    const p = path.join(tmpDir, "big.log");
    fs.writeFileSync(`${p}.1`, "old archive content", "utf-8");
    fs.writeFileSync(p, "y".repeat(500), "utf-8");
    rotateIfTooLarge(p, 100);
    expect(fs.readFileSync(`${p}.1`, "utf-8")).toBe("y".repeat(500));
  });

  it("DEFAULT_MAX_LOG_BYTES is 256KB", () => {
    expect(DEFAULT_MAX_LOG_BYTES).toBe(256 * 1024);
  });

  it("does not throw when archive rename target is locked (best-effort)", () => {
    // Cannot easily simulate Windows file lock in a portable test, so instead
    // verify the function swallows errors when the archive path is a directory
    // (which makes renameSync fail with EPERM/EISDIR on most platforms).
    const p = path.join(tmpDir, "trapped.log");
    fs.writeFileSync(p, "z".repeat(500), "utf-8");
    fs.mkdirSync(`${p}.1`); // archive path is now a directory
    fs.writeFileSync(path.join(`${p}.1`, "child"), "blocker", "utf-8");
    expect(() => rotateIfTooLarge(p, 100)).not.toThrow();
    // Original may or may not have rotated depending on platform behavior;
    // the contract is "never throw".
  });
});
