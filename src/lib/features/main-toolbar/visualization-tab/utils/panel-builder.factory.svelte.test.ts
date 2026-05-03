import { describe, expect, it } from 'vitest';
import type { VisualizationConfig } from '$lib/features/commons/store/visualization.store.svelte';
import { FillMode } from '../../constants';
import {
  applyFillModeOpacity,
  createPanelBuilder,
  extractStrokeColor
} from './panel-builder.factory';

const makeViz = (id = 'viz-1') =>
  ({
    id,
    style: {},
    mapping: {},
    modes: {},
    type: 'choropleth'
  }) as unknown as VisualizationConfig;

describe('extractStrokeColor', () => {
  it('returns a single string unchanged', () => {
    expect(extractStrokeColor('#abc')).toBe('#abc');
  });

  it('returns the first element of an array', () => {
    expect(extractStrokeColor(['#abc', '#def'])).toBe('#abc');
  });

  it('returns undefined when input is undefined', () => {
    expect(extractStrokeColor(undefined)).toBeUndefined();
  });
});

describe('applyFillModeOpacity', () => {
  it('returns 0 when fillMode is NONE', () => {
    expect(applyFillModeOpacity(FillMode.NONE, 0.8)).toBe(0);
  });

  it('returns the given opacity for UNIQUE fillMode', () => {
    expect(applyFillModeOpacity(FillMode.UNIQUE, 0.8)).toBe(0.8);
  });

  it('returns the given opacity for CLASSES fillMode', () => {
    expect(applyFillModeOpacity(FillMode.CLASSES, 0.5)).toBe(0.5);
  });

  it('returns the given opacity when fillMode is undefined', () => {
    expect(applyFillModeOpacity(undefined, 0.6)).toBe(0.6);
  });
});

describe('createPanelBuilder', () => {
  it('returns the same reference when called twice with the same input', () => {
    const viz = makeViz();
    const builder = createPanelBuilder({
      getPrimitive: (v) => ({ value: v.id }),
      build: (v, p) =>
        ({ ...v, mapping: { valueColumn: p.value } }) as VisualizationConfig
    });
    expect(builder(viz)).toBe(builder(viz));
  });

  it('returns different references for different inputs', () => {
    const builder = createPanelBuilder({
      getPrimitive: (v) => ({ value: v.id }),
      build: (v, p) =>
        ({ ...v, mapping: { valueColumn: p.value } }) as VisualizationConfig
    });
    expect(builder(makeViz('a'))).not.toBe(builder(makeViz('b')));
  });

  it('returns undefined when visualization is undefined', () => {
    const builder = createPanelBuilder({
      getPrimitive: () => ({}),
      build: (v) => v
    });
    expect(builder(undefined)).toBeUndefined();
  });

  it('caches undefined when getPrimitive returns undefined', () => {
    const viz = makeViz();
    let callCount = 0;
    const builder = createPanelBuilder({
      getPrimitive: () => {
        callCount++;
        return undefined;
      },
      build: (v) => v
    });
    expect(builder(viz)).toBeUndefined();
    expect(builder(viz)).toBeUndefined();
    expect(callCount).toBe(1);
  });

  it('transforms visualization using spec.build', () => {
    const viz = makeViz();
    const builder = createPanelBuilder({
      getPrimitive: () => ({ col: 'population' }),
      build: (v, p) =>
        ({ ...v, mapping: { valueColumn: p.col } }) as VisualizationConfig
    });
    expect(builder(viz)?.mapping?.valueColumn).toBe('population');
  });
});
