import type { ClassificationConfig } from '$lib/features/commons/stores/visualization.store.svelte';

export function resetVisualClassification(): Partial<ClassificationConfig> {
  return {
    colors: undefined,
    paletteId: undefined,
    inverted: false,
    patternId: undefined,
    patternParams: undefined,
    pattern: undefined,
    labels: undefined
  };
}

export function resetCategoryVisualClassification(): Partial<ClassificationConfig> {
  return {
    ...resetVisualClassification(),
    disabledLabels: undefined,
    breaks: undefined,
    counts: undefined
  };
}
