/**
 * Wrap a primary LLMClient with a fallback that retries once if primary throws.
 *
 * Intended use: primary=haiku (cheap, fast), fallback=sonnet (accurate).
 * Any thrown error from primary — LLMClientError or generic Error from parse —
 * triggers exactly one attempt on fallback. Fallback errors propagate.
 */
import type { LLMClient } from "@teamagent/ports";

export function makeFallbackLLMClient(
  primary: LLMClient,
  fallback: LLMClient,
): LLMClient {
  return {
    async complete(prompt: string): Promise<string> {
      try {
        return await primary.complete(prompt);
      } catch {
        return await fallback.complete(prompt);
      }
    },
  };
}
