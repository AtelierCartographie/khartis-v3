import type { datasetsStore } from '$lib/features/commons/stores/datasets.store.svelte';
import { SEMIO_TYPES } from '$lib/features/commons/utils/semio-detector.utils';
import { computeColumnSemioTypes } from '$lib/features/visualization-tab';
import type { ColumnNature } from '../contract/types';

// The words the engine's semiology types stand for, for the agent.
const COLUMN_NATURES: Record<string, ColumnNature> = {
  [SEMIO_TYPES.QTA]: 'count',
  [SEMIO_TYPES.QTR]: 'ratio',
  [SEMIO_TYPES.QL]: 'category',
  [SEMIO_TYPES.QLO]: 'ordered_category',
  [SEMIO_TYPES.LABEL]: 'label',
  [SEMIO_TYPES.GEOID]: 'place_id',
  [SEMIO_TYPES.GEOLAT]: 'latitude',
  [SEMIO_TYPES.GEOLON]: 'longitude'
};

export function toColumnNature(semioType: string | undefined) {
  return semioType ? COLUMN_NATURES[semioType] : undefined;
}

/** The nature the engine gives each column of a dataset. */
export function listColumnNatures(
  dataset: (typeof datasetsStore.datasets)[number]
): Map<string, ColumnNature> {
  const natures = new Map<string, ColumnNature>();
  for (const [column, semioType] of computeColumnSemioTypes(dataset)) {
    const nature = toColumnNature(semioType);
    if (nature) natures.set(column, nature);
  }
  return natures;
}
