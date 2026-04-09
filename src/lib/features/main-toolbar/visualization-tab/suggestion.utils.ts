import type {
  GeometryType,
  VizSuggestion
} from '$lib/features/commons/services/viz-suggester.service';
import {
  type VisualizationConfig,
  visualizationStore,
  VisualizationType
} from '$lib/features/commons/store/visualization.store.svelte';
import {
  ColorMode,
  FillMode,
  ProportionalType,
  SizeMode,
  StrokeMode
} from '$lib/features/main-toolbar/constants';
import {
  getLegendState,
  legendActions
} from '$lib/features/step-toolbar/tools/legend/legend.store.svelte';

import { projectStore } from '$lib/features/commons/store/project.store.svelte';
import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';

interface DatasetGeometrySource {
  id?: string;
  geometry?: { type?: string | null };
  sourceFileId?: string;
  joinedBasemap?: string;
  gpsMode?: boolean;
  geoDetection?: {
    geoColumns?: Array<{ type?: string }>;
  };
}

export function resolveDatasetGeometryType(
  dataset?: DatasetGeometrySource | null
): GeometryType | null {
  if (!dataset) {
    return null;
  }

  const rawGeometry = dataset.geometry?.type;
  if (typeof rawGeometry === 'string' && rawGeometry.length > 0) {
    return rawGeometry as GeometryType;
  }

  // Check dataset-level join info first (available on DatasetResult)
  if (dataset.gpsMode) {
    return 'Point';
  }
  if (dataset.joinedBasemap) {
    return 'Polygon';
  }

  // Check geoDetection for auto-detected GPS columns (before join finalization)
  if (dataset.geoDetection?.geoColumns) {
    const hasLat = dataset.geoDetection.geoColumns.some(
      (c) => c.type === 'latitude'
    );
    const hasLon = dataset.geoDetection.geoColumns.some(
      (c) => c.type === 'longitude'
    );
    if (hasLat && hasLon) {
      return 'Point';
    }
  }

  if (!dataset.sourceFileId) {
    return null;
  }

  // Fallback 1: check orchestrator state (DuckDBDataset)
  const duckDataset = duckDBOrchestrator.getDatasetBySourceFile(
    dataset.sourceFileId
  );
  if (duckDataset) {
    if (duckDataset.gpsMode) {
      return 'Point';
    }
    if (duckDataset.joinedBasemap) {
      return 'Polygon';
    }
  }

  // Fallback 2: check project source files (UploadedFile persistence)
  const sourceFile = projectStore.currentProject?.data?.sourceFiles?.find(
    (f) => f.id === dataset.sourceFileId
  );
  if (sourceFile) {
    if (sourceFile.gpsMode) {
      return 'Point';
    }
    if (sourceFile.joinedBasemap) {
      return 'Polygon';
    }
  }

  // Fallback 3: infer from existing visualizations on this dataset
  const datasetId = (dataset as { id?: string }).id;
  if (datasetId) {
    const vizs = visualizationStore.getVisualizationsByDataset(datasetId);
    if (vizs.length > 0) {
      const vizType = vizs[0].type;
      if (
        vizType === VisualizationType.CHOROPLETH ||
        vizType === VisualizationType.CATEGORICAL
      ) {
        return 'Polygon';
      }
      if (vizType === VisualizationType.PROPORTIONAL) {
        return 'Point';
      }
    }
  }

  return null;
}

