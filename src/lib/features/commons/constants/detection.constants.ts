/**
 * Detection confidence thresholds
 *
 * Thresholds used for geo-detection, data validation, and fuzzy matching.
 * These values determine minimum confidence levels for automated decisions.
 */

export const GEO_DETECTION = {
  MIN_CONFIDENCE: 0.5,
  HIGH_CONFIDENCE: 0.8,
  MATCH_THRESHOLD: 0.8,
  VERY_HIGH_CONFIDENCE: 0.85,
  NEAR_CERTAIN: 0.9,
  EXCEPTIONAL: 0.95,
  MULTIPLIER_STRONG: 1.5,
  MULTIPLIER_MODERATE: 0.8,
  LOW_MATCH_THRESHOLD: 0.4,
  MEDIUM_MATCH_THRESHOLD: 0.3
} as const;

export const DATA_VALIDATION = {
  NULL_PERCENTAGE_THRESHOLD: 50,
  MIN_YEAR: 1900,
  MAX_YEAR: 2100,
  ANOMALY_MULTIPLIER: 0.8
} as const;

export const FUZZY_SEARCH = {
  DEFAULT_SIMILARITY: 0.85,
  HEAD_TAIL_THRESHOLD: 0.4
} as const;
