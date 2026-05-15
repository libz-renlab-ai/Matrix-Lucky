/**
 * M4-A: UserPromptSubmit injection helper.
 *
 * Two roles:
 *  1) Drain {sessionsDir}/{sessionId}_pending_warnings.json → format a warning
 *     block that the harness prepends to the next AI turn's additionalContext.
 *     Also marks injected ids to {sessionId}_last_injected.json so the next
 *     Stop run can classify recurrence/compliance.
 *  2) Scan the incoming user prompt against channel=user-input rules and emit
 *     a short "ignore this noise" block.
 *
 * Pure functions — caller owns fs/db. Event emission done by caller.
 */
import fs from "node:fs";
import path from "node:path";
import {
  formatInjectionText,
  selectTopForInjection,
  scanNarrative,
  type PendingWarning,
  type NarrativeHit,
} from "@teamagent/core";
import { normalizeChannel, type KnowledgeEntry } from "@teamagent/types";

export interface BuildInjectionArgs {
  sessionsDir: string;
  sessionId: string;
  maxWarnings?: number;
}

export interface InjectionResult {
  text: string;
  injectedIds: string[];
}

function pendingFile(dir: string, sessionId: string): string {
  return path.join(dir, `${sessionId}_pending_warnings.json`);
}

function lastInjectedFile(dir: string, sessionId: string): string {
  return path.join(dir, `${sessionId}_last_injected.json`);
}

export function buildInjectionFromPending(args: BuildInjectionArgs): InjectionResult {
  const max = args.maxWarnings ?? 3;
  const file = pendingFile(args.sessionsDir, args.sessionId);
  if (!fs.existsSync(file)) return { text: "", injectedIds: [] };
  let pending: PendingWarning[] = [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (Array.isArray(parsed)) pending = parsed as PendingWarning[];
  } catch {
    pending = [];
  }
  if (pending.length === 0) return { text: "", injectedIds: [] };
  const top = selectTopForInjection(pending, max);
  const text = formatInjectionText(top);
  try {
    fs.writeFileSync(file, JSON.stringify([], null, 2));
  } catch {
    /* best-effort */
  }
  const ids = top.map((p) => p.knowledge_id);
  return { text, injectedIds: ids };
}

export function persistLastInjected(
  sessionsDir: string,
  sessionId: string,
  ids: string[],
): void {
  if (ids.length === 0) return;
  try {
    fs.mkdirSync(sessionsDir, { recursive: true });
    fs.writeFileSync(lastInjectedFile(sessionsDir, sessionId), JSON.stringify(ids));
  } catch {
    /* best-effort */
  }
}

/**
 * Scan the incoming user prompt text for channel=user-input rules.
 * Internally delegates to scanNarrative by re-tagging the input rules
 * (user-input channel is semantically identical to ai-narrative for
 * scan purposes — both do substring matching on a text blob).
 */
export function scanUserInput(
  userText: string,
  rules: KnowledgeEntry[],
): NarrativeHit[] {
  const retagged = rules
    .filter((r) => normalizeChannel((r as any).channel) === "user-input")
    .map((r) => ({ ...r, channel: "ai-narrative" })) as KnowledgeEntry[];
  return scanNarrative(userText, retagged);
}

export function formatUserInputFlag(hits: NarrativeHit[]): string {
  if (hits.length === 0) return "";
  const lines = [
    "◈ TeamAgent user-input flag",
    "The following tokens in the user prompt are automation noise — treat as noise, not intent:",
  ];
  for (const h of hits) {
    lines.push(`- "${h.matched_snippet.trim()}" (rule ${h.knowledge_id})`);
  }
  return lines.join("\n");
}
