import { beforeEach, describe, expect, it } from 'vitest';
import { ANNOTATION_ROLE } from '$lib/features/commons/constants';
import {
  annotationsActions,
  getAnnotationsState
} from './annotations.store.svelte';

describe('annotations store', () => {
  beforeEach(() => {
    annotationsActions.reset();
  });

  it('preserves manually moved page elements when the layout is redistributed', () => {
    annotationsActions.initPageElements({ withPlaceholders: true });

    const title = getAnnotationsState().items.find(
      (item) => item.role === ANNOTATION_ROLE.TITLE
    );

    expect(title).toBeDefined();
    if (!title) {
      return;
    }

    annotationsActions.moveAnnotation(title.id, { x: 120, y: 168 });
    annotationsActions.redistributePageElements({
      width: 1200,
      height: 900,
      margins: {
        top: 40,
        right: 40,
        bottom: 40,
        left: 40
      }
    });

    const movedTitle = getAnnotationsState().items.find(
      (item) => item.id === title.id
    );

    expect(movedTitle?.position).toEqual({ x: 120, y: 168 });
    expect(movedTitle?.positionMode).toBe('manual');
  });
});
