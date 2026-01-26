/**
 * Detection confidence thresholds
 *
 * Thresholds used for geo-detection, data validation, and fuzzy matching.
 * These values determine minimum confidence levels for automated decisions.
 */

// Geographic detection thresholds
export const GEO_DETECTION = {
  // Minimum confidence to auto-select (50%)
  MIN_CONFIDENCE: 0.5,

  // High confidence threshold (80%)
  HIGH_CONFIDENCE: 0.8,

  // Match threshold for accepting results (80%)
  MATCH_THRESHOLD: 0.8,

  // Very high confidence (85%)
  VERY_HIGH_CONFIDENCE: 0.85,

  // Near-certain confidence (90%)
  NEAR_CERTAIN: 0.9,

  // Exceptional confidence (95%)
  EXCEPTIONAL: 0.95,

  // Confidence multipliers
  MULTIPLIER_STRONG: 1.5,
  MULTIPLIER_MODERATE: 0.8,

  // Lower match thresholds for partial matches
  LOW_MATCH_THRESHOLD: 0.4,
  MEDIUM_MATCH_THRESHOLD: 0.3
} as const;

// Data validation thresholds
export const DATA_VALIDATION = {
  // Threshold for detecting likely year values (>50%)
  NULL_PERCENTAGE_THRESHOLD: 50,

  // Date range validation (1900-2100)
  MIN_YEAR: 1900,
  MAX_YEAR: 2100,

  // Threshold multiplier for anomaly detection
  ANOMALY_MULTIPLIER: 0.8
} as const;

// Fuzzy search thresholds
export const FUZZY_SEARCH = {
  // Jaro-Winkler similarity threshold (85%)
  DEFAULT_SIMILARITY: 0.85,

  // Head-tail breaks classification threshold (40%)
  HEAD_TAIL_THRESHOLD: 0.4
} as const;

// Combined export
export const DETECTION_THRESHOLDS = {
  geo: GEO_DETECTION,
  validation: DATA_VALIDATION,
  search: FUZZY_SEARCH
} as const;
