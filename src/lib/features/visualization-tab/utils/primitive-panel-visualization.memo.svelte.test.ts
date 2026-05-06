import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/features/commons/stores/visualization.store.svelte', () => ({
  getEnabledPrimitiveFilters: vi.fn(() => []),
  getLinePrimitive: vi.fn((viz) => viz?.line),
  getPolygonPrimitive: vi.fn((viz) => viz?.polygon),
  getSymbolPrimitive: vi.fn((viz) => viz?.symbol),
  getTextPrimitive: vi.fn((viz) => viz?.text)
}));

import {
  buildLinePanelVisualization,
  buildPolygonPanelVisualization,
  buildSymbolFillPanelVisualization,
  buildSymbolPanelVisualization,
  buildTextBackgroundPanelVisualization,
  buildTextPanelVisualization
} from './primitive-panel-visualization.utils';

const makeViz = () =>
  ({
    id: 'viz-1',
    type: 'symbols',
    primitiveFilters: [],
    style: {},
    mapping: {},
    modes: {},
    polygon: {
      enabled: true,
      fillMode: 'unique',
      fillColor: '#abc',
      fillOpacity: 1,
      strokeMode: 'unique',
      strokeColor: '#000',
      strokeWidth: 1,
      strokeOpacity: 1,
      strokeDashed: false,
      classification: undefined,
      missingData: undefined
    },
    symbol: {
      enabled: true,
      mode: 'unique',
      shape: 'circle',
      size: 10,
      minSize: 4,
      maxSize: 24,
      sizeScale: 'linear',
      opacity: 1,
      fillMode: 'unique',
      fillColor: '#aaa',
      strokeMode: 'unique',
      strokeColor: '#000',
      strokeWidth: 1,
      strokeOpacity: 1,
      strokeDashed: false,
      classification: undefined,
      strokeClassification: undefined,
      missingData: undefined
    },
    line: {
      enabled: true,
      colorMode: 'unique',
      thicknessMode: 'unique',
      color: '#abc',
      opacity: 1,
      width: 1,
      maxWidth: 6,
      dashed: false,
      classification: undefined,
      thicknessClassification: undefined,
      missingData: undefined
    },
    text: {
      color: '#000',
      opacity: 1,
      fontFamily: 'Arial',
      bold: false,
      italic: false,
      size: 12,
      align: 'left',
      halo: false,
      haloColor: '#fff',
      haloWidth: 1,
      collisionDetection: true,
      dxpMasking: false,
      colorMode: 'unique',
      sizeMode: 'fixed',
      classification: undefined,
      missingData: undefined,
      background: {
        fillMode: 'none',
        fillColor: '#fff',
        fillOpacity: 0,
        strokeMode: 'none',
        strokeColor: '#000',
        strokeWidth: 1,
        strokeOpacity: 1,
        strokeDashed: false,
        valueColumn: undefined,
        categoryColumn: undefined,
        classification: undefined
      },
      secondaryLabels: { enabled: false }
    }
  }) as never;

describe('primitive-panel-visualization memoization', () => {
  it('returns the same reference when called twice with the same input', () => {
    const viz = makeViz();
    expect(buildPolygonPanelVisualization(viz)).toBe(
      buildPolygonPanelVisualization(viz)
    );
    expect(buildSymbolPanelVisualization(viz)).toBe(
      buildSymbolPanelVisualization(viz)
    );
    expect(buildSymbolFillPanelVisualization(viz)).toBe(
      buildSymbolFillPanelVisualization(viz)
    );
    expect(buildLinePanelVisualization(viz)).toBe(
      buildLinePanelVisualization(viz)
    );
    expect(buildTextPanelVisualization(viz)).toBe(
      buildTextPanelVisualization(viz)
    );
    expect(buildTextBackgroundPanelVisualization(viz)).toBe(
      buildTextBackgroundPanelVisualization(viz)
    );
  });

  it('returns different references for different inputs', () => {
    const viz1 = makeViz();
    const viz2 = makeViz();
    expect(buildPolygonPanelVisualization(viz1)).not.toBe(
      buildPolygonPanelVisualization(viz2)
    );
  });

  it('handles undefined input without throwing', () => {
    expect(buildPolygonPanelVisualization(undefined)).toBeUndefined();
    expect(buildTextBackgroundPanelVisualization(undefined)).toBeUndefined();
  });
});
