import type { VisualizationConfig } from '$lib/features/commons/stores/visualization.types';
import { datasetsStore } from '$lib/features/commons/stores/datasets.store.svelte';
import {
  ProportionalType,
  SymbolMode
} from '$lib/features/commons/constants/visualization.constants';

export const SYMBOL_SIGN_LABELS = {
  POSITIVE: '+',
  NEGATIVE: '−'
} as const;

/** Positive then negative: the pair the symbol legend drew before the map followed the sign. */
export const DEFAULT_SYMBOL_SIGN_COLORS: readonly [string, string] = [
  '#ff7f50',
  '#5f9ea0'
];

function toFiniteNumber(value: unknown): number | null {
  const parsed = typeof value === 'bigint' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null;
}

/**
 * A single proportional symbol whose size column holds both signs. Size
 * draws the absolute value, so the fill is the only channel left to tell a
 * positive symbol from a negative one: it follows the sign whatever fill
 * mode is stored. Judged on the whole column, so a filter never changes it.
 */
export function isSignedProportionalSymbol(
  visualization: VisualizationConfig | null | undefined
): boolean {
  const symbol = visualization?.symbol;
  if (
    !visualization?.datasetId ||
    !symbol ||
    symbol.mode !== SymbolMode.PROPORTIONAL ||
    symbol.proportionalType === ProportionalType.DOUBLE
  ) {
    return false;
  }

  const column = symbol.sizeColumn ?? visualization.mapping.sizeColumn;
  if (!column) {
    return false;
  }

  const statistics = datasetsStore.getColumnStatistics(
    visualization.datasetId,
    column
  );
  const min =
    statistics && 'min' in statistics ? toFiniteNumber(statistics.min) : null;
  const max =
    statistics && 'max' in statistics ? toFiniteNumber(statistics.max) : null;
  return min !== null && max !== null && min < 0 && max > 0;
}

export function resolveSymbolSignColors(
  visualization: VisualizationConfig | null | undefined
): [string, string] {
  const colors: unknown = visualization?.symbol?.signColors;
  if (
    Array.isArray(colors) &&
    colors.length === 2 &&
    colors.every((color) => typeof color === 'string' && color.length > 0)
  ) {
    return [colors[0], colors[1]];
  }
  return [...DEFAULT_SYMBOL_SIGN_COLORS];
}
