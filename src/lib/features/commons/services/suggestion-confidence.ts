/**
 * Decides whether the top item of a ranked suggestion list is *confident enough*
 * to be auto-applied without user input.
 *
 * The CDC ([DATA-09b], [VIZ-02a], [VIZ-TOOLS-c]) requires that a suggestion be
 * pre-selected by default. But when several suggestions tie at the top — e.g. the
 * NUTS2 dataset matched all three Europe NUTS levels at 100 % before our
 * granularity tie-break — auto-selecting "the first one" is technically arbitrary.
 *
 * Strategy: a top suggestion is confident iff
 *   1. it exists,
 *   2. its score is above a minimum confidence threshold (default 0), and
 *   3. it is strictly better than every other suggestion by at least `epsilon`.
 *
 * When several suggestions are within `epsilon` of the top score, we treat the
 * choice as ambiguous and let the UI decide (typically: show the suggestions
 * without pre-selecting one).
 */

const DEFAULT_CONFIDENCE_EPSILON = 1e-3;

export interface ConfidenceOptions {
  /** Minimum score required for the top to be considered confident. Default 0. */
  minScore?: number;
  /** Minimum margin between top and runner-up. Default 1e-3. */
  epsilon?: number;
}

/**
 * Returns true when the first item of `scores` is strictly better than the rest.
 * `scores` must be the score values of the suggestions in their displayed order
 * (i.e. already sorted descending).
 */
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
