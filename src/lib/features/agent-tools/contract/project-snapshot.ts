import { INTERNAL_COLUMN } from '$lib/features/commons/constants/data.constants';
import type { ClassificationConfig } from '$lib/features/commons/stores/visualization.types';
import type { EnrichedColumn } from '$lib/features/data-pipeline';
import { computeRevision } from './revision';
import {
  AGENT_CLASS_COUNT,
  AGENT_CLASSIFICATION_METHODS,
  AGENT_STEPS,
  listClassPaletteIds
} from './validation';

/**
 * What the agent reads is the map, not the data: structure, settings and
 * texts. Column statistics carry real values (min, max, samples,
 * categories), so only counts leave this function.
 */

export type SnapshotColumnInput = Pick<EnrichedColumn, 'name' | 'type'> & {
  stats?: Partial<EnrichedColumn['stats']>;
};

export interface SnapshotDatasetInput {
  id: string;
  name: string;
  rowCount: number;
  hasGeometry: boolean;
  joinedBasemap?: string;
  columns: SnapshotColumnInput[];
}

export interface SnapshotPrimitiveInput {
  primitive: string;
  mode: string;
  valueColumn?: string;
  categoryColumn?: string;
  classification?: Partial<ClassificationConfig>;
}

export interface SnapshotVisualizationInput {
  id: string;
  name: string;
  datasetId: string;
  enabled: boolean;
  primitives: SnapshotPrimitiveInput[];
}

export interface SnapshotTextInput {
  id: string;
  role?: string;
  content: unknown;
  placeholder: boolean;
}

export interface SnapshotLegendInput {
  id: string;
  visualizationId?: string;
  title: string;
  subtitle: string;
  note: string;
}

export interface ProjectSnapshotInput {
  projectName: string | null;
  step: string;
  datasets: SnapshotDatasetInput[];
  visualizations: SnapshotVisualizationInput[];
  texts: SnapshotTextInput[];
  legends: SnapshotLegendInput[];
}

const SNAPSHOT_PAGE_TEXT_ROLES = ['title', 'subtitle', 'source'] as const;

function countOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

const INTERNAL_COLUMN_NAMES = new Set<string>(Object.values(INTERNAL_COLUMN));

function readText(text: SnapshotTextInput | undefined): string | null {
  if (!text || text.placeholder || typeof text.content !== 'string') {
    return null;
  }
  return text.content;
}

export function buildProjectSnapshot(input: ProjectSnapshotInput) {
  const map = {
    datasets: input.datasets.map((dataset) => ({
      id: dataset.id,
      name: dataset.name,
      row_count: dataset.rowCount,
      has_geometry: dataset.hasGeometry,
      joined_basemap: dataset.joinedBasemap ?? null,
      columns: dataset.columns
        .filter((column) => !INTERNAL_COLUMN_NAMES.has(column.name))
        .map((column) => ({
          name: column.name,
          type: column.type,
          missing_count: countOrNull(column.stats?.nulls),
          distinct_count: countOrNull(column.stats?.uniques)
        }))
    })),
    visualizations: input.visualizations.map((visualization) => ({
      id: visualization.id,
      name: visualization.name,
      dataset_id: visualization.datasetId,
      enabled: visualization.enabled,
      primitives: visualization.primitives.map((primitive) => ({
        primitive: primitive.primitive,
        mode: primitive.mode,
        value_column: primitive.valueColumn,
        category_column: primitive.categoryColumn,
        classification: primitive.classification && {
          method: primitive.classification.method,
          classes: primitive.classification.classes,
          palette_id: primitive.classification.paletteId,
          inverted: primitive.classification.inverted ?? false
        }
      }))
    })),
    page_texts: Object.fromEntries(
      SNAPSHOT_PAGE_TEXT_ROLES.map((role) => [
        role,
        readText(input.texts.find((text) => text.role === role))
      ])
    ),
    texts: input.texts.map((text) => ({
      id: text.id,
      role: text.role ?? null,
      text: readText(text)
    })),
    legends: input.legends.map((legend) => ({
      id: legend.id,
      visualization_id: legend.visualizationId ?? null,
      title: legend.title,
      subtitle: legend.subtitle,
      note: legend.note
    }))
  };

  return {
    project_name: input.projectName,
    step: input.step,
    revision: computeRevision(map),
    ...map,
    capabilities: {
      steps: [...AGENT_STEPS],
      classification_methods: [...AGENT_CLASSIFICATION_METHODS],
      class_count: { ...AGENT_CLASS_COUNT },
      class_palettes: listClassPaletteIds()
    }
  };
}
