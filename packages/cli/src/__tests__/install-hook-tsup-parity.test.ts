import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ALL_CHANNELS } from "../commands/install-hook.js";

/**
 * Issue #299: regression test — every `bundleFilename` declared by
 * `ALL_CHANNELS` (the install table) MUST appear as a key in the release
 * tarball's tsup `ENTRIES` dict. Otherwise the install pipeline registers
 * a hook whose .cjs file is never built, and `applyChannelOps`'s silent
 * skip swallows it without error.
 *
 * Test reads tsup.config.ts as source text and asserts presence; this avoids
 * evaluating the tsup config's onSuccess closures during vitest.
 */
describe("install-hook ↔ tsup ENTRIES parity (issue #299)", () => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const tsupConfigPath = path.resolve(
    __dirname,
    "../../../teamagent/tsup.config.ts",
  );

  it("tsup.config.ts exists at the expected relative path", () => {
    expect(fs.existsSync(tsupConfigPath)).toBe(true);
  });

  it("every bundleFilename in ALL_CHANNELS is declared as a key in tsup ENTRIES", () => {
    const src = fs.readFileSync(tsupConfigPath, "utf-8");
    const seen = new Set<string>();
    const missing: string[] = [];

    for (const def of ALL_CHANNELS) {
      const basename = def.bundleFilename.replace(/\.cjs$/, "");
      if (seen.has(basename)) continue;
      seen.add(basename);
      // ENTRIES dict literal: "<basename>": "../cli/src/<basename>.ts"
      const pattern = new RegExp(`"${escapeForRegex(basename)}"\\s*:\\s*"`);
      if (!pattern.test(src)) missing.push(def.bundleFilename);
    }

    expect(missing).toEqual([]);
  });

  it("every bundleFilename in ALL_CHANNELS is also wired into the second tsup block's entry list", () => {
    // The cjs block's `entry: { ... }` dict is what actually emits each .cjs
    // into dist/. Mere presence in ENTRIES is insufficient if the block's
    // entry list omits it. We assert each basename appears at least twice in
    // the source (once in ENTRIES, once in the cjs block referencing
    // ENTRIES["<basename>"] or repeating the literal mapping).
    const src = fs.readFileSync(tsupConfigPath, "utf-8");
    const missing: string[] = [];
    const seen = new Set<string>();

    for (const def of ALL_CHANNELS) {
      const basename = def.bundleFilename.replace(/\.cjs$/, "");
      if (seen.has(basename)) continue;
      seen.add(basename);
      const occurrences = countOccurrences(src, `"${basename}"`);
      // 1 occurrence = ENTRIES only, NOT wired into the cjs block.
      // ≥ 2 occurrences = wired into both ENTRIES and the cjs block.
      if (occurrences < 2) missing.push(def.bundleFilename);
    }

    expect(missing).toEqual([]);
  });
});

function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let idx = 0;
  while (true) {
    const next = haystack.indexOf(needle, idx);
    if (next === -1) break;
    count += 1;
    idx = next + needle.length;
  }
  return count;
}
