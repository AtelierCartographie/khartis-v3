import type { UploadedFile } from '$lib/features/commons/types/create-project.types';
import { projectStore } from '$lib/features/commons/stores/project.store.svelte';
import { escapeIdentifier } from '$lib/features/commons/utils/sanitize.utils';
import {
  buildStatisticsSnapshot,
  type GeometryInfo
} from '$lib/features/data-pipeline';
import { Duck, type AnalysisResult } from '$lib/features/duckdb';
import type { JsonValue } from '$lib/types/data';

function toSnapshotValue(value: unknown): JsonValue {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value ?? null;
  }

  if (typeof value === 'bigint') {
    return Number.isSafeInteger(Number(value)) ? Number(value) : String(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => toSnapshotValue(item));
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, toSnapshotValue(item)])
    );
  }

  return String(value);
}

function toSnapshotRow(
  row: Record<string, unknown>,
  columnNames: string[]
): Record<string, JsonValue> {
  return Object.fromEntries(
    columnNames.map((columnName) => [
      columnName,
      toSnapshotValue(row[columnName])
    ])
  );
}

async function buildTabularSnapshot(
  tableName: string,
  columnNames: string[]
): Promise<Record<string, JsonValue>[]> {
  if (columnNames.length === 0) {
    return [];
  }

  const escapedTableName = escapeIdentifier(tableName);
  const selectColumns = columnNames
    .map((name) => `"${escapeIdentifier(name)}"`)
    .join(', ');

  const rows = (await Duck.query(
    `SELECT ${selectColumns}
     FROM "${escapedTableName}"`,
    { format: 'array' }
  )) as Record<string, unknown>[];

  return rows.map((row) => toSnapshotRow(row, columnNames));
}

type JoinSnapshotUpdates = Partial<
  Pick<
    UploadedFile,
    'joinedBasemap' | 'geoColumn' | 'gpsMode' | 'gpsColumns' | 'joinCorrections'
  >
>;

function updateSourceFileSnapshot(
  sourceFile: UploadedFile,
  tableName: string,
  rows: Record<string, JsonValue>[],
  statistics: Record<string, unknown>,
  updates: JoinSnapshotUpdates,
  geometry?: GeometryInfo
): void {
  sourceFile.duckdbTableName = tableName;
  sourceFile.parsedData = rows;
  sourceFile.statistics = statistics;

  if (geometry) {
    sourceFile.geometry = geometry;
  }

  if ('joinedBasemap' in updates) {
    sourceFile.joinedBasemap = updates.joinedBasemap;
  }
  if ('geoColumn' in updates) {
    sourceFile.geoColumn = updates.geoColumn;
  }
  if ('gpsMode' in updates) {
    sourceFile.gpsMode = updates.gpsMode;
  }
  if ('gpsColumns' in updates) {
    sourceFile.gpsColumns = updates.gpsColumns;
  }
  if ('joinCorrections' in updates) {
    sourceFile.joinCorrections = updates.joinCorrections;
  }
}

export async function persistTabularSourceSnapshot(input: {
  sourceFileId: string;
  tableName: string;
  duckColumns: AnalysisResult[];
  geometry?: GeometryInfo;
  joinState?: JoinSnapshotUpdates;
}): Promise<void> {
  const {
    sourceFileId,
    tableName,
    duckColumns,
    geometry,
    joinState = {}
  } = input;
  const sourceFile = projectStore.currentProject?.data?.sourceFiles?.find(
    (file) => file.id === sourceFileId
  );

  if (!sourceFile) {
    return;
  }

  const geometryColumnName =
    duckColumns.find((column) => column.type_simple === 'geometry')?.name ??
    geometry?.columnName;
  const propertyColumnNames = duckColumns
    .filter((column) => column.name !== geometryColumnName)
    .map((column) => column.name);
  const rows = await buildTabularSnapshot(tableName, propertyColumnNames);
  const statistics = buildStatisticsSnapshot(duckColumns);

  updateSourceFileSnapshot(
    sourceFile,
    tableName,
    rows,
    statistics,
    joinState,
    geometry
  );

  await projectStore.saveCurrentProject();
}
