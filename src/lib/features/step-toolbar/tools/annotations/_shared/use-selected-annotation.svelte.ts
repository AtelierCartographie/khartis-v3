import type { AnnotationKind } from '$lib/features/commons/constants/ui.constants';
import type { Annotation } from '../annotations.types';
import { getAnnotationsState } from '../annotations.store.svelte';

export function useSelectedAnnotationByType(kind: AnnotationKind) {
  const state = $derived(getAnnotationsState());
  const selected = $derived.by<Annotation | null>(() => {
    const selId = state.selectedId;
    if (!selId) return null;
    const item = state.items.find((i) => i.id === selId);
    return item && item.type === kind ? item : null;
  });

  return {
    get selected() {
      return selected;
    }
  };
}
