import { describe, expect, it, vi } from 'vitest';
import { hexToRgb } from '$lib/features/commons/utils/color-utils';
import {
  createCategoricalColorAccessor,
  createStrokeClassificationAccessor
} from './layer-helpers';

vi.hoisted(() => {
  class WorkerMock {
    postMessage(): void {}

    terminate(): void {}

    addEventListener(): void {}

    removeEventListener(): void {}
  }

  vi.stubGlobal('Worker', WorkerMock);
});

describe('layer-helpers — disabled category labels', () => {
  it('hides disabled categorical labels instead of rendering them as missing data', () => {
    const accessor = createCategoricalColorAccessor(
      'segment',
      new Map([
        ['Actif', [242, 135, 172]],
        ['Pause', [0, 173, 146]]
      ]),
      [12, 34, 56],
      true,
      ['Pause']
    );

    expect(accessor({ segment: 'Actif' })).toEqual([242, 135, 172, 255]);
    expect(accessor({ segment: 'Pause' })).toEqual([0, 0, 0, 0]);
  });

  it('applies the same hidden behavior to stroke categorical classifications', () => {
    const accessor = createStrokeClassificationAccessor({
      strokeMode: 'categories',
      strokeClassification: {
        labels: ['Actif', 'Pause'],
        disabledLabels: ['Pause'],
        colors: ['#f287ac', '#00ad92']
      },
      categoryColumn: 'segment',
      fallbackLabels: [],
      missingColor: [12, 34, 56],
      showMissing: true,
      hexToRgb
    });

    expect(accessor).not.toBeNull();
    expect(accessor?.({ segment: 'Actif' })).toEqual([242, 135, 172, 255]);
    expect(accessor?.({ segment: 'Pause' })).toEqual([0, 0, 0, 0]);
  });
});
