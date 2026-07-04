/** Locale-aware numeric normalization shared by import detection and type coercion. */
const SQL_PATTERN = {
  euThousandsCommaDecimal: '^[-+]?[0-9]{1,3}(\\.[0-9]{3})+,[0-9]+$',
  spaceThousandsCommaDecimal: '^[-+]?[0-9]{1,3}( [0-9]{3})+,[0-9]+$',
  usThousandsDotDecimal: '^[-+]?[0-9]{1,3}(,[0-9]{3})+\\.[0-9]+$',
  dotDecimal: '^[-+]?[0-9]+\\.[0-9]+$',
  // Skip exactly 3 comma decimals because `1,234` is ambiguous with US thousands.
  commaDecimal: '^[-+]?[0-9]+,([0-9]{1,2}|[0-9]{4,})$',
  commaThousandsInteger: '^[-+]?[0-9]{1,3}(,[0-9]{3})+$',
  dotThousandsInteger: '^[-+]?[0-9]{1,3}(\\.[0-9]{3})+$',
  spaceThousandsInteger: '^[-+]?[0-9]{1,3}( [0-9]{3})+$',
  integer: '^[-+]?[0-9]+$'
} as const;

/** Build SQL that rewrites locale-formatted numbers into dot-decimal text. */
export function buildNormalizedNumericTextSql(valueExpr: string): string {
  return `CASE
    WHEN ${valueExpr} IS NULL OR ${valueExpr} = '' THEN NULL
    WHEN regexp_matches(${valueExpr}, '${SQL_PATTERN.euThousandsCommaDecimal}') THEN replace(regexp_replace(${valueExpr}, '\\.', '', 'g'), ',', '.')
    WHEN regexp_matches(${valueExpr}, '${SQL_PATTERN.spaceThousandsCommaDecimal}') THEN replace(regexp_replace(${valueExpr}, ' ', '', 'g'), ',', '.')
    WHEN regexp_matches(${valueExpr}, '${SQL_PATTERN.usThousandsDotDecimal}') THEN regexp_replace(${valueExpr}, ',', '', 'g')
    WHEN regexp_matches(${valueExpr}, '${SQL_PATTERN.dotDecimal}') THEN ${valueExpr}
    WHEN regexp_matches(${valueExpr}, '${SQL_PATTERN.commaDecimal}') THEN replace(${valueExpr}, ',', '.')
    WHEN regexp_matches(${valueExpr}, '${SQL_PATTERN.commaThousandsInteger}') THEN regexp_replace(${valueExpr}, ',', '', 'g')
    WHEN regexp_matches(${valueExpr}, '${SQL_PATTERN.dotThousandsInteger}') THEN regexp_replace(${valueExpr}, '\\.', '', 'g')
    WHEN regexp_matches(${valueExpr}, '${SQL_PATTERN.spaceThousandsInteger}') THEN regexp_replace(${valueExpr}, ' ', '', 'g')
    WHEN regexp_matches(${valueExpr}, '${SQL_PATTERN.integer}') THEN ${valueExpr}
    ELSE NULL
  END`;
}

/** Build SQL that detects decimal-like locale formats. */
export function buildDecimalLikeConditionSql(valueExpr: string): string {
  return [
    SQL_PATTERN.euThousandsCommaDecimal,
    SQL_PATTERN.spaceThousandsCommaDecimal,
    SQL_PATTERN.usThousandsDotDecimal,
    SQL_PATTERN.dotDecimal,
    SQL_PATTERN.commaDecimal
  ]
    .map((pattern) => `regexp_matches(${valueExpr}, '${pattern}')`)
    .join(' OR ');
}
