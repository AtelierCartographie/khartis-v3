const BASEMAP_JOIN_KEY_COLUMN_PATTERNS = [
  /^(name|nom|libelle|label|id|code|iso|fips|postal|abbrev|admin|sovereignt|geounit|subunit)$/i,
  /_(name|code|a3|a2)$/i,
  /^(name_|iso_|adm0_|brk_|un_|wb_|gu_|su_|sov_|formal_)/i
];
const FALLBACK_BASEMAP_JOIN_KEY_COLUMN_COUNT = 5;

// The join stores the raw value of these columns as basemap_id, so a basemap
// drawn for a joined dataset must carry every column this can return.
export function selectBasemapJoinKeyColumns(
  textColumnNames: readonly string[]
): string[] {
  const candidates = textColumnNames.filter((name) =>
    BASEMAP_JOIN_KEY_COLUMN_PATTERNS.some((pattern) => pattern.test(name))
  );
  return candidates.length > 0
    ? candidates
    : textColumnNames.slice(0, FALLBACK_BASEMAP_JOIN_KEY_COLUMN_COUNT);
}
