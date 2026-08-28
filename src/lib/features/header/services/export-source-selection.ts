interface GeometryExportSourceState {
  hasGeometryColumn: boolean;
  hasJoinedGeometry: boolean;
  hasGpsColumns: boolean;
  gpsMode: boolean | undefined;
}

export function shouldUseGpsGeometryExport({
  hasGeometryColumn,
  hasJoinedGeometry,
  hasGpsColumns,
  gpsMode
}: GeometryExportSourceState): boolean {
  return (
    !hasGeometryColumn &&
    hasGpsColumns &&
    (gpsMode === true || !hasJoinedGeometry)
  );
}
