import type { ClassificationConfig } from '$lib/features/commons/store/visualization.store.svelte';
import { CLASSIFICATION_BREAKS_TRIGGER } from './use-classification-breaks.svelte';

export type BreaksTrigger =
  (typeof CLASSIFICATION_BREAKS_TRIGGER)[keyof typeof CLASSIFICATION_BREAKS_TRIGGER];

export interface BreaksTriggerCandidate {
  usesBreaks: boolean;
  valueColumn: string | undefined;
  classification: ClassificationConfig | undefined;
}

export function resolveBreaksTrigger(
  target: BreaksTriggerCandidate
): BreaksTrigger | null {
  if (!target.usesBreaks || !target.valueColumn) return null;
  if (!target.classification?.method) return null;
  if (!target.classification.breaks?.length) {
    return CLASSIFICATION_BREAKS_TRIGGER.MISSING_BREAKS;
  }
  if (target.classification.numClasses) {
    return CLASSIFICATION_BREAKS_TRIGGER.CLASSIFICATION_PARAMS_CHANGED;
  }
  return null;
}

export interface CategoryLabelsTarget {
  classification?: ClassificationConfig;
  usesCategories: boolean;
  categoryColumn?: string;
}

export function shouldFetchCategoryLabels(
  target: CategoryLabelsTarget | null | undefined
): target is {
  classification?: ClassificationConfig;
  usesCategories: true;
  categoryColumn: string;
} {
  if (!target?.usesCategories || !target.categoryColumn) return false;
  const hasLabels = (target.classification?.labels?.length ?? 0) > 0;
  return !hasLabels;
}
