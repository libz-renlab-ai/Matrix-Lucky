import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { scanWorkdirSources } from "../workdir-scanner.js";

let wd: string;

beforeEach(() => {
  wd = mkdtempSync(path.join(tmpdir(), "bench-scan-"));
});

afterEach(() => {
  rmSync(wd, { recursive: true, force: true });
});

describe("scanWorkdirSources", () => {
  it("reads .ts files", async () => {
    writeFileSync(path.join(wd, "a.ts"), "import moment from 'moment';");
    const result = await scanWorkdirSources(wd);
    expect(result).toContain("import moment from 'moment'");
  });

  it("reads .tsx/.js/.jsx files", async () => {
    writeFileSync(path.join(wd, "a.tsx"), "const A = () => <div />;");
    writeFileSync(path.join(wd, "b.js"), "var b = 1;");
    writeFileSync(path.join(wd, "c.jsx"), "<span />");
    const result = await scanWorkdirSources(wd);
    expect(result).toContain("const A");
    expect(result).toContain("var b = 1");
    expect(result).toContain("<span");
  });

  it("recurses into subdirs", async () => {
    mkdirSync(path.join(wd, "sub"), { recursive: true });
    writeFileSync(path.join(wd, "sub", "nested.ts"), "const NESTED = 1;");
    const result = await scanWorkdirSources(wd);
    expect(result).toContain("const NESTED");
  });

  it("skips .teamagent and .claude dirs", async () => {
    mkdirSync(path.join(wd, ".teamagent"), { recursive: true });
    mkdirSync(path.join(wd, ".claude"), { recursive: true });
    writeFileSync(path.join(wd, ".teamagent", "bad.ts"), "HIDDEN_TA");
    writeFileSync(path.join(wd, ".claude", "bad.ts"), "HIDDEN_CC");
    writeFileSync(path.join(wd, "ok.ts"), "VISIBLE");
    const result = await scanWorkdirSources(wd);
    expect(result).toContain("VISIBLE");
    expect(result).not.toContain("HIDDEN_TA");
    expect(result).not.toContain("HIDDEN_CC");
  });

  it("skips node_modules", async () => {
    mkdirSync(path.join(wd, "node_modules", "foo"), { recursive: true });
    writeFileSync(path.join(wd, "node_modules", "foo", "skip.ts"), "SHOULD_SKIP");
    writeFileSync(path.join(wd, "ok.ts"), "KEEP_THIS");
    const result = await scanWorkdirSources(wd);
    expect(result).toContain("KEEP_THIS");
    expect(result).not.toContain("SHOULD_SKIP");
  });

  it("skips non-source files", async () => {
    writeFileSync(path.join(wd, "readme.md"), "SHOULD_SKIP_MD");
    writeFileSync(path.join(wd, "data.json"), '{"SHOULD_SKIP_JSON": true}');
    writeFileSync(path.join(wd, "a.ts"), "KEEP_TS");
    const result = await scanWorkdirSources(wd);
    expect(result).toContain("KEEP_TS");
    expect(result).not.toContain("SHOULD_SKIP_MD");
    expect(result).not.toContain("SHOULD_SKIP_JSON");
  });

  it("returns empty string on empty workdir", async () => {
    const result = await scanWorkdirSources(wd);
    expect(result).toBe("");
  });

  it("returns empty string on nonexistent workdir without throwing", async () => {
    const result = await scanWorkdirSources(path.join(wd, "does-not-exist"));
    expect(result).toBe("");
  });
});
