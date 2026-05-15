/**
 * Recall harness: 20 hand-labeled sessions → measure base recall, then verify
 * that the fix lifts it to >= 50%.
 *
 * Run: pnpm vitest run packages/core/src/correction-detector/__tests__/recall-harness.test.ts
 */
import { describe, it, expect } from "vitest";
import { ruleBasedCorrectionDetector } from "../rule-based.js";
import { parseSessionFile } from "../../session-parser/index.js";

function session(id: string, turns: Array<{ user: string; assistant?: string; toolCalls?: Array<{ id: string; name: string; input: Record<string, unknown>; result?: string; succeeded?: boolean }> }>): string {
  const lines: string[] = [];
  let prev = "null";
  for (let i = 0; i < turns.length; i++) {
    const t = turns[i]!;
    const uuid = `u${id}-${i}`;
    const auuid = `a${id}-${i}`;
    const ts = `2026-01-01T00:00:${String(i).padStart(2, "0")}Z`;

    if (t.user) {
      lines.push(JSON.stringify({
        type: "user", uuid, parentUuid: prev, timestamp: ts, sessionId: id,
        message: { role: "user", content: t.user },
      }));
      prev = uuid;
    }

    if (t.assistant !== undefined || (t.toolCalls && t.toolCalls.length > 0)) {
      const content: unknown[] = [];
      if (t.assistant) content.push({ type: "text", text: t.assistant });
      for (const tc of (t.toolCalls ?? [])) {
        content.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.input });
      }
      lines.push(JSON.stringify({
        type: "assistant", uuid: auuid, parentUuid: uuid, timestamp: ts, sessionId: id,
        message: { role: "assistant", content },
      }));
      // Attach tool results as a user message
      for (const tc of (t.toolCalls ?? [])) {
        if (tc.result !== undefined) {
          lines.push(JSON.stringify({
            type: "user", uuid: `tr-${tc.id}`, parentUuid: auuid, timestamp: ts, sessionId: id,
            message: { role: "user", content: [{ type: "tool_result", tool_use_id: tc.id, content: tc.result }] },
          }));
        }
      }
      prev = auuid;
    }
  }
  return lines.join("\n");
}

