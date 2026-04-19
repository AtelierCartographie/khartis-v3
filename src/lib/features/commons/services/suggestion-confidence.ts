// CDC [DATA-09b/VIZ-02a] requires auto-selection; epsilon prevents arbitrary pre-selection when multiple suggestions tie.

const DEFAULT_CONFIDENCE_EPSILON = 1e-3;

export interface ConfidenceOptions {
  minScore?: number;
  epsilon?: number;
}

export function hasConfidentTopSuggestion(
  scores: readonly number[],
  options: ConfidenceOptions = {}
): boolean {
  const { minScore = 0, epsilon = DEFAULT_CONFIDENCE_EPSILON } = options;

  if (scores.length === 0) return false;

  const top = scores[0];
  if (!Number.isFinite(top)) return false;
  if (top < minScore) return false;
  if (scores.length === 1) return true;

  for (let i = 1; i < scores.length; i++) {
    const next = scores[i];
    if (!Number.isFinite(next)) continue;
    if (top - next < epsilon) {
      return false;
    }
  }
  return true;
}
