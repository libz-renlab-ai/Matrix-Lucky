import type { Observation, Tier } from "@teamagent/ports";

/** Half-life in days per max_tier_ever (excluding dormant). Per design §4.2. */
export const HALF_LIFE_DAYS: Record<Exclude<Tier, "dormant">, number> = {
  experimental: 30,
  probation: 45,
  stable: 60,
  canonical: 75,
  enforced: 90,
};

const DAY_MS = 24 * 3600 * 1000;
const Z = 1.96; // 95% confidence interval

/**
 * Wilson Score Lower Bound with exponential time-decay weighting.
 * Per design doc §4.2.
 *
 * @param observations All observations for this rule
 * @param maxTierEver Selects the half-life for decay (historical max, not dormant)
 * @param now Current time (injected for testability)
 * @returns confidence ∈ [0, 1]; returns 0 if no observations
 */
export function computeConfidence(
  observations: Observation[],
  maxTierEver: Tier,
  now: Date,
): number {
  if (observations.length === 0) return 0;

  const tier: Exclude<Tier, "dormant"> =
    maxTierEver === "dormant" ? "experimental" : (maxTierEver as Exclude<Tier, "dormant">);
  const halfLife = HALF_LIFE_DAYS[tier];
  const lambda = Math.LN2 / halfLife;

  let weightedSuccess = 0;
  let weightedFailure = 0;

  for (const o of observations) {
    const tsMs = new Date(o.timestamp).getTime();
    // B-059: skip observations with invalid timestamps to prevent NaN propagation
    if (!Number.isFinite(tsMs)) continue;
    const daysAgo = (now.getTime() - tsMs) / DAY_MS;
    const w = Math.exp(-lambda * Math.max(0, daysAgo));
    if (o.outcome === "success") weightedSuccess += w;
    else weightedFailure += w;
  }

  const n = weightedSuccess + weightedFailure;
  if (n === 0) return 0;

  const p = weightedSuccess / n;
  const wilson =
    (p + (Z * Z) / (2 * n) -
      Z * Math.sqrt((p * (1 - p)) / n + (Z * Z) / (4 * n * n))) /
    (1 + (Z * Z) / n);

  return Math.max(0, Math.min(1, wilson));
}
