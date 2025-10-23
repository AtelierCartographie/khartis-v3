import { hexToRgb } from './color.utils';
import type { VisualizationConfig } from '../../commons/store/visualization.store.svelte';
import { VisualizationType } from '../../commons/store/visualization.store.svelte';

export function getColorForValue(
  value: number,
  breaks: number[],
  colors: string[]
): [number, number, number] {
  if (breaks.length < 2 || colors.length === 0) {
    return [128, 128, 128];
  }

  for (let i = 0; i < breaks.length - 1; i++) {
    if (value >= breaks[i] && value < breaks[i + 1]) {
      return hexToRgb(colors[Math.min(i, colors.length - 1)]);
    }
  }

  return hexToRgb(colors[colors.length - 1]);
}

export function getSizeForValue(
  value: number,
  min: number,
  max: number,
  minSize: number,
  maxSize: number,
  scale: 'linear' | 'sqrt' | 'log' = 'linear'
): number {
  if (max === min) return (minSize + maxSize) / 2;

  const normalized = (value - min) / (max - min);

  switch (scale) {
    case 'sqrt':
      return minSize + Math.sqrt(normalized) * (maxSize - minSize);
    case 'log':
      return (
        minSize + (Math.log1p(normalized) / Math.log1p(1)) * (maxSize - minSize)
      );
    default:
      return minSize + normalized * (maxSize - minSize);
  }
}

export function getCategoricalColorMap(
  categories: string[],
  colors: string[]
): Map<string, [number, number, number]> {
  const colorMap = new Map<string, [number, number, number]>();

  categories.forEach((cat, i) => {
    const colorIndex = i % colors.length;
    colorMap.set(cat, hexToRgb(colors[colorIndex]));
  });

  return colorMap;
}

export function shouldApplyChoropleth(viz: VisualizationConfig): boolean {
  return (
    viz.type === VisualizationType.CHOROPLETH &&
    !!viz.mapping.valueColumn &&
    !!viz.classification?.breaks &&
    !!viz.classification?.colors &&
    viz.classification.breaks.length >= 2
  );
}

export function shouldApplyProportionalSymbols(
  viz: VisualizationConfig
): boolean {
  return (
    viz.type === VisualizationType.PROPORTIONAL &&
    !!viz.mapping.sizeColumn &&
    !!viz.symbols
  );
}

export function shouldApplyCategorical(viz: VisualizationConfig): boolean {
  return (
    viz.type === VisualizationType.CATEGORICAL &&
    !!viz.mapping.categoryColumn &&
    !!viz.classification?.colors &&
    viz.classification.colors.length > 0
  );
}
