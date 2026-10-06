import { beforeEach, describe, expect, it } from 'vitest';
import { projectionStore } from './projection.store.svelte';

const BBOX: [number, number, number, number] = [0, 0, 400, 200];

function modelScale(): number {
  return projectionStore.modelMatrix?.[0] ?? Number.NaN;
}

describe('projection store fit size', () => {
  beforeEach(() => {
    projectionStore.reset();
    projectionStore.setFitPadding(0);
  });

  it('keeps the model matrix fitted to its fit size when the canvas is resized', () => {
    projectionStore.updateCanvasSize({ width: 800, height: 400 });
    projectionStore.setReferenceBbox(BBOX, undefined, true);
    const fittedScale = modelScale();

    projectionStore.updateCanvasSize({ width: 400, height: 400 });

    expect(projectionStore.fitSize).toEqual({ width: 800, height: 400 });
    expect(modelScale()).toBe(fittedScale);
  });

  it('refits the model matrix only when a new fit size is set', () => {
    projectionStore.updateCanvasSize({ width: 800, height: 400 });
    projectionStore.setReferenceBbox(BBOX, undefined, true);

    projectionStore.updateCanvasSize({ width: 400, height: 400 });
    projectionStore.setFitSize({ width: 400, height: 400 });

    expect(modelScale()).toBe(1);
  });
});
