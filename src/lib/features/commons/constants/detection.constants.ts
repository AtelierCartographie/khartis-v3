export const NULL_VALUE_TOKENS = [
  '',
  ':',
  '-',
  '...',
  'null',
  'NULL',
  'NA',
  'N/A',
  'n/a',
  '#N/A',
  'NaN',
  'nil',
  'NIL',
  'none',
  'NONE',
  'None'
] as const;

export const FUZZY_SEARCH = {
  // Calibrated so common near-miss pairs (toulon/toulouse 0.89,
  // iran/irak 0.88, lyon/laon 0.85...) sit below the cutoff. See PR #250.
  SCORE_CUTOFF: 0.9,
  HEAD_TAIL_THRESHOLD: 0.4
} as const;
