import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  AnnotationKind,
  DrawingType
} from '$lib/features/commons/constants/ui.constants';
import * as m from '$lib/paraglide/messages';
import DrawingTool from './drawing-tool.svelte';
import {
  annotationsActions,
  getAnnotationsState
} from './annotations.store.svelte';

describe('drawing tool', () => {
  beforeEach(() => {
    annotationsActions.reset();
  });

  it('does not silently convert the selected drawing when changing the next drawing type', async () => {
    annotationsActions.addAnnotation(AnnotationKind.DRAWING, DrawingType.LINE);

    const lineDrawing = getAnnotationsState().items.find(
      (item) => item.type === AnnotationKind.DRAWING
    );

    expect(lineDrawing).toBeDefined();

    render(DrawingTool);

    await fireEvent.click(
      screen.getByRole('radio', { name: m.annotations_drawing_area() })
    );

    const currentState = getAnnotationsState();
    const storedLineDrawing = currentState.items.find(
      (item) => item.id === lineDrawing?.id
    );

    expect(currentState.selectedId).toBeNull();
    expect(storedLineDrawing?.style?.drawingType).toBe(DrawingType.LINE);
    expect(currentState.defaultStyle.drawingType).toBe(DrawingType.ZONE);
  });
});
