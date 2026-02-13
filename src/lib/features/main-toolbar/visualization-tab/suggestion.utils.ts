import { VisualizationType } from '$lib/features/commons/store/visualization.store.svelte';

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
    lines_proportional_colorful_QTR: VisualizationType.BIVARIATE
  };

  return mapping[suggestionId] ?? VisualizationType.CHOROPLETH;
}
