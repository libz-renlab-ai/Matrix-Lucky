export interface SemanticDescriptionSource {
  trigger?: string;
  wrong_pattern?: string;
  correct_pattern?: string;
  reasoning?: string;
}

export interface SemanticDescriptions {
  trigger_description: string;
  pattern_description: string;
}

export function buildSemanticDescriptions(
  source: SemanticDescriptionSource,
): SemanticDescriptions {
  const trigger = source.trigger?.trim() || "Apply this rule when the current task matches the stored rule context.";
  const wrong = source.wrong_pattern?.trim() ?? "";
  const correct = source.correct_pattern?.trim() ?? "";
  const reason = source.reasoning?.trim() ?? "";

  return {
    trigger_description: [trigger, reason].filter(Boolean).join(" "),
    pattern_description: wrong
      ? [`Using or producing ${wrong}.`, correct ? `Prefer ${correct}.` : "", reason]
          .filter(Boolean)
          .join(" ")
      : [correct || trigger, reason].filter(Boolean).join(" "),
  };
}
