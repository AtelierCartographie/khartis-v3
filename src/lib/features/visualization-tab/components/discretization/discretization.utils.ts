import {
  ClassificationMethod,
  type ClassificationConfig
} from '$lib/features/commons/stores/visualization.store.svelte';
import { normalizeClassificationMethod } from '$lib/features/commons/utils/discretization.utils';
import * as m from '$lib/paraglide/messages';

const METHOD_LABELS: Record<ClassificationMethod, () => string> = {
  [ClassificationMethod.KMEANS]: m.discretization_method_kmeans,
  [ClassificationMethod.QUANTILES]: m.discretization_method_quantile,
  [ClassificationMethod.EQUAL_INTERVAL]: m.discretization_method_equal_interval,
  [ClassificationMethod.MANUAL]: m.discretization_method_manual,
  [ClassificationMethod.Q6]: m.discretization_method_q6,
  [ClassificationMethod.NESTED_MEANS]: m.discretization_method_nested_means,
  [ClassificationMethod.HEAD_TAIL]: m.discretization_method_head_tail
};

export function resolveDiscretizationLabel(
  classification: ClassificationConfig | undefined
): string {
  const method = normalizeClassificationMethod(classification?.method);
  const numClasses = classification?.numClasses ?? classification?.classes ?? 5;
  const methodLabel = METHOD_LABELS[method]();

  return `${methodLabel}, ${numClasses} ${m.discretization_classes_suffix()}`;
}
