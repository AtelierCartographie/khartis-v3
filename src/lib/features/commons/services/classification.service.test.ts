import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { Table } from '@uwdata/flechette';

enum ClassificationMethod {
  EQUAL_INTERVAL = 'equal_interval',
  QUANTILES = 'quantiles',
  JENKS = 'jenks',
  MANUAL = 'manual',
  STANDARD_DEVIATION = 'standard_deviation'
}

vi.mock('$lib/features/commons/store/visualization.store.svelte', () => ({
  ClassificationMethod: {
    EQUAL_INTERVAL: 'equal_interval',
    QUANTILES: 'quantiles',
    JENKS: 'jenks',
    MANUAL: 'manual',
    STANDARD_DEVIATION: 'standard_deviation'
  }
}));

const mockQuery = vi.fn();

vi.mock('$lib/features/duckdb', () => ({
  Duck: {
    query: (...args: unknown[]) => mockQuery(...args)
  },
  GEO_CONSTANTS: {
    WGS84_CRS: 'EPSG:4326'
  },
  duckDBOrchestrator: {
    getDatasetBySourceFile: (sourceFileId: string) => {
      if (sourceFileId === 'test-file') {
        return { tableName: 'test_table' };
      }
      return null;
    }
  }
}));

vi.mock('$lib/features/duckdb/orchestrator', () => ({
  duckDBOrchestrator: {
    getDatasetBySourceFile: (sourceFileId: string) => {
      if (sourceFileId === 'test-file') {
        return { tableName: 'test_table' };
      }
      return null;
    }
  }
}));

vi.mock('../utils/logger', () => ({
  LogCategory: {
    DATA: 'data',
    UI: 'ui'
  },
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn()
  }
}));

import {
  calculateBreaks,
  generateColorsForBreaks
} from './classification.service';

function createMockTable(data: Record<string, unknown>[]): Table {
  return {
    toArray: () => data
  } as unknown as Table;
}

describe('classification.service', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('calculateBreaks', () => {
    it('returns null when dataset not found', async () => {
      const result = await calculateBreaks({
        datasetId: 'non-existent',
        columnName: 'value',
        method: ClassificationMethod.QUANTILES,
        numClasses: 5
      });
      expect(result).toBeNull();
    });

    it('returns counts for each class interval', async () => {
      mockQuery
        .mockResolvedValueOnce(createMockTable([{ min_val: 0, max_val: 100 }]))
        .mockResolvedValueOnce(createMockTable([{ breaks: [20, 40, 60, 80] }]))
        .mockResolvedValueOnce(
          createMockTable([
            { cnt_0: 15n, cnt_1: 25n, cnt_2: 30n, cnt_3: 20n, cnt_4: 10n }
          ])
        );

      const result = await calculateBreaks({
        datasetId: 'test-file',
        columnName: 'value',
        method: ClassificationMethod.QUANTILES,
        numClasses: 5
      });

      expect(result).not.toBeNull();
      expect(result?.counts).toEqual([15, 25, 30, 20, 10]);
      expect(result?.breaks).toEqual([20, 40, 60, 80]);
      expect(result?.min).toBe(0);
      expect(result?.max).toBe(100);
    });

    it('generates correct SQL for class counts with inclusive upper bound on last bin', async () => {
      mockQuery
        .mockResolvedValueOnce(createMockTable([{ min_val: 0, max_val: 100 }]))
        .mockResolvedValueOnce(createMockTable([{ breaks: [50] }]))
        .mockResolvedValueOnce(createMockTable([{ cnt_0: 40n, cnt_1: 60n }]));

      await calculateBreaks({
        datasetId: 'test-file',
        columnName: 'value',
        method: ClassificationMethod.QUANTILES,
        numClasses: 2
      });

      const countsQuery = mockQuery.mock.calls[2][0];
      expect(countsQuery).toContain('cnt_0');
      expect(countsQuery).toContain('cnt_1');
      expect(countsQuery).toMatch(/"value"\s*<\s*50/);
      expect(countsQuery).toMatch(/"value"\s*<=\s*100/);
    });

    it('sum of counts equals total rows when no nulls', async () => {
      const expectedCounts = [12, 23, 35, 18, 12];
      const totalRows = expectedCounts.reduce((a, b) => a + b, 0);

      mockQuery
        .mockResolvedValueOnce(createMockTable([{ min_val: 0, max_val: 100 }]))
        .mockResolvedValueOnce(createMockTable([{ breaks: [20, 40, 60, 80] }]))
        .mockResolvedValueOnce(
          createMockTable([
            {
              cnt_0: BigInt(expectedCounts[0]),
              cnt_1: BigInt(expectedCounts[1]),
              cnt_2: BigInt(expectedCounts[2]),
              cnt_3: BigInt(expectedCounts[3]),
              cnt_4: BigInt(expectedCounts[4])
            }
          ])
        );

      const result = await calculateBreaks({
        datasetId: 'test-file',
        columnName: 'value',
        method: ClassificationMethod.QUANTILES,
        numClasses: 5
      });

      const sumOfCounts = result?.counts.reduce((a, b) => a + b, 0);
      expect(sumOfCounts).toBe(totalRows);
    });

    it('handles single class (all values equal)', async () => {
      mockQuery
        .mockResolvedValueOnce(createMockTable([{ min_val: 50, max_val: 50 }]))
        .mockResolvedValueOnce(createMockTable([{ breaks: [50] }]))
        .mockResolvedValueOnce(createMockTable([{ cnt_0: 100n }]));

      const result = await calculateBreaks({
        datasetId: 'test-file',
        columnName: 'value',
        method: ClassificationMethod.QUANTILES,
        numClasses: 2
      });

      expect(result).not.toBeNull();
      expect(result?.min).toBe(50);
      expect(result?.max).toBe(50);
    });

    it('returns null when no valid data', async () => {
      mockQuery.mockResolvedValueOnce(createMockTable([]));

      const result = await calculateBreaks({
        datasetId: 'test-file',
        columnName: 'value',
        method: ClassificationMethod.QUANTILES,
        numClasses: 5
      });

      expect(result).toBeNull();
    });
  });

  describe('generateColorsForBreaks', () => {
    it('returns correct number of colors for each class count', () => {
      for (let numClasses = 3; numClasses <= 9; numClasses++) {
        const colors = generateColorsForBreaks(numClasses, 'sequential');
        expect(colors.length).toBe(numClasses);
      }
    });

    it('returns sequential palette by default', () => {
      const colors = generateColorsForBreaks(5, 'sequential');
      expect(colors[0]).toBe('#eff3ff');
      expect(colors[colors.length - 1]).toBe('#08519c');
    });

    it('returns diverging palette when specified', () => {
      const colors = generateColorsForBreaks(5, 'diverging');
      expect(colors[0]).toBe('#ca0020');
      expect(colors[colors.length - 1]).toBe('#0571b0');
    });

    it('clamps class count to valid range', () => {
      const colorsLow = generateColorsForBreaks(1, 'sequential');
      expect(colorsLow.length).toBe(3);

      const colorsHigh = generateColorsForBreaks(20, 'sequential');
      expect(colorsHigh.length).toBe(9);
    });
  });
});
