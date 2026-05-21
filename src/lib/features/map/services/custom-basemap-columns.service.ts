import {
  CANONICAL_ID_COLUMN,
  INTERNAL_COLUMN
} from '$lib/features/commons/constants/data.constants';

export interface CustomBasemapColumnSummary {
  name: string;
  type_simple?: string | null;
}

export function isCustomBasemapJoinCandidateColumn(
  columnName: string
): boolean {
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
  return [
    INTERNAL_COLUMN.FEATURE_ID,
    ...getCustomBasemapJoinCandidateColumns(columns).map(
      (column) => column.name
    )
  ];
}
