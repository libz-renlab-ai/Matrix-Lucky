import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../..");

// Paths to the two files under test
const translationsPath = path.join(
  repoRoot,
  "packages/core/src/duck-mode/translations.ts",
);
const postinstallPath = path.join(
  repoRoot,
  "packages/teamagent/postinstall.mjs",
);

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

interface ParsedEntry {
  term: string;
  aliases: string[];
}

/**
 * Parse term+aliases from packages/core/src/duck-mode/translations.ts.
 * Looks for `term: "..."` and `aliases: [...]` in each object literal block.
 */
function parseTranslationsTs(): ParsedEntry[] {
  const src = fs.readFileSync(translationsPath, "utf-8");
  const entries: ParsedEntry[] = [];

  // Split on object boundaries — each entry starts with `{` and ends with `}`
  // Strategy: find each `term: "..."` and optionally the following `aliases: [...]`
  const termRe = /term:\s*"([^"]+)"/g;
  let termMatch: RegExpExecArray | null;
  while ((termMatch = termRe.exec(src)) !== null) {
    const term = termMatch[1];
    if (term === undefined) continue;
    // Look for aliases array in the same object (within ~300 chars after the term)
    const sliceAfterTerm = src.slice(termMatch.index, termMatch.index + 400);
    const aliasesRe = /aliases:\s*\[([^\]]*)\]/;
    const aliasMatch = aliasesRe.exec(sliceAfterTerm);
    const aliases: string[] = [];
    if (aliasMatch) {
      // Extract individual strings from the array
      const inner = aliasMatch[1] ?? "";
      const strRe = /"([^"]+)"/g;
      let m: RegExpExecArray | null;
      while ((m = strRe.exec(inner)) !== null) {
        const v = m[1];
        if (v !== undefined) aliases.push(v);
      }
    }
    entries.push({ term, aliases });
  }
  return entries;
}

/**
 * Parse term+aliases from the POSTINSTALL_DUCK array literal in postinstall.mjs.
 */
function parsePostinstallDuck(): ParsedEntry[] {
  const src = fs.readFileSync(postinstallPath, "utf-8");
  // Find the POSTINSTALL_DUCK array
  const arrayMatch = /const POSTINSTALL_DUCK\s*=\s*\[([\s\S]*?)\];/.exec(src);
  if (!arrayMatch) {
    throw new Error("Could not find POSTINSTALL_DUCK array in postinstall.mjs");
  }
  const arrayBody = arrayMatch[1] ?? "";
  const entries: ParsedEntry[] = [];

  const termRe = /term:\s*"([^"]+)"/g;
  let termMatch: RegExpExecArray | null;
  while ((termMatch = termRe.exec(arrayBody)) !== null) {
    const term = termMatch[1];
    if (term === undefined) continue;
    const sliceAfterTerm = arrayBody.slice(termMatch.index, termMatch.index + 400);
    const aliasesRe = /aliases:\s*\[([^\]]*)\]/;
    const aliasMatch = aliasesRe.exec(sliceAfterTerm);
    const aliases: string[] = [];
    if (aliasMatch) {
      const inner = aliasMatch[1] ?? "";
      const strRe = /"([^"]+)"/g;
      let m: RegExpExecArray | null;
      while ((m = strRe.exec(inner)) !== null) {
        const v = m[1];
        if (v !== undefined) aliases.push(v);
      }
    }
    entries.push({ term, aliases });
  }
  return entries;
}

/**
 * Extract all string literals from banner stderr.write / stdout.write calls
 * in postinstall.mjs — these are the actual visible output strings.
 */
