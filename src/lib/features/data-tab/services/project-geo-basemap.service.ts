import { INTERNAL_COLUMN } from '$lib/features/commons/constants/data.constants';
import { getFileExtensionWithDot } from '$lib/features/commons/utils/file.utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { ColumnType, type DatasetResult } from '$lib/features/data-pipeline';
import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';
import * as m from '$lib/paraglide/messages';
import { ACCEPTED_BASEMAP_EXTENSIONS } from '../utils/enrichment.utils';
import { findBestTargetColumn } from './target-column-ranking.service';

const PROJECT_GEO_CARD_PREFIX = 'project-geo:';
const INTERNAL_COLUMNS = new Set<string>([
  INTERNAL_COLUMN.ID,
  INTERNAL_COLUMN.FEATURE_ID
]);

type ProjectGeoDataset = Pick<
  DatasetResult,
  'id' | 'name' | 'sourceFileId' | 'tableName' | 'columns' | 'geometry'
>;

/**
 * A geo file of the project offered to a table. Joining them enriches the geo
 * file, so the card only stands for it among the basemaps.
 */
export interface ProjectGeoBasemapOption {
  dataset: ProjectGeoDataset;
  basemap: BasemapMetadata;
}

export interface ProjectGeoMatch {
  /** Share of the source values found, on the catalog suggestion scale. */
  score: number;
  /** The geo file column holding them. */
  targetColumn: string;
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

/** The datasets of the project that carry their own geometry. */
export function listProjectGeoBasemapOptions(
  datasets: readonly ProjectGeoDataset[],
  selectedDatasetId: string | undefined
): ProjectGeoBasemapOption[] {
  return datasets
    .filter(
      (dataset) =>
        dataset.id !== selectedDatasetId &&
        Boolean(dataset.geometry) &&
        Boolean(dataset.tableName)
    )
    .map((dataset) => ({ dataset, basemap: toPlaceholderBasemap(dataset) }));
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

/** How well each project geo file holds the values of a table column. */
export async function scoreProjectGeoBasemapOptions(input: {
  sourceTableName: string;
  sourceColumn: string;
  options: readonly ProjectGeoBasemapOption[];
}): Promise<Map<string, ProjectGeoMatch>> {
  const matches = new Map<string, ProjectGeoMatch>();
  for (const option of input.options) {
    try {
      const best = await findBestTargetColumn({
        sourceTableName: input.sourceTableName,
        sourceColumn: input.sourceColumn,
        targetTableName: option.dataset.tableName,
        targetColumns: listUserColumns(option.dataset)
      });
      if (best) {
        matches.set(option.dataset.id, {
          score: best.matchShare,
          targetColumn: best.column
        });
      }
    } catch (error) {
      logger.warn(
        'Failed to score a project geo file against the dataset',
        LogCategory.DATA,
        error
      );
    }
  }
  return matches;
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
  const ranked = [
    ...projectSuggestions
      .filter((suggestion) => suggestion.score > 0)
      .map((suggestion) => ({ suggestion, isProject: true })),
    ...catalogSuggestions.map((suggestion) => ({
      suggestion,
      isProject: false
    }))
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
