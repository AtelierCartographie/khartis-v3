import type { UploadedFile } from '$lib/features/commons/types/create-project.types';
import { projectStore } from '$lib/features/commons/stores/project.store.svelte';
import {
  buildStatisticsSnapshot,
  type GeometryInfo
} from '$lib/features/data-pipeline';
import type { AnalysisResult } from '$lib/features/duckdb';

type JoinStateUpdates = Partial<
  Pick<
    UploadedFile,
    'joinedBasemap' | 'geoColumn' | 'gpsMode' | 'gpsColumns' | 'joinCorrections'
  >
>;

function applySourceFileState(
  sourceFile: UploadedFile,
  tableName: string,
  statistics: Record<string, unknown>,
  updates: JoinStateUpdates,
  geometry?: GeometryInfo
): void {
  sourceFile.duckdbTableName = tableName;
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

export async function persistSourceFileState(input: {
  sourceFileId: string;
  tableName: string;
  duckColumns: AnalysisResult[];
  geometry?: GeometryInfo;
  joinState?: JoinStateUpdates;
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

  applySourceFileState(
    sourceFile,
    tableName,
    buildStatisticsSnapshot(duckColumns),
    joinState,
    geometry
  );

  await projectStore.saveCurrentProject();
}
