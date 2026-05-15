import type { Tier } from "@teamagent/ports";
import { TIER_ORDER } from "./tier.js";

const DAY_MS = 24 * 3600 * 1000;
const MIN_OBS_FOR_PROMOTION = 10;
const MIN_DAYS_FOR_DEMOTION = 7;
const MAX_DEMERIT_FOR_PROMOTION = 2.5;

export interface HysteresisInput {
  current_tier: Tier;
  candidate_tier: Tier;
  confidence: number;
  demerit: number;
  tier_entered_at: string; // ISO8601
  observation_count_in_current_tier: number;
  now: Date;
}

export interface HysteresisResult {
  final_tier: Tier;
  blocked_reason?: string;
}

function tierRank(t: Tier): number {
  if (t === "dormant") return -1;
  return TIER_ORDER.indexOf(t as Exclude<Tier, "dormant">);
}

/**
 * Decide actual tier. Per design §4.5.
 * Promotion: needs obs >= 10 AND demerit < 2.5
 * Demotion: needs >= 7 days since last transition, OR demerit >= 30 (death chain, immediate)
 * dormant candidate: always immediate
 */
export function applyHysteresis(input: HysteresisInput): HysteresisResult {
  const cur = input.current_tier;
  const cand = input.candidate_tier;

  if (cur === cand) return { final_tier: cur };

  // dormant is always immediate (death chain)
  if (cand === "dormant") return { final_tier: "dormant" };
  // resurrection from dormant is always immediate (demerit decayed below threshold)
  if (cur === "dormant") return { final_tier: cand };

  const curRank = tierRank(cur);
  const candRank = tierRank(cand);

  if (candRank > curRank) {
    // Promotion
    if (input.observation_count_in_current_tier < MIN_OBS_FOR_PROMOTION) {
      return {
        final_tier: cur,
        blocked_reason: `need >= ${MIN_OBS_FOR_PROMOTION} observations in current tier (have ${input.observation_count_in_current_tier})`,
      };
    }
    if (input.demerit >= MAX_DEMERIT_FOR_PROMOTION) {
      return {
        final_tier: cur,
        blocked_reason: `demerit ${input.demerit.toFixed(2)} >= promotion threshold ${MAX_DEMERIT_FOR_PROMOTION}`,
      };
    }
    return { final_tier: cand };
  }

  // Demotion (non-dormant)
  if (input.demerit >= 30) return { final_tier: cand }; // death chain bypass
  // B-048: empty tier_entered_at is falsy → was treated as epoch (20 000+ days ago),
  // bypassing the 7-day guard. Treat missing value as "just entered now" instead.
  const enteredMs = input.tier_entered_at
    ? new Date(input.tier_entered_at).getTime()
    : input.now.getTime();
  const daysSince = (input.now.getTime() - enteredMs) / DAY_MS;
  if (daysSince < MIN_DAYS_FOR_DEMOTION) {
    return {
      final_tier: cur,
      blocked_reason: `demotion requires >= 7 days in current tier (${daysSince.toFixed(1)} days so far)`,
    };
  }
  return { final_tier: cand };
}
