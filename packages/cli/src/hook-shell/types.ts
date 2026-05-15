/**
 * HookShell type definitions.
 *
 * Pure types — this file MUST NOT import `node:fs`, `node:child_process`, or
 * any IO module. It is consumed by both the imperative shell (`index.ts`) and
 * by hook handler factories living in `packages/core/` (post-commit-2 of the
 * fused PR; pre-commit-2 the handlers still live in adapters).
 *
 * See ADR-0008 for the design rationale and the two-layer split.
 */
import type { AttributionBus } from "@teamagent/ports";

/**
 * Hook channel identifier — one of the 8 Claude Code integration channels.
 *
 * Used as a tag on stderr fallback log lines and on attribution events so
 * downstream tooling can filter by channel.
 */
export type HookChannel =
  | "PreToolUse"
  | "PostToolUse"
  | "UserPromptSubmit"
  | "Stop"
  | "PreCompact"
  | "SessionStart"
  | "SessionEnd"
  | "Updater";

/** User-visible verbosity for system messages emitted by the handler. */
export type Visibility = "silent" | "smart" | "verbose";

/**
 * The three database file paths that every hook channel computes from
 * `cwd` + `home` and `mkdirSync`s before opening any DB. HookShell owns
 * this resolution so individual bin-*.ts files don't repeat it.
 */
export interface HookDbPaths {
  /** `<cwd>/.teamagent/knowledge.db` — project-scope DualLayerStore project leg. */
  projectDbPath: string;
  /** `<home>/.teamagent/global.db` — global-scope DualLayerStore global leg. */
  globalDbPath: string;
  /** `<home>/.teamagent/events.db` — SqliteEventLog persistence. */
  eventsDbPath: string;
}

/**
 * Minimal structural shape of a `DualLayerStore`, as far as HookShell cares.
 *
 * We intentionally avoid importing `@teamagent/adapters` here so the type
 * file is dep-free (and so future tests can pass mock stores without
 * touching real sqlite). The production binding to `DualLayerStore` from
 * `@teamagent/adapters` happens in `index.ts`.
 */
export interface HookKnowledgeStore {
  /** Release sqlite handles. Called by HookShell in the lifecycle teardown. */
  close(): void;
}

/**
 * Minimal structural shape of `SqliteEventLog` for the same reason as
 * `HookKnowledgeStore` above.
 */
export interface HookEventLog {
  close(): void;
}

/**
 * Default-layer hook context passed to a `runHook` handler.
 *
 * The handler receives an already-parsed input plus opened resources;
 * HookShell owns lifecycle. The handler returns the JSON value that will
 * be `JSON.stringify`'d to stdout.
 */
export interface DefaultHookContext<TInput> {
  /** Parsed stdin JSON, type-checked by `parseInput`. */
  readonly input: TInput;
  /** Resolved working directory (per `normalizeCwd` in production). */
  readonly cwd: string;
  /** `os.homedir()` snapshot. */
  readonly home: string;
  /** Read-only env snapshot — never `process.env` directly. */
  readonly env: Readonly<NodeJS.ProcessEnv>;
  /** Three resolved DB paths (already mkdir-p'd by the shell). */
  readonly paths: HookDbPaths;
  /** Opened DualLayerStore. Closed by the shell after `handler` returns. */
  readonly store: HookKnowledgeStore;
  /** Opened SqliteEventLog. Closed by the shell after `handler` returns. */
  readonly eventLog: HookEventLog;
  /** Attribution bus for emitting structured user-visible events. */
  readonly bus: AttributionBus;
  /** Effective visibility mode (parsed from env or caller-supplied). */
  readonly visibility: Visibility;
  /**
   * Mirror a single user-visible system-message line to stderr.
   *
   * Workaround for Claude Code 2.1.x systemMessage UI regression
   * (issue #50542). Honors `TEAMAGENT_HOOK_STDERR=0` to opt out.
   *
   * Hooks that emit `systemMessage` in their stdout envelope MAY also call
   * this so verbose-mode terminals show the same line. Plain
   * `process.stderr.write` from inside the handler is forbidden.
   */
  mirrorSystemMessage(text: string): void;
}

/**
 * Advanced-layer hook context.
 *
 * Differs from `DefaultHookContext` in three ways:
 *
 * 1. `store` and `eventLog` are lazy getters when `manualResources: true`
 *    is set on `escape`. Pipelines like bin-stop spawn detached children
 *    and would otherwise pay sqlite open cost for every invocation,
 *    including the trivial parent that just spawns and exits.
 * 2. `logError(step, err)` writes a structured line to
 *    `<TEAMAGENT_HOME>/.teamagent/<channel>-errors.log` for offline
 *    debugging of pipeline failures (parallel of bin-stop's `logError`).
 * 3. `clock` exposes `nowIso()` and `monotonicMs()` so handlers that
 *    measure pipeline duration can do so without grabbing `Date.now()`
 *    directly (FCIS rule for handlers that get moved to core later).
 */
