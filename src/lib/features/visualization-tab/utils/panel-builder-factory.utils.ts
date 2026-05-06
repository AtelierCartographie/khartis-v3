import type { VisualizationConfig } from '$lib/features/commons/stores/visualization.store.svelte';
import { FillMode } from '$lib/features/commons/constants/visualization.constants';

export type PanelBuilder = (
  visualization: VisualizationConfig | undefined
) => VisualizationConfig | undefined;

export interface PanelSpec<P> {
  getPrimitive: (visualization: VisualizationConfig) => P | undefined;
  build: (
    visualization: VisualizationConfig,
    primitive: P
  ) => VisualizationConfig;
}

export function extractStrokeColor(
  strokeColor: string | string[] | undefined
): string | undefined {
  return Array.isArray(strokeColor) ? strokeColor[0] : strokeColor;
}

export function applyFillModeOpacity(
  fillMode: FillMode | undefined,
  opacity: number
): number {
  return fillMode === FillMode.NONE ? 0 : opacity;
}

export function createPanelBuilder<P>(spec: PanelSpec<P>): PanelBuilder {
  const cache = new WeakMap<
    VisualizationConfig,
    VisualizationConfig | undefined
  >();
  return (visualization) => {
    if (!visualization) return undefined;
    if (cache.has(visualization)) return cache.get(visualization);
    const primitive = spec.getPrimitive(visualization);
    if (!primitive) {
      cache.set(visualization, undefined);
      return undefined;
    }
    const result = spec.build(visualization, primitive);
    cache.set(visualization, result);
    return result;
  };
}
