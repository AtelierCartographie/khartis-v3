import type { ClassificationConfig } from '$lib/features/commons/stores/visualization.store.svelte';
import {
  createLineHandlers,
  type LineHandlersDeps
} from './line-handlers.svelte';
import {
  createPolygonHandlers,
  type PolygonHandlersDeps
} from './polygon-handlers.svelte';
import {
  createSymbolHandlers,
  type SymbolHandlersDeps
} from './symbol-handlers.svelte';
import {
  createTextHandlers,
  type TextHandlersDeps
} from './text-handlers.svelte';

export type SharedAdapterDeps = SymbolHandlersDeps &
  PolygonHandlersDeps &
  LineHandlersDeps &
  TextHandlersDeps;

export type PrimitiveAdaptersDeps = SharedAdapterDeps & {
  applyStrokePolygonClassificationUpdate: (
    updates: Partial<ClassificationConfig>
  ) => void;
};

export function usePrimitiveAdapters(deps: PrimitiveAdaptersDeps) {
  const polygon = createPolygonHandlers(deps);
  const symbol = createSymbolHandlers(deps);
  const line = createLineHandlers(deps);
  const text = createTextHandlers(deps);

  function handlePolygonStrokeClassificationChange(
    updates: Partial<ClassificationConfig>
  ): void {
    deps.applyStrokePolygonClassificationUpdate(updates);
  }

  return {
    ...polygon,
    ...symbol,
    ...line,
    ...text,
    handlePolygonStrokeClassificationChange
  } satisfies Record<string, unknown>;
}

export type PrimitiveAdapters = ReturnType<typeof usePrimitiveAdapters>;
