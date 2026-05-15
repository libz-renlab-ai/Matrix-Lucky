/**
 * Thin adapter wrapper around `createPreToolUseHandler` from `@teamagent/core`.
 *
 * The pure handler lives in `packages/core/src/hook/pre-tool-use-handler.ts`
 * (FCIS: Functional Core, Imperative Shell — see ADR-0008). This module binds
 * production impurities — `crypto.randomUUID()`, `new Date().toISOString()`,
 * and a `process.env.TEAMAGENT_HOOK_ASCII_BOX` formatStyle switch reserved for
 * the AttributionEvent reshape (commits 4+) — and accepts the SDK-typed input
 * so existing callers don't change.
 */
import type { PreToolUseHookInput } from "@anthropic-ai/claude-agent-sdk";
import {
  createPreToolUseHandler as createPreToolUseHandlerCore,
  type PreToolUseDeps as CorePreToolUseDeps,
  type PreToolUseResult,
  type SemanticHit,
  type HookFormatStyle,
} from "@teamagent/core";

/**
 * Caller-facing deps. Excludes the three injectable purity points
 * (`idGen` / `now` / `formatStyle`) that the wrapper binds to production
 * impurities. Existing call sites in `bin-pre-tool-use.ts` /
 * `commands/e2e-evaluate.ts` keep their current shape — including the
 * `get ruleCount()` accessor pattern, which is preserved because the wrapper
 * forwards a *Proxy*-like object that defers property reads to the original
 * deps rather than spreading values at construction time.
 */
export type PreToolUseDeps = Omit<CorePreToolUseDeps, "idGen" | "now" | "formatStyle">;

export type { PreToolUseResult, SemanticHit };

export function createPreToolUseHandler(deps: PreToolUseDeps) {
  // Build the core deps object with descriptor-preserving property forwarding so
  // callers that pass `get ruleCount() { return lastRuleCount; }` continue to
  // receive late-bound reads (spread `{...deps}` would freeze the value at
  // construction time).
  const coreDeps = Object.create(deps as object) as CorePreToolUseDeps;
  Object.defineProperties(coreDeps, {
    idGen: { value: () => crypto.randomUUID(), enumerable: true },
    now: { value: () => new Date().toISOString(), enumerable: true },
    formatStyle: { value: resolveFormatStyle(), enumerable: true },
  });
  const handler = createPreToolUseHandlerCore(coreDeps);
  // Adapter accepts the real SDK type and forwards.
  return (input: PreToolUseHookInput) =>
    handler({
      tool_name: input.tool_name,
      tool_input: input.tool_input,
      tool_use_id: input.tool_use_id,
    });
}

/**
 * Resolve the user-facing format style from env. Default is `"humane"` —
 * the boxless `⚠️ TeamAgent ...` shape introduced by issue #86 (B-86) on
 * `main`. Callers can opt back into the legacy `+-- title -+` ASCII-box
 * look by setting `TEAMAGENT_HOOK_ASCII_BOX=1` (engineer dogfooders only).
 *
 * Default flip preserved through merge with `origin/main`: the upstream
 * format function is `env === "1" ? ascii-box : humane`, which makes
 * humane the user-facing default. Earlier commit (dc6510b) of this PR
 * had this inverted; aligned during merge resolution.
 */
function resolveFormatStyle(): HookFormatStyle {
  return process.env.TEAMAGENT_HOOK_ASCII_BOX === "1" ? "ascii-box" : "humane";
}