export interface AdvancedHookContext<TInput>
  extends Omit<DefaultHookContext<TInput>, "store" | "eventLog"> {
  /**
   * Lazy DualLayerStore. The first call opens; subsequent calls reuse.
   * If never called and `manualResources: true`, no sqlite handle is
   * ever opened.
   */
  store(): HookKnowledgeStore;
  /** Lazy SqliteEventLog with the same semantics as `store`. */
  eventLog(): HookEventLog;
  /**
   * Append a `[ts] step=<step> err=<msg>` line to
   * `<TEAMAGENT_HOME ?? home>/.teamagent/<channel>-errors.log`.
   * Never throws; failed log writes are silently swallowed.
   */
  logError(step: string, err: unknown): void;
  /** Time helpers — kept on the context so handlers stay testable. */
  clock: {
    nowIso(): string;
    monotonicMs(): number;
  };
}

/**
 * stdout envelope shape. Some channels (PreToolUse) wrap the handler
 * return value in `{ hookSpecificOutput: { ... } }` per Claude Code
 * convention. The default is identity (handler return → JSON.stringify).
 */
export type HookEnvelope<TOutput> = (out: TOutput) => unknown;

/**
 * Default-layer options passed to `runHook`.
 *
 * Exactly the surface 7 of 8 channels need. Channels reaching for spawn
 * detached / lock file / pipeline timeout / lazy resources MUST use
 * `runAdvancedHook` instead — the TS conditional type in
 * `conditional-gate.ts` forbids them from sneaking in here.
 */
export interface HookOptions<TInput, TOutput> {
  /** One of the 8 channel names. Used in stderr fallback log prefix. */
  readonly channel: HookChannel;
  /**
   * Validate + narrow the parsed stdin JSON. Return `null` to fast-exit
   * with no further processing (e.g., empty stdin, missing required field).
   * Throwing is also acceptable; the shell catches and exits 0.
   */
  parseInput(raw: unknown): TInput | null;
  /** The channel-specific business function. Returns the stdout payload. */
  handler(ctx: DefaultHookContext<TInput>): Promise<TOutput | undefined> | TOutput | undefined;
  /** Optional stdout envelope wrapper. Default: identity. */
  envelope?: HookEnvelope<TOutput>;
}

/**
 * One of the four advanced-layer escape hatches. At least one must be
 * provided when calling `runAdvancedHook`; the conditional type in
 * `conditional-gate.ts` rejects an empty `escape` at compile time.
 */
export interface EscapeOptions {
  /** Detached self-spawn re-entry guard (bin-stop async mode). */
  detached?: DetachedSpec;
  /** Lock file written for the duration of the handler call. */
  lock?: LockSpec;
  /**
   * Pipeline hard timeout — `Promise.race(handler, setTimeout(timeout))`.
   * Hitting the timeout aborts the handler and exits 0; lock cleanup
   * still runs in `finally`.
   */
  pipelineTimeoutMs?: number;
  /**
   * Skip auto-open of `store` / `eventLog`. Handlers that may finish
   * without touching sqlite (e.g., bin-stop foreground that only spawns
   * a detached child and returns) opt in to lazy access via this flag.
   */
  manualResources?: boolean;
}

/**
 * Detached re-entry probe + tmp-file argv reader.
 *
 * Production wiring (bin-stop): `envFlag = "TEAMAGENT_STOP_PIPELINE"`;
 * the genuine child sets argv[2] to a tmp file path written by the
 * parent. The probe + reader are injectable so tests don't need real
 * env / filesystem.
 */
export interface DetachedSpec {
  /**
   * Returns true if the current invocation is a genuine detached
   * re-entry (env flag set + argv proves it). When true, HookShell
   * skips stdin and reads input via `readArgvInput` instead.
   */
  isDetachedInvocation(env: Readonly<NodeJS.ProcessEnv>, argv: readonly string[]): boolean;
  /**
   * Read the parsed input from argv (typically argv[2] points at a
   * tmp JSON file the parent wrote). Implementations are expected to
   * unlink the tmp file after read. Throwing falls back to
   * `parseInput(null)`.
   */
  readArgvInput(argv: readonly string[]): unknown;
}

/**
 * Lock file spec. The shell writes `<cwd>/<relativePath>` containing
 * `JSON.stringify(payload())` before invoking the handler, and
 * unconditionally removes it in a `finally` block (even on throw or
 * timeout). Failed writes / removes are silent — locks are best-effort.
 */
export interface LockSpec {
  /** Path relative to `cwd`, e.g. `.teamagent/.stop-running.lock`. */
  relativePath: string;
  /** Payload for the lock file body — typically `{ pid, started_at }`. */
  payload(): unknown;
}

/**
 * Advanced-layer options.
 *
 * Note: `escape` is `EscapeOptions` here; `conditional-gate.ts` narrows
 * it down to "must contain at least one key" at compile time via
 * `RequireAtLeastOneEscape`.
 */
export interface AdvancedHookOptions<TInput, TOutput> {
  readonly channel: HookChannel;
  parseInput(raw: unknown): TInput | null;
  handler(ctx: AdvancedHookContext<TInput>): Promise<TOutput | void> | TOutput | void;
  envelope?: HookEnvelope<TOutput>;
  /**
   * Escape hatches. At least one field is required; see
   * `RequireAtLeastOneEscape` in `conditional-gate.ts`.
   */
  escape: EscapeOptions;
}
