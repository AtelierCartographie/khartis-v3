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

export interface SnapshotColumnInput {
  name: string;
  type: string;
  stats?: { nulls?: number; uniques?: number; [key: string]: unknown };
}

export interface SnapshotDatasetInput {
  id: string;
  name: string;
  rowCount: number;
  hasGeometry: boolean;
  joinedBasemap?: string;
  columns: SnapshotColumnInput[];
}

export interface SnapshotClassificationInput {
  method?: string;
  classes?: number;
  paletteId?: string;
  inverted?: boolean;
  [key: string]: unknown;
}

export interface SnapshotPrimitiveInput {
  primitive: string;
  mode: string;
  valueColumn?: string;
  categoryColumn?: string;
  classification?: SnapshotClassificationInput;
}

export interface SnapshotVisualizationInput {
  id: string;
  name: string;
  datasetId: string;
  enabled: boolean;
  primitives: SnapshotPrimitiveInput[];
}

export interface SnapshotPageTextInput {
  role: string;
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
  pageTexts: SnapshotPageTextInput[];
  legends: SnapshotLegendInput[];
}

const SNAPSHOT_PAGE_TEXT_ROLES = ['title', 'subtitle', 'source'] as const;

function countOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readPageText(
  pageTexts: SnapshotPageTextInput[],
  role: string
): string | null {
  const text = pageTexts.find((item) => item.role === role);
  if (!text || text.placeholder || typeof text.content !== 'string') {
    return null;
  }
  return text.content;
}

export function buildProjectSnapshot(input: ProjectSnapshotInput) {
  return {
    project_name: input.projectName,
    step: input.step,
    datasets: input.datasets.map((dataset) => ({
      id: dataset.id,
      name: dataset.name,
      row_count: dataset.rowCount,
      has_geometry: dataset.hasGeometry,
      joined_basemap: dataset.joinedBasemap ?? null,
      columns: dataset.columns.map((column) => ({
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
        readPageText(input.pageTexts, role)
      ])
    ),
    legends: input.legends.map((legend) => ({
      id: legend.id,
      visualization_id: legend.visualizationId ?? null,
      title: legend.title,
      subtitle: legend.subtitle,
      note: legend.note
    })),
    capabilities: {
      steps: [...AGENT_STEPS],
      classification_methods: [...AGENT_CLASSIFICATION_METHODS],
      class_count: { ...AGENT_CLASS_COUNT },
      class_palettes: listClassPaletteIds()
    }
  };
}

export type ProjectSnapshot = ReturnType<typeof buildProjectSnapshot>;
