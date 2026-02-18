import { describe, expect, it, vi } from 'vitest';
import {
  getTooltip,
  formatTooltipValue,
  createTooltipHandler
} from './tooltip.service';
import type { PickingInfo } from '@deck.gl/core';
import type { VisualizationConfig } from '$lib/features/commons/store/visualization.store.svelte';
import type { TooltipContent } from '../types';

vi.mock('$lib/features/commons/utils/format.utils', () => ({
  formatValue: (value: unknown) => String(value ?? '')
}));

function createMockPickingInfo(
  overrides: Partial<PickingInfo> = {}
): PickingInfo {
  return {
    picked: true,
    index: 0,
    object: null,
    layer: null,
    ...overrides
  } as PickingInfo;
}

interface MockArrowTable {
  schema: { fields: { name: string }[] };
  numCols: number;
  numRows: number;
  getChild: (name: string) => { get: (index: number) => string } | null;
}

function createMockArrowTable(data: Record<string, string[]>): MockArrowTable {
  const fields = Object.keys(data).map((name) => ({ name }));
  const numRows = data[Object.keys(data)[0]]?.length ?? 0;

  return {
    schema: { fields },
    numCols: fields.length,
    numRows,
    getChild: (name: string) => {
      if (!(name in data)) return null;
      return {
        get: (index: number) => data[name][index]
      };
    }
  };
}

function isTooltipObject(
  result: TooltipContent
): result is { html?: string; style?: Partial<CSSStyleDeclaration> } {
  return result !== null && typeof result !== 'string';
}

describe('tooltip.service', () => {
  describe('formatTooltipValue', () => {
    it('formats null values as empty string', () => {
      expect(formatTooltipValue(null)).toBe('');
    });

    it('formats undefined values as empty string', () => {
      expect(formatTooltipValue(undefined)).toBe('');
    });

    it('formats string values', () => {
      expect(formatTooltipValue('test')).toBe('test');
    });

    it('formats number values', () => {
      expect(formatTooltipValue(42)).toBe('42');
    });
  });

  describe('getTooltip', () => {
    it('returns null when nothing is picked', () => {
      const info = createMockPickingInfo({ picked: false });
      expect(getTooltip(info)).toBeNull();
    });

    it('returns null when index is undefined', () => {
      const info = createMockPickingInfo({ index: undefined });
      expect(getTooltip(info)).toBeNull();
    });

    it('returns null when index is -1', () => {
      const info = createMockPickingInfo({ index: -1 });
      expect(getTooltip(info)).toBeNull();
    });

    it('returns tooltip content for GeoJson feature', () => {
      const info = createMockPickingInfo({
        index: 0,
        object: {
          type: 'Feature',
          properties: {
            name: 'France',
            population: 67000000
          }
        }
      });

      const result = getTooltip(info);

      expect(result).not.toBeNull();
      expect(isTooltipObject(result)).toBe(true);
      if (isTooltipObject(result)) {
        expect(result.html).toContain('name');
        expect(result.html).toContain('France');
        expect(result.style).toBeDefined();
      }
    });

    it('excludes reserved columns from GeoJson feature', () => {
      const info = createMockPickingInfo({
        index: 0,
        object: {
          type: 'Feature',
          properties: {
            name: 'France',
            geometry: 'POLYGON(...)',
            __id: '123'
          }
        }
      });

      const result = getTooltip(info);

      expect(isTooltipObject(result)).toBe(true);
      if (isTooltipObject(result)) {
        expect(result.html).not.toContain('geometry');
        expect(result.html).not.toContain('__id');
      }
    });

    it('returns tooltip content for Arrow table data', () => {
      const table = createMockArrowTable({
        name: ['Paris', 'Lyon'],
        population: ['2000000', '500000']
      });

      const mockLayer = {
        id: 'test-layer-ds_123',
        props: { data: table }
      };

      const info = createMockPickingInfo({
        index: 0,
        layer: mockLayer as unknown as PickingInfo['layer']
      });

      const result = getTooltip(info);

      expect(result).not.toBeNull();
      expect(isTooltipObject(result)).toBe(true);
      if (isTooltipObject(result)) {
        expect(result.html).toContain('name');
        expect(result.html).toContain('Paris');
      }
    });

    it('sorts visualization columns first when visualizations provided', () => {
      const table = createMockArrowTable({
        country: ['France'],
        population: ['67000000'],
        capital: ['Paris']
      });

      const mockLayer = {
        id: 'viz-layer-ds_abc',
        props: { data: table }
      };

      const visualizations = [
        {
          id: 'viz-1',
          datasetId: 'ds_abc',
          name: 'Test Viz',
          type: 'choropleth',
          enabled: true,
          mapping: { valueColumn: 'population' },
          style: {},
          primitiveFilters: []
        }
      ] as unknown as VisualizationConfig[];

      const info = createMockPickingInfo({
        index: 0,
        layer: mockLayer as unknown as PickingInfo['layer']
      });

      const result = getTooltip(info, visualizations);

      expect(result).not.toBeNull();
      expect(isTooltipObject(result)).toBe(true);
      if (isTooltipObject(result)) {
        const html = result.html ?? '';
        const populationIndex = html.indexOf('population');
        const countryIndex = html.indexOf('country');
        expect(populationIndex).toBeLessThan(countryIndex);
      }
    });

    it('creates accordion for many columns', () => {
      const properties: Record<string, string> = {};
      for (let i = 0; i < 15; i++) {
        properties[`col${i}`] = `value${i}`;
      }

      const info = createMockPickingInfo({
        index: 0,
        object: {
          type: 'Feature',
          properties
        }
      });

      const result = getTooltip(info);

      expect(isTooltipObject(result)).toBe(true);
      if (isTooltipObject(result)) {
        expect(result.html).toContain('tooltip-accordion');
        expect(result.html).toContain('+5 more');
      }
    });
  });

  describe('createTooltipHandler', () => {
    it('creates a handler function that calls getTooltip', () => {
      const getVisualizations = vi.fn(() => []);
      const handler = createTooltipHandler(getVisualizations);

      const info = createMockPickingInfo({
        index: 0,
        object: {
          type: 'Feature',
          properties: { name: 'Test' }
        }
      });

      const result = handler(info as PickingInfo);

      expect(getVisualizations).toHaveBeenCalled();
      expect(result).not.toBeNull();
    });

    it('works without getVisualizations callback', () => {
      const handler = createTooltipHandler();

      const info = createMockPickingInfo({
        index: 0,
        object: {
          type: 'Feature',
          properties: { name: 'Test' }
        }
      });

      const result = handler(info as PickingInfo);

      expect(result).not.toBeNull();
    });
  });
});
