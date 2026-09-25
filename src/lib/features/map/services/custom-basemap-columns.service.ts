import {
  CANONICAL_ID_COLUMN,
  INTERNAL_COLUMN
} from '$lib/features/commons/constants/data.constants';
import {
  DuckDBSimplifiedType,
  isGeometryColumnName,
  selectBasemapJoinKeyColumns
} from '$lib/features/duckdb';

export interface CustomBasemapColumnSummary {
  name: string;
  type_simple?: string | null;
}

export interface CustomBasemapColumnAnalyzer {
  analyse(tableName: string): Promise<readonly CustomBasemapColumnSummary[]>;
}

function isCustomBasemapJoinCandidateColumn(columnName: string): boolean {
  const normalizedName = columnName.toLowerCase();
  return (
    ['name', 'nom', 'libelle', 'label'].includes(normalizedName) ||
    [CANONICAL_ID_COLUMN, 'code', 'iso', 'insee', 'nuts'].includes(
      normalizedName
    ) ||
    normalizedName.endsWith('_name') ||
    normalizedName.endsWith('_code')
  );
}

export function getCustomBasemapJoinCandidateColumns<
  T extends CustomBasemapColumnSummary
>(columns: readonly T[]): T[] {
  const candidateColumns = columns.filter((column) => {
    if (column.name === INTERNAL_COLUMN.FEATURE_ID) {
      return false;
    }
    return isCustomBasemapJoinCandidateColumn(column.name);
  });

  if (candidateColumns.length > 0) {
    return candidateColumns;
  }

  const fallbackTextColumn = columns.find(
    (column) =>
      column.type_simple === 'string' &&
      column.name !== INTERNAL_COLUMN.FEATURE_ID
  );
  return fallbackTextColumn ? [fallbackTextColumn] : [];
}

export function getCustomBasemapGeometryProjectColumns(
  columns: readonly CustomBasemapColumnSummary[]
): string[] {
  const textColumnNames = columns
    .filter(
      (column) =>
        column.type_simple === DuckDBSimplifiedType.STRING &&
        column.name !== INTERNAL_COLUMN.FEATURE_ID &&
        !isGeometryColumnName(column.name)
    )
    .map((column) => column.name);

  return [
    ...new Set([
      INTERNAL_COLUMN.FEATURE_ID,
      ...getCustomBasemapJoinCandidateColumns(columns).map(
        (column) => column.name
      ),
      ...selectBasemapJoinKeyColumns(textColumnNames)
    ])
  ];
}

export async function resolveCustomBasemapGeometryProjectColumns(
  analyzer: CustomBasemapColumnAnalyzer,
  tableName: string
): Promise<string[]> {
  const columns = await analyzer.analyse(tableName);
  return getCustomBasemapGeometryProjectColumns(columns);
}
