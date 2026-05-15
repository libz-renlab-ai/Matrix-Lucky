/**
 * PostToolUse hook handler — pure core (FCIS: Functional Core, Imperative Shell).
 *
 * Companion sweep to commit 2 (`pre-tool-use-handler.ts`). Per ADR-0008, the
 * PostToolUse hook handler is pure logic and belongs in `packages/core/`,
 * not `packages/adapters/`. The original handler had two impurities that
 * have now been lifted out as injected deps:
 *
 *   1. `crypto.randomUUID()`            — id generation (used as fallback
 *      `tool_use_id` when input omits it)
 *   2. `new Date().toISOString()`        — current timestamp
 *
 * Per ADR-0008 these become injected `deps.idGen`, `deps.now` so the handler
 * is a pure function of `(deps) => (input) => result`. The adapter layer
 * (`packages/adapters/src/hook/claude-agent-sdk/post-tool-use-sdk.ts`) is a
 * thin wrapper that binds production deps and re-exports.
 *
 * Core MUST NOT import `node:fs`, `node:child_process`, or read `process.env`.
 */
import {
  detectIgnoredSignals,
  detectBlockedCircumventedSignals,
  type OverrideSignalEvent,
} from "../pipeline/override-signal.js";

/**
 * Minimal subset of `@anthropic-ai/claude-agent-sdk`'s `PostToolUseHookInput`
 * required by the handler. Defined in core so that core does not depend on
 * the SDK package. The adapter layer accepts the real SDK type and forwards.
 */
export interface PostToolUseInput {
  tool_use_id?: string;
  tool_name?: string;
  tool_input?: unknown;
  tool_response?: unknown;
}

export interface PostToolUseDeps {
  eventLog: {
    append(e: any): void;
    readLast(n: number): any[];
  };
  /**
   * Pure id generator. Production binds `() => crypto.randomUUID()` in the
   * adapter wrapper; tests inject a deterministic counter.
   */
  idGen: () => string;
  /**
   * Pure current-time provider, returns ISO-8601 string. Production binds
   * `() => new Date().toISOString()`; tests inject a fixed timestamp.
   */
  now: () => string;
}

export function createPostToolUseHandler(deps: PostToolUseDeps) {
  return async (input: PostToolUseInput): Promise<Record<string, never>> => {
    const tool_use_id = input.tool_use_id ?? deps.idGen();
    const { tool_response } = input;
    const now = deps.now();
    const success = inferToolSuccess(tool_response);

    // 找本 tool_use_id 对应的 Pre 事件
    const recent = deps.eventLog.readLast(50);
    const preEvents = recent.filter(
      (e: any) => e.tool_use_id === tool_use_id && e.kind.startsWith("hook-pre."),
    );

    for (const pre of preEvents) {
      if (!pre.knowledge_id) continue;
      deps.eventLog.append({
        id: `e-post-${tool_use_id}-${pre.knowledge_id}`,
        kind: "hook-post.result",
        knowledge_id: pre.knowledge_id,
        tool_use_id,
        timestamp: now,
        schema_version: 1,
        payload: { success, source_pre_kind: pre.kind },
      });
    }

    // M2.5: detect ignored signals
    const ignoredList = detectIgnoredSignals(tool_use_id, recent as OverrideSignalEvent[]);
    for (const ig of ignoredList) {
      deps.eventLog.append({
        id: `e-override-ignored-${tool_use_id}-${ig.knowledge_id}`,
        kind: "ai.override.ignored",
        knowledge_id: ig.knowledge_id,
        tool_use_id,
        timestamp: now,
        schema_version: 1,
      });
    }

    // M3: detect block-circumvention — only when tool succeeded
    const toolName = input.tool_name;
    if (success && toolName) {
      const circumList = detectBlockedCircumventedSignals(
        toolName,
        recent as OverrideSignalEvent[],
        new Date(now),
      );
      for (const c of circumList) {
        deps.eventLog.append({
          id: `e-override-circum-${tool_use_id}-${c.knowledge_id}`,
          kind: "ai.override.blocked_circumvented",
          knowledge_id: c.knowledge_id,
          tool_use_id,
          timestamp: now,
          schema_version: 1,
        });
      }
    }

    return {};
  };
}

export function inferToolSuccess(toolResponse: unknown): boolean {
  if (toolResponse === null || toolResponse === undefined) return true;
  if (typeof toolResponse !== "object") return true;
  const r = toolResponse as Record<string, unknown>;
  // B-057: use truthy check instead of === true to catch is_error="true" or is_error=1
  if (r.is_error && r.is_error !== false && r.is_error !== 0) return false;
  if (r.error) return false;
  if (typeof r.exit_code === "number" && r.exit_code !== 0) return false;
  return true;
}
