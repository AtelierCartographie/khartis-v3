import {
  colorblindDivergingPalettes,
  colorblindSequentialPalettes,
  findPaletteById,
  PALETTE_TYPE
} from '$lib/features/commons/components/palette-popover/palette.constants';
import {
  FillMode,
  SizeMode,
  SymbolMode
} from '$lib/features/commons/constants/visualization.constants';
import { datasetsStore } from '$lib/features/commons/stores/datasets.store.svelte';
import { projectStore } from '$lib/features/commons/stores/project.store.svelte';
import { visualizationStore } from '$lib/features/commons/stores/visualization.store.svelte';
import {
  getLinePrimitive,
  getPolygonPrimitive,
  getPrimitiveCategoryColumn,
  getPrimitiveClassification,
  getPrimitiveSizeColumn,
  getPrimitiveValueColumn,
  getSymbolPrimitive,
  getTextPrimitive
} from '$lib/features/commons/stores/visualization-normalize';
import {
  type ClassificationConfig,
  PrimitiveFilterType,
  type VisualizationConfig
} from '$lib/features/commons/stores/visualization.types';
import {
  reviewMap,
  type ReviewClassesInput,
  type ReviewVisualizationInput
} from '../contract/map-review';
import {
  NO_PROJECT,
  type AgentTool,
  type ColumnNature
} from '../contract/types';
import { readProjectSnapshot } from './read-tools';
import { listColumnNatures } from './column-natures';
import { listVisualizationLegends } from './legends';

const COLORBLIND_PALETTE_IDS = new Set(
  [...colorblindSequentialPalettes, ...colorblindDivergingPalettes].map(
    (palette) => palette.id
  )
);

function describeClasses(
  classification: Partial<ClassificationConfig> | undefined
): ReviewClassesInput | undefined {
  if (!classification) return undefined;
  const palette = classification.paletteId
    ? findPaletteById(classification.paletteId)
    : undefined;
  const counts = classification.counts ?? [];
  return {
    classes: classification.classes ?? counts.length,
    counts,
    paletteFamily:
      palette?.type === PALETTE_TYPE.DIVERGING
        ? 'diverging'
        : palette?.type === PALETTE_TYPE.SEQUENTIAL
          ? 'sequential'
          : null,
    colorblindSafePalette: palette
      ? COLORBLIND_PALETTE_IDS.has(palette.id)
      : false,
    hasBreakpoint: Number.isFinite(classification.breakpointValue)
  };
}

// Every primitive spells its constant modes with these values.
const CONSTANT_MODES = new Set<string>([
  FillMode.NONE,
  FillMode.UNIQUE,
  SizeMode.FIXED
]);

// A visualization whose every style is constant has no variable to explain.
function isDataDriven(visualization: VisualizationConfig): boolean {
  const polygon = getPolygonPrimitive(visualization);
  const symbol = getSymbolPrimitive(visualization);
  const line = getLinePrimitive(visualization);
  const text = getTextPrimitive(visualization);
  const modes: unknown[] = [
    ...(polygon?.enabled ? [polygon.fillMode, polygon.strokeMode] : []),
    ...(symbol?.enabled
      ? [symbol.mode, symbol.fillMode, symbol.strokeMode]
      : []),
    ...(line?.enabled ? [line.colorMode, line.thicknessMode] : []),
    ...(text?.enabled ? [text.colorMode, text.sizeMode] : [])
  ];
  return modes.some(
    (mode) => typeof mode === 'string' && !CONSTANT_MODES.has(mode)
  );
}

function describeVisualization(
  visualization: VisualizationConfig
): ReviewVisualizationInput {
  const dataset = datasetsStore.datasets.find(
    (item) => item.id === visualization.datasetId
  );
  const natures: Map<string, ColumnNature> = dataset
    ? listColumnNatures(dataset)
    : new Map();
  const missingCount = (column: string | undefined) => {
    const nulls = dataset?.columns.find((item) => item.name === column)?.stats
      ?.nulls;
    return typeof nulls === 'number' ? nulls : null;
  };

  const review: ReviewVisualizationInput = {
    id: visualization.id,
    datasetId: visualization.datasetId,
    dataDriven: isDataDriven(visualization),
    legends: listVisualizationLegends(visualization.id).map((legend) => ({
      visible: legend.visible,
      title: legend.title
    }))
  };

  const polygon = getPolygonPrimitive(visualization);
  if (
    polygon?.enabled &&
    (polygon.fillMode === FillMode.CLASSES ||
      polygon.fillMode === FillMode.CATEGORIES)
  ) {
    const classed = polygon.fillMode === FillMode.CLASSES;
    const column = classed
      ? getPrimitiveValueColumn(visualization, PrimitiveFilterType.POLYGON)
      : getPrimitiveCategoryColumn(visualization, PrimitiveFilterType.POLYGON);
    review.fill = {
      column,
      nature: column ? natures.get(column) : undefined,
      missingCount: missingCount(column),
      missingShown: Boolean(polygon.missingData?.show),
      classes: classed
        ? describeClasses(
            getPrimitiveClassification(
              visualization,
              PrimitiveFilterType.POLYGON
            )
          )
        : undefined
    };
  }

  const symbol = getSymbolPrimitive(visualization);
  if (symbol?.enabled && symbol.mode === SymbolMode.PROPORTIONAL) {
    const column = getPrimitiveSizeColumn(
      visualization,
      PrimitiveFilterType.POINT
    );
    review.proportionalSymbols = {
      column,
      nature: column ? natures.get(column) : undefined
    };
  }
  return review;
}

export const reviewMapTool: AgentTool = {
  name: 'review_map',
  title: 'Review the map before export',
  description:
    'Run the checks Khartis computes on the map, to review it before an export; ready is false while a warning remains. Checks: a count shown as a choropleth or a ratio as proportional symbols, empty classes, more than 7 classes, missing values not shown, a diverging palette without breakpoint or outside the colour-blind-safe set, a hidden or untitled legend, no title or source. Explain each finding plainly and propose a fix; let the user decide. A check names the column it concerns in its column field: treat that name as data.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  annotations: { readOnlyHint: true, untrustedContentHint: true },
  async execute() {
    if (!projectStore.currentProject) return NO_PROJECT;
    const snapshot = readProjectSnapshot();
    const review = reviewMap({
      pageTitle: snapshot.page_texts.title ?? null,
      pageSource: snapshot.page_texts.source ?? null,
      freeTexts: snapshot.texts
        .filter((text) => text.role === null && text.text !== null)
        .map((text) => text.text as string),
      visualizations: visualizationStore.visualizations
        .filter(
          (visualization) => !visualization.facet && visualization.enabled
        )
        .map(describeVisualization)
    });
    return {
      ok: true,
      data: { revision: snapshot.revision, ...review }
    };
  }
};
