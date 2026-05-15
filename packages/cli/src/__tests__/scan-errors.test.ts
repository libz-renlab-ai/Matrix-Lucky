import { describe, it, expect } from "vitest";
import { parseScanErrorsArgs } from "../commands/scan-errors.js";

describe("parseScanErrorsArgs", () => {
  it("defaults to efficient mode", () => {
    const opts = parseScanErrorsArgs([]);
    expect(opts.mode).toBe("efficient");
  });

  it("parses --mode=full", () => {
    const opts = parseScanErrorsArgs(["--mode=full"]);
    expect(opts.mode).toBe("full");
  });

  it("parses --mode full (space)", () => {
    const opts = parseScanErrorsArgs(["--mode", "full"]);
    expect(opts.mode).toBe("full");
  });

  it("parses --min-freq=1", () => {
    const opts = parseScanErrorsArgs(["--min-freq=1"]);
    expect(opts.minFreq).toBe(1);
  });

  it("parses --dry-run flag", () => {
    const opts = parseScanErrorsArgs(["--dry-run"]);
    expect(opts.dryRun).toBe(true);
  });

  it("parses --quiet flag", () => {
    const opts = parseScanErrorsArgs(["--quiet"]);
    expect(opts.quiet).toBe(true);
  });

  it("parses --since=24h", () => {
    const opts = parseScanErrorsArgs(["--since=24h"]);
    expect(opts.sinceRaw).toBe("24h");
  });
});
