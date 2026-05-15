import type { KnowledgeEntry, PersistedEvent } from "@teamagent/types";

/** v2 observation entry (maps to observations table). */
export interface Observation {
  id: string;
  knowledge_id: string;
  timestamp: string;     // ISO8601
  outcome: "success" | "failure";
  source_event?: string;
  tool_use_id?: string;
}

/** v2 5-tier mapping. */
export type Tier =
  | "experimental"
  | "probation"
  | "stable"
  | "canonical"
  | "enforced"
  | "dormant";

/** v2 Calibrator input. events used only for demerit triggers (ai.override.ignored / user_reject). */
export interface CalibratorV2Input {
  events: PersistedEvent[];
  observations: Observation[];
  now: Date;
}

/** v2 Tier transition. */
export interface TierTransition {
  from: Tier;
  to: Tier;
  reason: string;
}

/** v2 Delta breakdown step. */
export interface DeltaStep {
  type:
    | "obs_added"
    | "obs_decayed"
    | "demerit_added"
    | "demerit_decay"
    | "tier_transition";
  outcome?: "success" | "failure";
  weight?: number;
  conf_delta?: number;
  demerit_delta?: number;
  days_since?: number;
  note?: string;
}

/** v2 calibration result. */
export interface CalibrationResultV2 {
  confidence: number;                  // Wilson LB, clamped [0,1]
  demerit: number;                     // >= 0
  tier_before: Tier;
  tier_after: Tier;
  status: KnowledgeEntry["status"];
  confidence_delta: number;
  demerit_delta: number;
  delta_breakdown: DeltaStep[];
  tier_transition: TierTransition | null;
  reason_for_no_transition?: string;
}

/** v2 Calibrator interface. Pure function. */
export interface CalibratorV2 {
  calibrate(entry: KnowledgeEntry, input: CalibratorV2Input): CalibrationResultV2;
}
