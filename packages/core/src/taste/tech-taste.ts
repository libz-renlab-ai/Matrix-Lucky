/**
 * Tech-taste scorer: rank technology choices for a given context.
 * Pure function — no IO, no side-effects.
 */

export type TechChoice = {
  name: string;
  /** Keywords that make this choice more appropriate */
  strengths: string[];
  /** Keywords that make this choice less appropriate */
  weaknesses: string[];
};

/**
 * Score a technology choice against a requirement context string.
 * Score = (strength matches * 2) - (weakness matches * 3).
 * Negative scores indicate a poor fit.
 */
export function scoreTechChoice(choice: TechChoice, context: string): number {
  const tokens = context.toLowerCase().split(/\s+/).filter(Boolean);
  const strengthHits = choice.strengths.filter((s) =>
    tokens.some((t) => s.toLowerCase().includes(t) || t.includes(s.toLowerCase())),
  ).length;
  const weaknessHits = choice.weaknesses.filter((w) =>
    tokens.some((t) => w.toLowerCase().includes(t) || t.includes(w.toLowerCase())),
  ).length;
  return strengthHits * 2 - weaknessHits * 3;
}

/**
 * Rank a list of technology choices by score descending for a given context.
 * Ties broken by original array order (stable sort).
 */
export function rankTechChoices(choices: TechChoice[], context: string): TechChoice[] {
  return [...choices].sort(
    (a, b) => scoreTechChoice(b, context) - scoreTechChoice(a, context),
  );
}
