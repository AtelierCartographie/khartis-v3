import {
  PrimitiveFilterType,
  getLinePrimitive,
  getPolygonPrimitive,
  getSymbolPrimitive,
  getTextPrimitive,
  type LinePrimitiveConfig,
  type PolygonPrimitiveConfig,
  type PrimitiveFilter,
  type SymbolPrimitiveConfig,
  type TextPrimitiveConfig,
  type VisualizationConfig
} from '$lib/features/commons/stores/visualization.store.svelte';
import {
  DEFAULT_COLORS,
  FillMode,
  VISUALIZATION_DEFAULTS
} from '$lib/features/commons/constants/visualization.constants';

export interface UsePrimitiveVisibilityDeps {
  getSelectedVisualization: () => VisualizationConfig | undefined;
  handleSymbolChange(updates: Partial<SymbolPrimitiveConfig>): void;
  handleLineChange(updates: Partial<LinePrimitiveConfig>): void;
  handlePolygonChange(updates: Partial<PolygonPrimitiveConfig>): void;
  handleTextChange(updates: Partial<TextPrimitiveConfig>): void;
}

export function usePrimitiveVisibility(deps: UsePrimitiveVisibilityDeps) {
  function handleTextVisibilityChange(visible: boolean): void {
    const text = getTextPrimitive(deps.getSelectedVisualization());
    if (!text) return;

    deps.handleTextChange({
      enabled: visible,
      opacity:
        visible && text.opacity <= 0
          ? VISUALIZATION_DEFAULTS.textOpacity / 100
          : text.opacity
    });
  }

  function handlePrimitiveVisibilityChange(
    primitive: PrimitiveFilter,
    visible: boolean
  ): void {
    const viz = deps.getSelectedVisualization();
    switch (primitive) {
      case PrimitiveFilterType.POINT: {
        const symbol = getSymbolPrimitive(viz);
        if (!symbol || symbol.enabled === visible) return;
        deps.handleSymbolChange({
          enabled: visible,
          opacity:
            visible && symbol.opacity <= 0
              ? VISUALIZATION_DEFAULTS.symbolOpacity / 100
              : symbol.opacity,
          fillColor: symbol.fillColor ?? DEFAULT_COLORS.fill,
          strokeColor: symbol.strokeColor ?? DEFAULT_COLORS.gray
        });
        return;
      }
      case PrimitiveFilterType.LINE: {
        const line = getLinePrimitive(viz);
        if (!line || line.enabled === visible) return;
        deps.handleLineChange({
          enabled: visible,
          opacity:
            visible && line.opacity <= 0
              ? VISUALIZATION_DEFAULTS.lineOpacity / 100
              : line.opacity,
          color: line.color ?? DEFAULT_COLORS.gray
        });
        return;
      }
      case PrimitiveFilterType.POLYGON: {
        const polygon = getPolygonPrimitive(viz);
        if (!polygon || polygon.enabled === visible) return;
        deps.handlePolygonChange({
          enabled: visible,
          fillOpacity:
            visible &&
            polygon.fillMode !== FillMode.NONE &&
            polygon.fillOpacity <= 0
              ? VISUALIZATION_DEFAULTS.fillOpacity / 100
              : polygon.fillOpacity,
          strokeColor:
            (Array.isArray(polygon.strokeColor)
              ? polygon.strokeColor[0]
              : polygon.strokeColor) ?? DEFAULT_COLORS.gray
        });
      }
    }
  }

  return {
    handleTextVisibilityChange,
    handlePrimitiveVisibilityChange
  };
}