export function mapSuggestionToType(suggestionId: string): VisualizationType {
  const mapping: Record<string, VisualizationType> = {
    // 0-column suggestions (basic geometries)
    symbols_uniques: VisualizationType.PROPORTIONAL,
    polygons_uniques: VisualizationType.CHOROPLETH,
    lines_uniques: VisualizationType.CHOROPLETH,

    // QTR (quantitative ratio) -> CHOROPLETH
    choropleth: VisualizationType.CHOROPLETH,
    symbols_uniques_colorful_QTR: VisualizationType.CHOROPLETH,
    lines_colorful_QTR: VisualizationType.CHOROPLETH,

    // QTA (quantitative absolute) -> PROPORTIONAL
    symbols_proportional: VisualizationType.PROPORTIONAL,
    lines_proportional: VisualizationType.PROPORTIONAL,

    // QL (qualitative) -> CATEGORICAL
    polygons_colorful_QL: VisualizationType.CATEGORICAL,
    symbols_differents: VisualizationType.CATEGORICAL,
    symbols_uniques_colorful_QL: VisualizationType.CATEGORICAL,
    lines_colorful_QL: VisualizationType.CATEGORICAL,

    // QLO (qualitative ordered) -> CATEGORICAL
    polygons_colorful_QLO: VisualizationType.CATEGORICAL,
    symbols_differents_QLO: VisualizationType.CATEGORICAL,
    symbols_uniques_colorful_QLO: VisualizationType.CATEGORICAL,
    lines_colorful_QLO: VisualizationType.CATEGORICAL,

    // 2-column combinations -> BIVARIATE
    symbols_proportional_colorful_QL: VisualizationType.BIVARIATE,
    symbols_proportional_colorful_QTR: VisualizationType.BIVARIATE,
    symbols_proportional_double: VisualizationType.BIVARIATE,
    lines_proportional_colorful_QL: VisualizationType.BIVARIATE,
    lines_proportional_colorful_QTR: VisualizationType.BIVARIATE,

    // Text combinations -> BIVARIATE
    texts_colorful_QL: VisualizationType.BIVARIATE,
    texts_colorful_QTR: VisualizationType.BIVARIATE,
    texts_proportional: VisualizationType.BIVARIATE
  };

  return mapping[suggestionId] ?? VisualizationType.CHOROPLETH;
}

export function resolveBlankVisualizationType(
  dataset?: DatasetGeometrySource | null
): VisualizationType {
  const geometryType = resolveDatasetGeometryType(dataset);

  if (geometryType?.toLowerCase().includes('point')) {
    return VisualizationType.PROPORTIONAL;
  }

  return VisualizationType.CHOROPLETH;
}

export function resolveNextSuggestionSelection(
  currentSuggestionId: string | undefined,
  nextSuggestionId: string
): string | undefined {
  return currentSuggestionId === nextSuggestionId
    ? undefined
    : nextSuggestionId;
}

export function applySuggestionMapping(
  vizId: string,
  vizType: VisualizationType,
  suggestion: VizSuggestion
): void {
  if (!suggestion.columns || suggestion.columns.length === 0) {
    return;
  }

  const column = suggestion.columns[0];
  const mappingUpdate: Record<string, string> = {};

  switch (vizType) {
    case VisualizationType.CHOROPLETH:
      mappingUpdate.valueColumn = column;
      break;
    case VisualizationType.PROPORTIONAL:
      mappingUpdate.sizeColumn = column;
      break;
    case VisualizationType.CATEGORICAL:
      mappingUpdate.categoryColumn = column;
      break;
    case VisualizationType.BIVARIATE:
      mappingUpdate.sizeColumn = column;
      if (suggestion.columns.length > 1) {
        mappingUpdate.valueColumn = suggestion.columns[1];
      }
      break;
  }

  const viz = visualizationStore.visualizations.find((v) => v.id === vizId);
  if (!viz) return;

  visualizationStore.updateVisualization(vizId, {
    mapping: { ...viz.mapping, ...mappingUpdate }
  });
}

function getLegendSubtitleForVisualization(
  visualization: VisualizationConfig
): string {
  if (visualization.modes?.fill === FillMode.CATEGORIES) {
    return visualization.mapping.categoryColumn ?? '';
  }

  return (
    visualization.mapping.valueColumn ??
    visualization.mapping.sizeColumn ??
    visualization.mapping.categoryColumn ??
    visualization.mapping.colorColumn ??
    ''
  );
}

