/**
 * Thin adapter wrapper around `createPostToolUseHandler` from `@teamagent/core`.
 *
 * The pure handler lives in `packages/core/src/hook/post-tool-use-handler.ts`
 * (FCIS: Functional Core, Imperative Shell — see ADR-0008 and the matching
 * sweep for `pre-tool-use-handler.ts` in commit 2). This module binds
 * production impurities — `crypto.randomUUID()` and `new Date().toISOString()`
 * — and accepts the SDK-typed input so existing callers don't change.
 */
import type { PostToolUseHookInput } from "@anthropic-ai/claude-agent-sdk";
import {
  createPostToolUseHandler as createPostToolUseHandlerCore,
  inferToolSuccess as inferToolSuccessCore,
  type PostToolUseDeps as CorePostToolUseDeps,
} from "@teamagent/core";

/**
 * Caller-facing deps. Excludes the two injectable purity points
 * (`idGen` / `now`) that the wrapper binds to production impurities. Existing
 * call sites in `bin-post-tool-use.ts` keep their current shape.
 */
export type PostToolUseDeps = Omit<CorePostToolUseDeps, "idGen" | "now">;

export function createPostToolUseHandler(deps: PostToolUseDeps) {
  // Build the core deps object with descriptor-preserving property forwarding
  // (mirrors the Object.create() pattern used in pre-tool-use-sdk so any
  // future caller-side getters keep their late-bound semantics — spread
  // `{...deps}` would freeze accessor-derived values at construction time).
  const coreDeps = Object.create(deps as object) as CorePostToolUseDeps;
  Object.defineProperties(coreDeps, {
    idGen: { value: () => crypto.randomUUID(), enumerable: true },
    now: { value: () => new Date().toISOString(), enumerable: true },
  });
  const handler = createPostToolUseHandlerCore(coreDeps);
  // Adapter accepts the real SDK type and forwards.
  return (input: PostToolUseHookInput) =>
    handler({
      tool_use_id: input.tool_use_id,
      tool_name: (input as { tool_name?: string }).tool_name,
      tool_input: input.tool_input,
      tool_response: input.tool_response,
    });
}

/**
 * Re-export `inferToolSuccess` from core so backward-compatible callers in
 * the adapter test (and any external users that import it from the adapter
 * subpath) keep working without import path churn.
 */
export const inferToolSuccess = inferToolSuccessCore;