const LABELED_SESSIONS: Array<{ id: string; label: string; hasCorrection: boolean; jsonl: string }> = [
  // TRUE CORRECTIONS — detector should fire
  {
    id: "F01", hasCorrection: true, label: "explicit_denial zh - 不对",
    jsonl: session("F01", [
      { user: "帮我用 axios 写接口", assistant: "好，我用 axios 实现", toolCalls: [{ id: "t0", name: "Write", input: { file_path: "api.ts", content: "import axios" } }] },
      { user: "不对，我们用 fetch 不用 axios" },
    ]),
  },
  {
    id: "F02", hasCorrection: true, label: "explicit_denial en - wrong approach",
    jsonl: session("F02", [
      { user: "build auth module", assistant: "I'll use JWT", toolCalls: [{ id: "t0", name: "Write", input: { file_path: "auth.ts", content: "import jwt" } }] },
      { user: "wrong approach, we use session-based auth not JWT" },
    ]),
  },
  {
    id: "F03", hasCorrection: true, label: "tool failure + user says to switch",
    jsonl: session("F03", [
      { user: "install packages", assistant: "installing", toolCalls: [{ id: "t0", name: "Bash", input: { command: "npm install moment" }, result: "npm ERR! 404 Not Found", succeeded: false }] },
      { user: "用 dayjs 不用 moment" },
    ]),
  },
  {
    id: "F04", hasCorrection: true, label: "suggestion_override zh - 改用 zustand",
    jsonl: session("F04", [
      { user: "state management", assistant: "我推荐 Redux，install redux 依赖" },
      { user: "用 zustand 更好，轻量" },
    ]),
  },
  {
    id: "F05", hasCorrection: true, label: "error in context after tool call",
    jsonl: session("F05", [
      { user: "run build", assistant: "building", toolCalls: [{ id: "t0", name: "Bash", input: { command: "npm run build" }, result: "ok" }] },
      { user: "Error: Cannot find module './utils'\n  at webpack (build.js:42)" },
    ]),
  },
  {
    id: "F06", hasCorrection: true, label: "code_edit - user says 我改了",
    jsonl: session("F06", [
      { user: "write helper", assistant: "done", toolCalls: [{ id: "t0", name: "Edit", input: { file_path: "utils.ts", old_string: "x", new_string: "export const y = (n: number) => n * 2;" } }] },
      { user: "我改了，看看对不对" },
    ]),
  },
  {
    id: "F07", hasCorrection: true, label: "explicit denial - shouldn't en",
    jsonl: session("F07", [
      { user: "deploy", assistant: "pushing to prod" },
      { user: "you shouldn't push directly to main, use a PR" },
    ]),
  },
  {
    id: "F08", hasCorrection: true, label: "重来",
    jsonl: session("F08", [
      { user: "重构这段代码", assistant: "我直接改" },
      { user: "重来，先写测试" },
    ]),
  },
  {
    id: "F09", hasCorrection: true, label: "tool failure with silent user turn after",
    jsonl: session("F09", [
      {
        user: "test", assistant: "running",
        toolCalls: [{ id: "t0", name: "Bash", input: { command: "jest" }, result: "FAILED: TypeError: undefined is not a function", succeeded: false }],
      },
      { user: "" },  // user silent — AI auto-continues
    ]),
  },
  {
    id: "F10", hasCorrection: true, label: "instead of phrasing en",
    jsonl: session("F10", [
      { user: "add date formatting", assistant: "install moment for dates" },
      { user: "use dayjs instead of moment" },
    ]),
  },
  {
    id: "F11", hasCorrection: true, label: "actually use - implicit correction without keyword",
    jsonl: session("F11", [
      { user: "how to handle async?", assistant: "Use callbacks here" },
      { user: "actually just use async/await, that's the team standard" },
    ]),
  },
  {
    id: "F12", hasCorrection: true, label: "let's use X instead of Y",
    jsonl: session("F12", [
      { user: "add testing", assistant: "I'll set up Jest with mocha style" },
      { user: "let's use vitest instead, not jest" },
    ]),
  },
  // FALSE NEGATIVES in current detector (should correct but keyword-silent)
  {
    id: "F13", hasCorrection: true, label: "implicit preference - team uses X pattern (no denial keyword)",
    jsonl: session("F13", [
      { user: "add logging", assistant: "I'll use console.log everywhere" },
      { user: "we actually use pino for structured logging in this project" },
    ]),
  },
  {
    id: "F14", hasCorrection: true, label: "redirect without keyword - try X approach",
    jsonl: session("F14", [
      { user: "implement cache", assistant: "I'll use localStorage for caching" },
      { user: "try using Redis instead, that's what the backend expects" },
    ]),
  },
  // NO CORRECTIONS — production noise patterns — detector should NOT fire
  {
    id: "P01", hasCorrection: false, label: "bash-stdout with denial keywords in CSV data",
    jsonl: session("P01", [
      { user: "run the analysis", assistant: "running" },
      // bash-stdout output containing Chinese denial words from CSV content
      { user: "<bash-stdout>```csv\n\"不对\",\"错了\"\n\"不要\",\"重来\"\n```</bash-stdout>" },
    ]),
  },
  {
    id: "P02", hasCorrection: false, label: "teammate-message with correction-like text",
    jsonl: session("P02", [
      { user: "start agent", assistant: "spawning" },
      // teammate-message injection (not a human correction)
      { user: "<teammate-message teammate_id=\"verifier\" summary=\"wrong\">wrong approach not what I wanted</teammate-message>" },
    ]),
  },
  {
    id: "P03", hasCorrection: false, label: "bash-input with instructions",
    jsonl: session("P03", [
      { user: "run check", assistant: "ok" },
      // bash-input injection — user ran a command but didn't correct the AI
      { user: "<bash-input>claudefast -p 'do not use axios, never skip tests'</bash-input>" },
    ]),
  },
  {
    id: "P04", hasCorrection: false, label: "stop hook feedback message",
    jsonl: session("P04", [
      { user: "task done", assistant: "completed" },
      // stop hook feedback injected as user message — not a user correction
      { user: "Stop hook feedback:\nYour last message is missing a self-report block (not what I asked for)" },
    ]),
  },
  {
    id: "N01", hasCorrection: false, label: "pure info query",
    jsonl: session("N01", [
      { user: "how does React work?", assistant: "React is a UI library" },
    ]),
  },
  {
    id: "N02", hasCorrection: false, label: "positive feedback",
    jsonl: session("N02", [
      { user: "implement auth", assistant: "implemented JWT" },
      { user: "perfect, that's exactly what I wanted" },
    ]),
  },
  {
    id: "N03", hasCorrection: false, label: "polite question 能…吗",
    jsonl: session("N03", [
      { user: "write function", assistant: "done" },
      { user: "能不要在函数里用 var 吗？" },
    ]),
  },
  {
    id: "N04", hasCorrection: false, label: "system-reminder noise",
    jsonl: session("N04", [
      { user: "help me", assistant: "ok" },
      { user: "<system-reminder>Do not use moment, don't use axios, never push to main</system-reminder>" },
    ]),
  },
  {
    id: "N05", hasCorrection: false, label: "follow-up clarification",
    jsonl: session("N05", [
      { user: "explain types", assistant: "TypeScript has string, number, boolean..." },
      { user: "can you show an example?" },
    ]),
  },
  {
    id: "N06", hasCorrection: false, label: "sequential task steps no correction",
    jsonl: session("N06", [
      { user: "add a button", assistant: "done" },
      { user: "now style it blue" },
      { user: "great" },
    ]),
  },
];

describe("recall harness — 20 hand-labeled sessions", () => {
  it("achieves >= 50% recall on labeled correction sessions", () => {
    let tp = 0, fn = 0, fp = 0, tn = 0;
    const misses: string[] = [];
    const falsePositives: string[] = [];

    for (const f of LABELED_SESSIONS) {
      const parsed = parseSessionFile(f.jsonl);
      const corrections = ruleBasedCorrectionDetector.detect(parsed);
      const detected = corrections.length > 0;

      if (f.hasCorrection && detected) tp++;
      else if (f.hasCorrection && !detected) { fn++; misses.push(`${f.id}: ${f.label}`); }
      else if (!f.hasCorrection && detected) { fp++; falsePositives.push(`${f.id}: ${f.label}`); }
      else tn++;
    }

    const total = LABELED_SESSIONS.length;
    const correctionCount = LABELED_SESSIONS.filter(s => s.hasCorrection).length;
    const recall = tp / correctionCount;

    // eslint-disable-next-line no-console
    console.log(`\n=== RECALL HARNESS RESULTS ===`);
    // eslint-disable-next-line no-console
    console.log(`Total sessions: ${total} (${correctionCount} labeled corrections)`);
    // eslint-disable-next-line no-console
    console.log(`TP=${tp} FN=${fn} FP=${fp} TN=${tn}`);
    // eslint-disable-next-line no-console
    console.log(`Recall: ${(recall * 100).toFixed(0)}% (${tp}/${correctionCount})`);
    if (misses.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`Missed:\n  ${misses.join("\n  ")}`);
    }
    if (falsePositives.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`False positives:\n  ${falsePositives.join("\n  ")}`);
    }

    expect(recall).toBeGreaterThanOrEqual(0.5);
  });
});
