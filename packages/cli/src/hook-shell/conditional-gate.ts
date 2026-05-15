/**
 * TS conditional type that mechanically forbids `runAdvancedHook` callers
 * from passing an empty `escape: {}` (or omitting it entirely). At least
 * one of `detached` / `lock` / `pipelineTimeoutMs` / `manualResources`
 * must be present, otherwise the call site fails to compile and the
 * contributor is steered back to `runHook`.
 *
 * Mechanism: when the caller passes an object literal, TypeScript infers
 * a narrow type for `escape` whose `keyof` reflects exactly the keys the
 * caller wrote. An empty literal `{}` infers `keyof = never`, which the
 * conditional rejects. A literal with at least one key (e.g.
 * `{ pipelineTimeoutMs: 240000 }`) infers `keyof = "pipelineTimeoutMs"`,
 * which is non-empty and accepted.
 *
 * Known limitation: callers who pre-declare a typed variable
 * (`const opts: AdvancedHookOptions<I, O> = { ..., escape: {} }`) bypass
 * the gate because the variable's static type widens `escape` back to
 * the full optional `EscapeOptions`. The gate fires only at literal call
 * sites — which is the common path. Reviewers catch the rare typed-var
 * case in code review; the runtime check below also rejects an empty
 * `escape` defensively (see `assertEscapeNonEmpty`).
 *
 * See ADR-0008 for why the gate exists at all.
 */
import type { EscapeOptions } from "./types.js";

/**
 * `RequireAtLeastOneEscape<T>` — resolves to `T` when the inferred type
 * of `T["escape"]` has at least one key, else `never`.
 *
 * Implemented via conditional inference (`T extends { escape: infer E }`)
 * rather than a hard `T extends AdvancedHookOptions<...>` constraint so
 * that callers passing `AdvancedHookOptions<TInput, TOutput>` for narrow
 * generic instantiations don't trip on variance — `envelope: HookEnvelope<TOutput>`
 * is contravariant in `TOutput`, so a narrow generic isn't structurally
 * assignable to `AdvancedHookOptions<unknown, unknown>`. The conditional
 * form avoids the constraint entirely.
 *
 * Use as the parameter type on `runAdvancedHook`:
 *
 * ```typescript
 * function runAdvancedHook<I, O, T extends AdvancedHookOptions<I, O>>(
 *   opts: RequireAtLeastOneEscape<T>,
 * ): Promise<never>;
 * ```
 */
export type RequireAtLeastOneEscape<T> = T extends { escape: infer E }
  ? AtLeastOneKey<E> extends true
    ? T
    : never
  : never;

type AtLeastOneKey<T> = keyof T extends never ? false : true;

/**
 * Defensive runtime check matching the type-level gate. Called by
 * `runAdvancedHook` before opening any resources so callers who slip
 * through the type system (typed variable, `as any`, JS callers) still
 * get a clear failure mode instead of silently skipping the
 * detached/lock/timeout/manual machinery.
 *
 * Throws synchronously; the shell's top-level catch converts to a
 * stderr log line and exits 0.
 */
export function assertEscapeNonEmpty(escape: EscapeOptions | undefined): void {
  if (!escape || Object.keys(escape).length === 0) {
    throw new Error(
      "runAdvancedHook called with empty escape. " +
        "Provide at least one of: detached, lock, pipelineTimeoutMs, manualResources. " +
        "If your channel doesn't need any of these, use runHook instead.",
    );
  }
}
