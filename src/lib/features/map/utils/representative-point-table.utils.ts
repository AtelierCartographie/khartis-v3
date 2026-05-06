export async function resolveRepresentativePointTableName(options: {
  datasetTableName: string | null;
  joinedBasemapId?: string | null;
  loadBasemapGeometryTableName: (basemapId: string) => Promise<string>;
}): Promise<string | null> {
  const { datasetTableName, joinedBasemapId, loadBasemapGeometryTableName } =
    options;

  if (joinedBasemapId) {
    return loadBasemapGeometryTableName(joinedBasemapId);
  }

  return datasetTableName;
}
