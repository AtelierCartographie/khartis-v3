import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/features/map/services/basemap.service.svelte', () => ({
  basemapService: {
    currentBasemap: null
  }
}));

import { AnnotationKind } from '$lib/features/commons/constants/ui.constants';
import {
  annotationsActions,
  getAnnotationsState
} from '$lib/features/step-toolbar/tools/annotations/annotations.store.svelte';
import { formatActions } from '$lib/features/step-toolbar/tools/format/format.store.svelte';

describe('annotations store grid snapping', () => {
  beforeEach(() => {
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
});
