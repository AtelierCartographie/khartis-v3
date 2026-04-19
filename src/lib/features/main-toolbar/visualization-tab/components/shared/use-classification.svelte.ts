import {
  visualizationStore,
  type ClassificationConfig,
  type PrimitiveFilter
} from '$lib/features/commons/store/visualization.store.svelte';

export type ClassificationRole = 'fill' | 'stroke';

export interface ClassificationHandle {
  update(updates: Partial<ClassificationConfig>): void;
}

/**
 * Returns an isolated classification updater for a primitive role.
 * `role` is captured at construction time; a handle cannot be reused to
 * mutate the opposite role, which prevents fill↔stroke palette leaks.
 */
export function useClassification(
  vizId: () => string | undefined,
  primitive: () => PrimitiveFilter,
  role: ClassificationRole
): ClassificationHandle {
  return {
    update(updates: Partial<ClassificationConfig>): void {
      const id = vizId();
      if (!id) return;
      const targetPrimitive = primitive();
      if (role === 'fill') {
        visualizationStore.updatePrimitiveClassification(
          id,
          targetPrimitive,
          updates
        );
      } else {
        visualizationStore.updatePrimitiveStrokeClassification(
          id,
          targetPrimitive,
          updates
        );
      }
    }
  };
}
