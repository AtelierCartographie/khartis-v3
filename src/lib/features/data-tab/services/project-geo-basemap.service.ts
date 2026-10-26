import { INTERNAL_COLUMN } from '$lib/features/commons/constants/data.constants';
import { FILE_EXTENSION_GROUPS } from '$lib/features/commons/constants/file-types.constants';
import { MIME } from '$lib/features/commons/constants/mime.constants';
import { getFileExtensionWithDot } from '$lib/features/commons/utils/file.utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { ColumnType, type DatasetResult } from '$lib/features/data-pipeline';
import { Duck } from '$lib/features/duckdb';
import type {
  BasemapMetadata,
  ProjectGeoBasemapSource
} from '$lib/features/map/types/basemap.types';
import * as m from '$lib/paraglide/messages';
import { ACCEPTED_BASEMAP_EXTENSIONS } from '../utils/enrichment.utils';
import { findBestTargetColumn } from './join-stats.service';

const PROJECT_GEO_CARD_PREFIX = 'project-geo:';
const INTERNAL_COLUMNS = new Set<string>([
  INTERNAL_COLUMN.ID,
  INTERNAL_COLUMN.FEATURE_ID
]);

type ProjectGeoDataset = Pick<
  DatasetResult,
  'id' | 'name' | 'sourceFileId' | 'tableName' | 'columns' | 'geometry'
>;

export interface ProjectGeoBasemapOption {
  dataset: ProjectGeoDataset;
  /** The basemap already built from the dataset, or a card standing for it. */
  basemap: BasemapMetadata;
  isBuilt: boolean;
}

export function toProjectGeoBasemapSource(
  dataset: ProjectGeoDataset
): ProjectGeoBasemapSource {
  return { sourceFileId: dataset.sourceFileId, datasetName: dataset.name };
}

function isBuiltFromDataset(
  basemap: BasemapMetadata,
  dataset: ProjectGeoDataset
): boolean {
  return (
    basemap.isCustom === true &&
    basemap.projectSource?.sourceFileId === dataset.sourceFileId &&
    basemap.projectSource.datasetName === dataset.name
  );
}

function getDatasetTitle(dataset: ProjectGeoDataset): string {
  const extension = getFileExtensionWithDot(dataset.name);
  return ACCEPTED_BASEMAP_EXTENSIONS.includes(extension)
    ? dataset.name.slice(0, -extension.length)
    : dataset.name;
}

function toPlaceholderBasemap(dataset: ProjectGeoDataset): BasemapMetadata {
  const title = getDatasetTitle(dataset);
  return {
    file: `${PROJECT_GEO_CARD_PREFIX}${dataset.id}`,
    title_fr: title,
    title_en: title,
    source: m.basemap_project_file_source(),
    date: '',
    proj_source: dataset.geometry?.crs ?? '',
    proj_to: { type: 'identity' },
    bbox: [0, 0, 0, 0],
    layers: [],
    isCustom: true
  };
}

/**
 * The datasets of the project that carry their own geometry, offered as a
 * basemap for the selected tabular dataset without importing the file again.
 */
export function listProjectGeoBasemapOptions(
  datasets: readonly ProjectGeoDataset[],
  selectedDatasetId: string | undefined,
  basemaps: readonly BasemapMetadata[]
): ProjectGeoBasemapOption[] {
  return datasets
    .filter(
      (dataset) =>
        dataset.id !== selectedDatasetId &&
        Boolean(dataset.geometry) &&
        Boolean(dataset.tableName)
    )
    .map((dataset) => {
      const built = basemaps.find((basemap) =>
        isBuiltFromDataset(basemap, dataset)
      );
      return {
        dataset,
        basemap: built ?? toPlaceholderBasemap(dataset),
        isBuilt: built !== undefined
      };
    });
}

function listUserColumns(dataset: ProjectGeoDataset): string[] {
  const geometryColumn = dataset.geometry?.columnName ?? INTERNAL_COLUMN.GEOM;
  return dataset.columns
    .filter(
      (column) =>
        column.name !== geometryColumn &&
        column.type !== ColumnType.GEOMETRY &&
        !INTERNAL_COLUMNS.has(column.name)
    )
    .map((column) => column.name);
}

/**
 * Copies the dataset table as GeoParquet, so the basemap goes through the same
 * import, persistence and restore path as a file the user uploads.
 */
export async function createProjectGeoBasemapFile(
  dataset: ProjectGeoDataset
): Promise<File> {
  const { name: tableColumns } = await Duck.describe_table(dataset.tableName);
  const columns = tableColumns.filter(
    (column) => !INTERNAL_COLUMNS.has(column)
  );
  const bytes = await Duck.copy_to_parquet_bytes(dataset.tableName, columns);
  return new File(
    [bytes as Uint8Array<ArrayBuffer>],
    `${getDatasetTitle(dataset)}${FILE_EXTENSION_GROUPS.PARQUET[0]}`,
    { type: MIME.GEOPARQUET }
  );
}

/**
 * Share of the source values each project geo dataset holds in its best
 * column, on the scale of the catalog suggestions (0 to 100).
 */
export async function scoreProjectGeoBasemapOptions(input: {
  sourceTableName: string;
  sourceColumn: string;
  options: readonly ProjectGeoBasemapOption[];
}): Promise<Map<string, number>> {
  const scores = new Map<string, number>();
  for (const option of input.options) {
    const targetColumns = listUserColumns(option.dataset);
    try {
      const best = await findBestTargetColumn({
        sourceTableName: input.sourceTableName,
        sourceColumn: input.sourceColumn,
        targetTableName: option.dataset.tableName,
        targetColumns
      });
      if (best) {
        scores.set(option.dataset.id, best.matchShare);
      }
    } catch (error) {
      logger.warn(
        'Failed to score a project geo file against the dataset',
        LogCategory.DATA,
        error
      );
    }
  }
  return scores;
}

export interface ScoredBasemap {
  basemap: BasemapMetadata;
  score: number;
  matchesData: boolean;
}

/**
 * Ranks the project geo files with the catalog suggestions on one scale. A
 * suggestion resting on the data comes before one scored on its metadata
 * alone, and a project file wins a tie: the user brought it for this data.
 */
export function mergeProjectGeoSuggestions(
  catalogSuggestions: readonly ScoredBasemap[],
  projectSuggestions: readonly ScoredBasemap[],
  limit: number
): ScoredBasemap[] {
  const scoredProjectSuggestions = projectSuggestions.filter(
    (suggestion) => suggestion.score > 0
  );
  // A project file already turned into a basemap is also a custom basemap the
  // catalog ranking can return: it is listed once, as a project file.
  const projectFiles = new Set(
    scoredProjectSuggestions.map((suggestion) => suggestion.basemap.file)
  );
  const ranked = [
    ...scoredProjectSuggestions.map((suggestion) => ({
      suggestion,
      isProject: true
    })),
    ...catalogSuggestions
      .filter((suggestion) => !projectFiles.has(suggestion.basemap.file))
      .map((suggestion) => ({ suggestion, isProject: false }))
  ];
  return ranked
    .sort(
      (left, right) =>
        Number(right.suggestion.matchesData) -
          Number(left.suggestion.matchesData) ||
        right.suggestion.score - left.suggestion.score ||
        Number(right.isProject) - Number(left.isProject)
    )
    .slice(0, limit)
    .map(({ suggestion }) => suggestion);
}
