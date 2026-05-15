/**
 * M4-A: Stop hook tail — narrative scanning.
 *
 * Runs after compile/harvest/scan-errors. Reads the latest assistant message
 * from the transcript, runs scanNarrative against ai-narrative rules, writes
 * pending warnings for the next UserPromptSubmit to inject, and emits
 * ai.output.bad_pattern / ai.narrative.recurred / ai.narrative.complied
 * events into the event log.
 *
 * Pure IO around a pure core. Testable via explicit deps.
 */
import fs from "node:fs";
import path from "node:path";
import {
  scanNarrative,
  formatPendingRecord,
  mergePending,
  type NarrativeHit,
  type PendingWarning,
} from "@teamagent/core";
import type { KnowledgeEntry, PersistedEvent } from "@teamagent/types";

export interface StopScanDeps {
  aiText: string;
  rules: KnowledgeEntry[];
  sessionId: string;
  turnIndex: number;
  now: string;
  pendingDir: string;
  emit: (event: PersistedEvent) => void;
  /**
   * Knowledge ids that UserPromptSubmit just injected into THIS turn
   * (read from {pendingDir}/{sessionId}_last_injected.json).
   * Used to classify this turn's outcome: recurred vs complied.
   */
  lastInjectedKnowledgeIds?: string[];
}

export function pendingFilePath(dir: string, sessionId: string): string {
  return path.join(dir, `${sessionId}_pending_warnings.json`);
}

export function lastInjectedFilePath(dir: string, sessionId: string): string {
  return path.join(dir, `${sessionId}_last_injected.json`);
}

export function readLastInjected(dir: string, sessionId: string): string[] {
  const file = lastInjectedFilePath(dir, sessionId);
  if (!fs.existsSync(file)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function runStopNarrativeScan(deps: StopScanDeps): NarrativeHit[] {
  const hits = scanNarrative(deps.aiText, deps.rules);
  const hitIds = new Set(hits.map((h) => h.knowledge_id));
  const injected = deps.lastInjectedKnowledgeIds ?? [];

  // Build a lookup from id → rule so we can check correct_pattern presence.
  const ruleById = new Map(deps.rules.map((r) => [r.id, r]));
  const aiLower = deps.aiText.toLowerCase();

  // Classify outcome of the previous turn's injected rules.
  for (const kid of injected) {
    if (hitIds.has(kid)) {
      deps.emit({
        id: `e-recur-${deps.sessionId}-${deps.turnIndex}-${kid}`,
        kind: "ai.narrative.recurred",
        knowledge_id: kid,
        session_id: deps.sessionId,
        turn_index: deps.turnIndex,
        timestamp: deps.now,
        schema_version: 1,
      });
    } else {
      deps.emit({
        id: `e-complied-${deps.sessionId}-${deps.turnIndex}-${kid}`,
        kind: "ai.narrative.complied",
        knowledge_id: kid,
        session_id: deps.sessionId,
        turn_index: deps.turnIndex,
        timestamp: deps.now,
        schema_version: 1,
      });
      // Wire validator.failure: rule was injected as a hint, AI avoided wrong_pattern
      // (complied), but didn't use the correct_pattern either — guidance not followed.
      const rule = ruleById.get(kid);
      const correctPat = rule?.correct_pattern?.trim();
      if (correctPat && !aiLower.includes(correctPat.toLowerCase())) {
        deps.emit({
          id: `e-valfail-${deps.sessionId}-${deps.turnIndex}-${kid}`,
          kind: "validator.failure",
          knowledge_id: kid,
          session_id: deps.sessionId,
          turn_index: deps.turnIndex,
          timestamp: deps.now,
          schema_version: 1,
        });
      }
    }
  }

  // Emit bad_pattern events for each hit. Write pending for next turn.
  if (hits.length === 0) return [];

  for (const h of hits) {
    deps.emit({
      id: `e-bad-${deps.sessionId}-${deps.turnIndex}-${h.knowledge_id}`,
      kind: "ai.output.bad_pattern",
      knowledge_id: h.knowledge_id,
      session_id: deps.sessionId,
      turn_index: deps.turnIndex,
      matched_snippet: h.matched_snippet,
      timestamp: deps.now,
      schema_version: 1,
    });
  }

  try {
    fs.mkdirSync(deps.pendingDir, { recursive: true });
    const file = pendingFilePath(deps.pendingDir, deps.sessionId);
    let existing: PendingWarning[] = [];
    if (fs.existsSync(file)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
        if (Array.isArray(parsed)) existing = parsed as PendingWarning[];
      } catch { /* treat as empty */ }
    }
    const incoming = hits.map((h) =>
      formatPendingRecord(h, {
        session_id: deps.sessionId,
        turn_index: deps.turnIndex,
        at: deps.now,
      }),
    );
    const merged = mergePending(existing, incoming);
    fs.writeFileSync(file, JSON.stringify(merged, null, 2));
  } catch {
    // pending write failure must not break Stop pipeline
  }

  return hits;
}
