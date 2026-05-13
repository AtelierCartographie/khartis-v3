import { describe, expect, it, vi } from 'vitest';
import { hexToRgb } from '$lib/features/commons/utils/color-utils';
import {
  createCategoricalColorAccessor,
  createGeoJsonCategoricalColorAccessor,
  createStrokeClassificationAccessor,
  withGeoJsonRowHighlightAccessor,
  withOpacityPreservingAlpha,
  withRowHighlightAccessor
} from './layer-helpers';
import { INTERNAL_COLUMN } from '$lib/features/commons/constants/data.constants';

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

  it('hides disabled GeoJSON categorical labels', () => {
    const accessor = createGeoJsonCategoricalColorAccessor(
      'segment',
      new Map([
        ['Actif', [242, 135, 172]],
        ['Pause', [0, 173, 146]]
      ]),
      [12, 34, 56],
      [12, 34, 56],
      true,
      ['Pause']
    );

    expect(accessor({ properties: { segment: 'Actif' } })).toEqual([
      242, 135, 172, 255
    ]);
    expect(accessor({ properties: { segment: 'Pause' } })).toEqual([
      0, 0, 0, 0
    ]);
  });

  it('keeps source alpha when applying a global opacity', () => {
    expect(withOpacityPreservingAlpha([12, 34, 56], 0.5)).toEqual([
      12, 34, 56, 128
    ]);
    expect(withOpacityPreservingAlpha([12, 34, 56, 0], 0.5)).toEqual([
      12, 34, 56, 0
    ]);
    expect(withOpacityPreservingAlpha([12, 34, 56, 128], 0.5)).toEqual([
      12, 34, 56, 64
    ]);
  });

  it('does not make hidden rows visible again when highlighting table rows', () => {
    const accessor = withRowHighlightAccessor(
      (row) => (row.hidden ? [0, 0, 0, 0] : [12, 34, 56, 255]),
      0.8,
      0.5,
      new Set([1])
    );

    expect(accessor({ [INTERNAL_COLUMN.ID]: 1, hidden: true })).toEqual([
      0, 0, 0, 0
    ]);
    expect(accessor({ [INTERNAL_COLUMN.ID]: 1 })).toEqual([12, 34, 56, 204]);
    expect(accessor({ [INTERNAL_COLUMN.ID]: 2 })).toEqual([12, 34, 56, 102]);
  });

  it('does not make hidden GeoJSON features visible again when highlighting', () => {
    const accessor = withGeoJsonRowHighlightAccessor(
      (feature) =>
        feature.properties?.hidden ? [0, 0, 0, 0] : [12, 34, 56, 255],
      0.8,
      0.5,
      new Set([1])
    );

    expect(
      accessor({ properties: { [INTERNAL_COLUMN.ID]: 1, hidden: true } })
    ).toEqual([0, 0, 0, 0]);
    expect(accessor({ properties: { [INTERNAL_COLUMN.ID]: 1 } })).toEqual([
      12, 34, 56, 204
    ]);
    expect(accessor({ properties: { [INTERNAL_COLUMN.ID]: 2 } })).toEqual([
      12, 34, 56, 102
    ]);
  });
});
