#!/usr/bin/env node
// Reads fixture text from stdin, writes redacted output to stdout
import { redactSensitiveText } from "../packages/core/src/pii/redactor.js";

const chunks: Buffer[] = [];
process.stdin.on("data", (chunk) => chunks.push(chunk));
process.stdin.on("end", () => {
  const input = Buffer.concat(chunks).toString("utf8");
  process.stdout.write(redactSensitiveText(input));
});