function syncLegendSubtitleAfterSuggestion(
  vizId: string,
  previousAutoSubtitle: string,
  visualization: VisualizationConfig
): void {
  const legendItem = getLegendState().items.find(
    (item) => item.variableId === vizId
  );
  if (!legendItem) {
    return;
  }

  const nextAutoSubtitle = getLegendSubtitleForVisualization(visualization);
  const usesAutomaticSubtitle =
    !legendItem.subtitle || legendItem.subtitle === previousAutoSubtitle;

  if (!usesAutomaticSubtitle || legendItem.subtitle === nextAutoSubtitle) {
    return;
  }

  legendActions.updateLegendItem(legendItem.id, {
    subtitle: nextAutoSubtitle,
    subtitleMode: 'auto'
  });
}

function buildSuggestionUpdate(
  visualization: VisualizationConfig,
  suggestion: VizSuggestion,
  vizType: VisualizationType
): Partial<VisualizationConfig> | null {
  const columns = suggestion.columns ?? [];
  const primaryColumn = columns[0];
  const secondaryColumn = columns[1];

  if (!primaryColumn && columns.length === 0) {
    return null;
  }

  const mappingUpdate: Partial<VisualizationConfig['mapping']> = {};
  const modesUpdate: Partial<VisualizationConfig['modes']> = {};
  const styleUpdate: Partial<VisualizationConfig['style']> = {};

  switch (suggestion.id) {
    case 'choropleth':
    case 'symbols_uniques_colorful_QTR':
    case 'lines_colorful_QTR':
      if (primaryColumn) {
        mappingUpdate.valueColumn = primaryColumn;
      }
      mappingUpdate.sizeColumn = undefined;
      mappingUpdate.categoryColumn = undefined;
      break;

    case 'symbols_proportional':
    case 'lines_proportional':
      if (primaryColumn) {
        mappingUpdate.sizeColumn = primaryColumn;
      }
      mappingUpdate.valueColumn = undefined;
      mappingUpdate.categoryColumn = undefined;
      break;

    case 'polygons_colorful_QL':
    case 'polygons_colorful_QLO':
    case 'symbols_differents':
    case 'symbols_uniques_colorful_QL':
    case 'symbols_differents_QLO':
    case 'symbols_uniques_colorful_QLO':
    case 'lines_colorful_QL':
    case 'lines_colorful_QLO':
      if (primaryColumn) {
        mappingUpdate.categoryColumn = primaryColumn;
      }
      mappingUpdate.sizeColumn = undefined;
      mappingUpdate.valueColumn = undefined;
      break;

    case 'symbols_proportional_colorful_QL':
    case 'lines_proportional_colorful_QL':
      if (primaryColumn) {
        mappingUpdate.sizeColumn = primaryColumn;
      }
      if (secondaryColumn) {
        mappingUpdate.categoryColumn = secondaryColumn;
      }
      mappingUpdate.valueColumn = undefined;
      modesUpdate.fill = FillMode.CATEGORIES;
      modesUpdate.proportionalType = ProportionalType.SINGLE;
      break;

    case 'symbols_proportional_colorful_QTR':
    case 'lines_proportional_colorful_QTR':
      if (primaryColumn) {
        mappingUpdate.sizeColumn = primaryColumn;
      }
      if (secondaryColumn) {
        mappingUpdate.valueColumn = secondaryColumn;
      }
      mappingUpdate.categoryColumn = undefined;
      modesUpdate.fill = FillMode.CLASSES;
      modesUpdate.proportionalType = ProportionalType.SINGLE;
      break;

    case 'symbols_proportional_double':
      if (primaryColumn) {
        mappingUpdate.sizeColumn = primaryColumn;
      }
      if (secondaryColumn) {
        mappingUpdate.valueColumn = secondaryColumn;
      }
      mappingUpdate.categoryColumn = undefined;
      modesUpdate.fill = FillMode.UNIQUE;
      modesUpdate.stroke = StrokeMode.UNIQUE;
      modesUpdate.proportionalType = ProportionalType.DOUBLE;
      styleUpdate.fillColorB = visualization.style.fillColorB ?? '#ff832b';
      break;

    case 'texts_colorful_QL':
      if (primaryColumn) {
        mappingUpdate.labelColumn = primaryColumn;
      }
      if (secondaryColumn) {
        mappingUpdate.categoryColumn = secondaryColumn;
      }
      mappingUpdate.secondaryLabelColumn = undefined;
      mappingUpdate.sizeColumn = undefined;
      mappingUpdate.valueColumn = undefined;
      modesUpdate.fill = FillMode.CATEGORIES;
      modesUpdate.color = ColorMode.CATEGORIES;
      modesUpdate.size = SizeMode.FIXED;
      styleUpdate.textOpacity = 1;
      styleUpdate.labelOpacity = 0;
      styleUpdate.fillOpacity = 0;
      styleUpdate.strokeOpacity = 0;
      break;

    case 'texts_colorful_QTR':
      if (primaryColumn) {
        mappingUpdate.labelColumn = primaryColumn;
      }
      if (secondaryColumn) {
        mappingUpdate.valueColumn = secondaryColumn;
      }
      mappingUpdate.secondaryLabelColumn = undefined;
      mappingUpdate.sizeColumn = undefined;
      mappingUpdate.categoryColumn = undefined;
      modesUpdate.fill = FillMode.CLASSES;
      modesUpdate.color = ColorMode.CLASSES;
      modesUpdate.size = SizeMode.FIXED;
      styleUpdate.textOpacity = 1;
      styleUpdate.labelOpacity = 0;
      styleUpdate.fillOpacity = 0;
      styleUpdate.strokeOpacity = 0;
      break;

    case 'texts_proportional':
      if (primaryColumn) {
        mappingUpdate.labelColumn = primaryColumn;
      }
      if (secondaryColumn) {
        mappingUpdate.sizeColumn = secondaryColumn;
      }
      mappingUpdate.secondaryLabelColumn = undefined;
      mappingUpdate.valueColumn = undefined;
      mappingUpdate.categoryColumn = undefined;
      modesUpdate.fill = FillMode.UNIQUE;
      modesUpdate.color = ColorMode.UNIQUE;
      modesUpdate.size = SizeMode.PROPORTIONAL;
      styleUpdate.textOpacity = 1;
      styleUpdate.labelOpacity = 0;
      styleUpdate.fillOpacity = 0;
      styleUpdate.strokeOpacity = 0;
      break;

    default:
      applySuggestionMapping(visualization.id, vizType, suggestion);
      return null;
  }

  return {
    mapping: {
      ...visualization.mapping,
      ...mappingUpdate
    },
    modes: {
      ...visualization.modes,
      ...modesUpdate
    },
    style: {
      ...visualization.style,
      ...styleUpdate
    }
  };
}

export function applySuggestionToVisualization(
  vizId: string,
  suggestion: VizSuggestion
): VisualizationType | null {
  const currentVisualization = visualizationStore.visualizations.find(
    (item) => item.id === vizId
  );
  const previousAutoSubtitle = currentVisualization
    ? getLegendSubtitleForVisualization(currentVisualization)
    : '';
  const vizType = mapSuggestionToType(suggestion.id);
  visualizationStore.applyVisualizationPreset(vizId, vizType);

  const visualization = visualizationStore.visualizations.find(
    (item) => item.id === vizId
  );
  if (!visualization) {
    return null;
  }

  const suggestionUpdate = buildSuggestionUpdate(
    visualization,
    suggestion,
    vizType
  );

  if (suggestionUpdate) {
    visualizationStore.updateVisualization(vizId, suggestionUpdate);
  } else {
    applySuggestionMapping(vizId, vizType, suggestion);
  }

  const updatedVisualization = visualizationStore.visualizations.find(
    (item) => item.id === vizId
  );
  if (updatedVisualization) {
    syncLegendSubtitleAfterSuggestion(
      vizId,
      previousAutoSubtitle,
      updatedVisualization
    );
  }

  return vizType;
}
