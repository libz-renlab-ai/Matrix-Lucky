import type { Tier } from "@teamagent/ports";

export const TIER_ORDER: Exclude<Tier, "dormant">[] = [
  "experimental",
  "probation",
  "stable",
  "canonical",
  "enforced",
];

/** Confidence upper bounds — cross this value to enter next tier. */
export const CONFIDENCE_UPPER: Record<Exclude<Tier, "dormant">, number> = {
  experimental: 0.30,
  probation: 0.55,
  stable: 0.75,
  canonical: 0.90,
  enforced: 1.01, // never crossed
};

/** Map confidence to tier (lower bound inclusive). */
export function tierFromConfidence(conf: number): Exclude<Tier, "dormant"> {
  if (conf < 0.30) return "experimental";
  if (conf < 0.55) return "probation";
  if (conf < 0.75) return "stable";
  if (conf < 0.90) return "canonical";
  return "enforced";
}

/**
 * Death chain: given demerit + current tier, what's the max allowed tier?
 * demerit >= 5  → soft demote 1
 * demerit >= 15 → hard demote 2
 * demerit >= 50 → dormant  (raised from 30 — rules with high compliance but occasional
 *                            ignores should survive; 30 was too aggressive for canonical rules
 *                            where each ignore costs ~11 demerit)
 */
export function tierFromDemerit(demerit: number, currentTier: Tier): Tier {
  if (demerit >= 50) return "dormant";
  // Resurrection: dormant rule with demerit < 50 gets revived to experimental
  const activeTier: Exclude<Tier, "dormant"> =
    currentTier === "dormant" ? "experimental" : (currentTier as Exclude<Tier, "dormant">);

  const idx = TIER_ORDER.indexOf(activeTier);
  if (idx === -1) return currentTier;

  let demote = 0;
  if (demerit >= 15) demote = 2;
  else if (demerit >= 5) demote = 1;

  if (demote === 0) return "enforced"; // no death-chain constraint
  return TIER_ORDER[Math.max(0, idx - demote)] as Exclude<Tier, "dormant">;
}

/** Pessimist: take the lower of confidence-tier and demerit-tier. */
export function effectiveTier(confidence: number, demerit: number, currentTier: Tier): Tier {
  const byConf = tierFromConfidence(confidence);
  const byDemerit = tierFromDemerit(demerit, currentTier);

  if (byDemerit === "dormant") return "dormant";

  const confIdx = TIER_ORDER.indexOf(byConf);
  const demIdx = TIER_ORDER.indexOf(byDemerit as Exclude<Tier, "dormant">);
  return TIER_ORDER[Math.min(confIdx, demIdx)] as Exclude<Tier, "dormant">;
}
