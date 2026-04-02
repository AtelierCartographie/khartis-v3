import type {
  GeometryType,
  VizSuggestion
} from '$lib/features/commons/services/viz-suggester.service';
import {
  visualizationStore,
  VisualizationType
} from '$lib/features/commons/store/visualization.store.svelte';

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
  dataset?: DatasetGeometrySource
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
