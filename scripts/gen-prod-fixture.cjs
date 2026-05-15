#!/usr/bin/env node
// Generates a prod-conditions JSONL fixture by:
// 1. Taking all 8 labeled correction rows from labeled-fixture.jsonl
// 2. Taking a sampled set of real neutral prod messages from ~/.claude/projects/...
// 3. Writing combined prod-fixture.jsonl with expected_correction labels
// Usage: node scripts/gen-prod-fixture.js [OUTPUT_PATH]

const fs = require("fs");
const path = require("path");

const LABELED_FIXTURE = path.join(
  __dirname,
  "../docs/features/auto-capture/labeled-fixture.jsonl"
);
const SESSION_DIR = path.join(
  process.env.HOME,
  ".claude/projects/-Users-m1-projects-TeamBrain"
);
const OUTPUT = process.argv[2] || path.join(
  __dirname,
  "../docs/features/auto-capture/prod-fixture.jsonl"
);

// Step 1: Read labeled corrections from existing fixture
const labeledLines = fs.readFileSync(LABELED_FIXTURE, "utf8").split("\n").filter(Boolean);
const corrections = [];
const labeledNeutrals = [];
for (const line of labeledLines) {
  const row = JSON.parse(line);
  if (row.expected_correction) {
    corrections.push(row);
  } else {
    labeledNeutrals.push(row);
  }
}

// Step 2: Extract real neutral messages from prod sessions
// Skip system-injected content (stop hook feedback, laziness block markers, etc.)
const SKIP_PREFIXES = [
  "Stop hook feedback:",
  "<system",
  "[tool_result]",
  "[tool-result]",
  // Note: do NOT skip the string "laziness" itself as a prefix — we skip messages
  // that start with the XML tag opener for that block
];

function isSystemMessage(text) {
  for (const pfx of SKIP_PREFIXES) {
    if (text.startsWith(pfx)) return true;
  }
  // Skip if it looks like a tool result block
  if (text.startsWith("<") && text.includes("tool_result")) return true;
  return false;
}

const prodNeutrals = [];
let idx = 0;

if (fs.existsSync(SESSION_DIR)) {
  const files = fs.readdirSync(SESSION_DIR).filter((f) => f.endsWith(".jsonl"));
  for (const file of files) {
    const lines = fs
      .readFileSync(path.join(SESSION_DIR, file), "utf8")
      .split("\n")
      .filter(Boolean);
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (
          obj.type === "user" &&
          obj.message &&
          typeof obj.message.content === "string"
        ) {
          const text = obj.message.content.trim();
          if (!text || text.length < 10) continue;
          if (isSystemMessage(text)) continue;
          // Must be reasonably short to fit as transcript
          if (text.length > 500) continue;
          prodNeutrals.push({
            session_id: "prod-neu-" + (++idx).toString().padStart(4, "0"),
            transcript: "User: " + text.slice(0, 300),
            expected_correction: false,
            source: "prod",
          });
        }
      } catch (e) {
        // skip malformed
      }
    }
  }
}

// Step 3: Sample up to 30 prod neutrals for the fixture
// (We want enough to test false-positive rate without overwhelming)
const MAX_PROD_NEUTRALS = 30;
const sampledProdNeutrals = prodNeutrals.slice(0, MAX_PROD_NEUTRALS);

// Step 4: Combine: all 8 corrections + 12 labeled neutrals + sampled prod neutrals
const rows = [
  ...corrections,
  ...labeledNeutrals,
  ...sampledProdNeutrals,
];

// Write output
const content = rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
fs.writeFileSync(OUTPUT, content);

console.log(`Written ${rows.length} rows to ${OUTPUT}`);
console.log(`  corrections (labeled): ${corrections.length}`);
console.log(`  neutral (labeled): ${labeledNeutrals.length}`);
console.log(`  neutral (prod): ${sampledProdNeutrals.length}`);
