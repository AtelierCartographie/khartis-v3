/**
 * Locale-aware numeric format normalization, shared between the import pipeline
 * (auto-detection of formatted numeric columns) and manual type coercion in the
 * data table. Single source of truth for "what is a number, whatever the locale
 * decimal/thousands convention" so both paths agree.
 *
 * The `commaDecimal` pattern intentionally skips an exactly-3-digit fractional
 * part (`1,234`): it is ambiguous with a US thousands group and is left to the
 * thousands rule. 1-2 or 4+ comma decimals are unambiguous.
 */
const SQL_PATTERN = {
  euThousandsCommaDecimal: '^[-+]?[0-9]{1,3}(\\.[0-9]{3})+,[0-9]+$',
  spaceThousandsCommaDecimal: '^[-+]?[0-9]{1,3}( [0-9]{3})+,[0-9]+$',
  usThousandsDotDecimal: '^[-+]?[0-9]{1,3}(,[0-9]{3})+\\.[0-9]+$',
  dotDecimal: '^[-+]?[0-9]+\\.[0-9]+$',
  commaDecimal: '^[-+]?[0-9]+,([0-9]{1,2}|[0-9]{4,})$',
  commaThousandsInteger: '^[-+]?[0-9]{1,3}(,[0-9]{3})+$',
  dotThousandsInteger: '^[-+]?[0-9]{1,3}(\\.[0-9]{3})+$',
  spaceThousandsInteger: '^[-+]?[0-9]{1,3}( [0-9]{3})+$',
  integer: '^[-+]?[0-9]+$'
} as const;

/**
 * Builds a SQL expression that rewrites a locale-formatted numeric string into a
 * dot-decimal string DuckDB can `TRY_CAST` to DOUBLE/BIGINT, or NULL otherwise.
 */
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

/**
 * Builds a SQL boolean expression that is true when the value looks like a
 * decimal (not an integer) in any supported locale format — used to pick DOUBLE
 * over BIGINT as the target type.
 */
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
