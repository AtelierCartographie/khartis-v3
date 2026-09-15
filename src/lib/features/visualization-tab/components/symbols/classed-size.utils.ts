import type { SymbolPrimitiveConfig } from '$lib/features/commons/stores/visualization.store.svelte';

/**
 * The size slider scales the whole class ramp. Pinning the smallest class to a
 * fixed size would leave it alone while every other class grows, turning a size
 * control into a contrast control, so the minimum follows the maximum and the
 * spread set at creation is preserved.
 */
export function scaleSymbolMinSize(
  symbol: Pick<SymbolPrimitiveConfig, 'minSize' | 'maxSize'> | undefined,
  nextMaxSize: number
): number | undefined {
  const previousMinSize = symbol?.minSize;
  const previousMaxSize = symbol?.maxSize;

  if (
    previousMinSize === undefined ||
    previousMaxSize === undefined ||
    previousMaxSize <= 0 ||
    nextMaxSize <= 0
  ) {
    return undefined;
  }

  return (previousMinSize * nextMaxSize) / previousMaxSize;
}