function parseBannerStrings(): string[] {
  const src = fs.readFileSync(postinstallPath, "utf-8");
  // Match string arguments to process.stderr.write and process.stdout.write
  // We gather template literals and regular strings used in duckify() calls
  const bannerStrings: string[] = [];

  // Find the banner stdout.write block (the big join("\n") array)
  const bannerBlockMatch = /process\.stdout\.write\(\s*duckify\(\s*\[([\s\S]*?)\]\.join/m.exec(src);
  const innerCapture = bannerBlockMatch?.[1];
  if (innerCapture !== undefined) {
    // Extract double-quoted string literals
    const strRe = /"([^"\\]*)"/g;
    let m: RegExpExecArray | null;
    while ((m = strRe.exec(innerCapture)) !== null) {
      const v = m[1];
      if (v !== undefined) bannerStrings.push(v);
    }
  }

  // Also grab direct duckify(...) stderr.write arguments (plain strings)
  const stderrRe = /process\.stderr\.write\(\s*duckify\(\s*`([^`]*)`/g;
  let m2: RegExpExecArray | null;
  while ((m2 = stderrRe.exec(src)) !== null) {
    const v = m2[1];
    if (v !== undefined) bannerStrings.push(v);
  }
  const stderrStrRe = /process\.stderr\.write\(\s*duckify\(\s*"([^"]*)"/g;
  let m3: RegExpExecArray | null;
  while ((m3 = stderrStrRe.exec(src)) !== null) {
    const v = m3[1];
    if (v !== undefined) bannerStrings.push(v);
  }
  // Multi-line duckify with string concatenation blocks
  const stderrConcatRe = /process\.stderr\.write\(\s*\n?\s*duckify\(\s*\n?([\s\S]*?)\),?\s*\)/g;
  let m4: RegExpExecArray | null;
  while ((m4 = stderrConcatRe.exec(src)) !== null) {
    const block = m4[1];
    if (block === undefined) continue;
    const strInnerRe = /"([^"\\]+)"/g;
    let m5: RegExpExecArray | null;
    while ((m5 = strInnerRe.exec(block)) !== null) {
      const v = m5[1];
      if (v !== undefined) bannerStrings.push(v);
    }
  }

  return bannerStrings;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("postinstall-duck-sync", () => {
  it("both files are readable", () => {
    expect(() => fs.readFileSync(translationsPath, "utf-8")).not.toThrow();
    expect(() => fs.readFileSync(postinstallPath, "utf-8")).not.toThrow();
  });

  it("every term/alias in POSTINSTALL_DUCK exists in the authoritative translations.ts", () => {
    const authoritative = parseTranslationsTs();
    const postinstall = parsePostinstallDuck();

    // Build a flat set of all terms+aliases from the authoritative source
    const authSet = new Set<string>();
    for (const e of authoritative) {
      authSet.add(e.term);
      for (const a of e.aliases) authSet.add(a);
    }

    const missing: string[] = [];
    for (const e of postinstall) {
      if (e.term !== "doctor" && !authSet.has(e.term)) {
        // "doctor" is a postinstall-only term not in translations.ts — intentional
        missing.push(`term: "${e.term}"`);
      }
      for (const a of e.aliases) {
        if (!authSet.has(a)) {
          // Allow SessionStart alias carried over from original; it's not in translations.ts
          // but it's a valid hook event name used in banner output.
          if (a !== "SessionStart") {
            missing.push(`alias "${a}" of term "${e.term}"`);
          }
        }
      }
    }

    if (missing.length > 0) {
      console.error(
        "POSTINSTALL_DUCK has entries not found in authoritative translations.ts:\n" +
          missing.map((s) => `  - ${s}`).join("\n"),
      );
    }
    expect(missing).toHaveLength(0);
  });

  it("every term/alias in authoritative translations.ts appears in POSTINSTALL_DUCK", () => {
    const authoritative = parseTranslationsTs();
    const postinstall = parsePostinstallDuck();

    // Build a flat set of all terms+aliases from postinstall
    const piSet = new Set<string>();
    for (const e of postinstall) {
      piSet.add(e.term);
      for (const a of e.aliases) piSet.add(a);
    }

    const missingFromPostinstall: string[] = [];
    for (const e of authoritative) {
      const allCands = [e.term, ...e.aliases];
      const anyPresent = allCands.some((c) => piSet.has(c));
      if (!anyPresent) {
        missingFromPostinstall.push(
          `"${e.term}" (aliases: [${e.aliases.map((a) => `"${a}"`).join(", ")}])`,
        );
      }
    }

    if (missingFromPostinstall.length > 0) {
      console.error(
        "Entries in authoritative translations.ts missing from POSTINSTALL_DUCK:\n" +
          missingFromPostinstall.map((s) => `  - ${s}`).join("\n"),
      );
    }
    expect(missingFromPostinstall).toHaveLength(0);
  });

  it("every term/alias in authoritative source that appears in banner strings is in POSTINSTALL_DUCK", () => {
    const authoritative = parseTranslationsTs();
    const postinstall = parsePostinstallDuck();
    const bannerStrings = parseBannerStrings();

    // Build set of all terms/aliases covered by POSTINSTALL_DUCK
    const piSet = new Set<string>();
    for (const e of postinstall) {
      piSet.add(e.term.toLowerCase());
      for (const a of e.aliases) piSet.add(a.toLowerCase());
    }

    const combinedBanner = bannerStrings.join("\n").toLowerCase();

    const missingFromBanner: string[] = [];
    for (const e of authoritative) {
      const allCands = [e.term, ...e.aliases];
      // Check whether any candidate from the authoritative entry appears in banner text
      const appearsInBanner = allCands.some((c) => combinedBanner.includes(c.toLowerCase()));
      if (!appearsInBanner) continue; // term doesn't appear in banner at all — OK to skip

      // Term appears in banner — must also be in POSTINSTALL_DUCK
      const coveredByDuck = allCands.some((c) => piSet.has(c.toLowerCase()));
      if (!coveredByDuck) {
        missingFromBanner.push(
          `"${e.term}" (aliases: [${e.aliases.map((a) => `"${a}"`).join(", ")}]) — appears in banner but missing from POSTINSTALL_DUCK`,
        );
      }
    }

    if (missingFromBanner.length > 0) {
      console.error(
        "Banner-visible terms not covered by POSTINSTALL_DUCK:\n" +
          missingFromBanner.map((s) => `  - ${s}`).join("\n"),
      );
    }
    expect(missingFromBanner).toHaveLength(0);
  });
});
