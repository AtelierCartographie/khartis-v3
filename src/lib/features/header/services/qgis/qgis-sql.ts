/** SQL expressions over a DuckDB spatial geometry, for the QGIS export. */

// d3 cuts lon/lat geometry at the meridian opposite the centre; PROJ does
// not, and a ring across it would streak over the whole map.
export function cutAtOppositeMeridian(
  geometry: string,
  centralMeridian: number
): string {
  if (Math.abs(centralMeridian) < 1e-9) {
    return geometry;
  }
  const cut = ((((centralMeridian + 180) % 360) + 540) % 360) - 180;
  const strip = `ST_MakeEnvelope(${cut - 1e-7}, -90, ${cut + 1e-7}, 90)`;
  return `(CASE WHEN ST_Intersects(${geometry}, ${strip}) THEN ST_Difference(ST_MakeValid(${geometry}), ${strip}) ELSE ${geometry} END)`;
}

export function representativePoint(geometry: string): string {
  // Same point the map puts a symbol or a label on.
  return `(CASE
    WHEN ${geometry} IS NULL OR ST_IsEmpty(${geometry}) THEN NULL
    WHEN ST_GeometryType(${geometry}) = 'POINT' THEN ${geometry}
    WHEN ST_GeometryType(${geometry}) IN ('POLYGON', 'MULTIPOLYGON') THEN
      CASE WHEN NOT ST_IsValid(${geometry}) THEN ST_PointOnSurface(${geometry})
      ELSE COALESCE(ST_MaximumInscribedCircle(${geometry}).center, ST_PointOnSurface(${geometry})) END
    ELSE ST_PointOnSurface(${geometry})
  END)`;
}
