import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/features/map/services/basemap.service.svelte', () => ({
  basemapService: {
    currentBasemap: null
  }
}));

import { AnnotationKind } from '$lib/features/commons/constants/ui.constants';
import { setLocale } from '$lib/paraglide/runtime.js';
import {
  annotationsActions,
  getAnnotationsState
} from '$lib/features/step-toolbar/tools/annotations/annotations.store.svelte';
import { formatActions } from '$lib/features/step-toolbar/tools/format/format.store.svelte';

describe('annotations store grid snapping', () => {
  beforeEach(() => {
    void setLocale('fr', { reload: false });
    formatActions.reset();
    annotationsActions.reset();
  });

  it('snaps annotation moves to the styling grid when enabled', () => {
    annotationsActions.addAnnotation(AnnotationKind.TEXT, 'Note');

    const annotationId = getAnnotationsState().items[0]?.id;

    expect(annotationId).toBeTruthy();

    annotationsActions.moveAnnotation(annotationId!, { x: 13, y: 37 });

    expect(getAnnotationsState().items[0]?.position).toEqual({
      x: 24,
      y: 48
    });
  });

  it('keeps free positioning when the styling grid is disabled', () => {
    annotationsActions.addAnnotation(AnnotationKind.TEXT, 'Note');
    formatActions.toggleGrid();

    const annotationId = getAnnotationsState().items[0]?.id;

    expect(annotationId).toBeTruthy();

    annotationsActions.moveAnnotation(annotationId!, { x: 13, y: 37 });

    expect(getAnnotationsState().items[0]?.position).toEqual({
      x: 13,
      y: 37
    });
  });

  it('refreshes default page placeholders when the locale changes', async () => {
    annotationsActions.initPageElements({
      withPlaceholders: true,
      visible: true
    });

    const titleBefore = getAnnotationsState().items.find(
      (item) => item.role === 'title'
    );
    const sourceBefore = getAnnotationsState().items.find(
      (item) => item.role === 'source'
    );
    const creditBefore = getAnnotationsState().items.find(
      (item) => item.role === 'credit'
    );

    expect(titleBefore?.content).toBe('Ajouter un titre');
    expect(sourceBefore?.content).toBe('Ajouter une source');
    expect(creditBefore?.content).toBe('Réalisé avec Khartis');

    await setLocale('en', { reload: false });
    annotationsActions.refreshPageElementPlaceholders();

    const titleAfter = getAnnotationsState().items.find(
      (item) => item.role === 'title'
    );
    const sourceAfter = getAnnotationsState().items.find(
      (item) => item.role === 'source'
    );
    const creditAfter = getAnnotationsState().items.find(
      (item) => item.role === 'credit'
    );

    expect(titleAfter?.content).toBe('Add a title');
    expect(sourceAfter?.content).toBe('Add a source');
    expect(creditAfter?.content).toBe('Made with Khartis');
  });
});
