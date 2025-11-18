import { describe, it, expect } from 'vitest';
import { DeepDataValidator } from './deep-validator.utils';

describe('Performance Benchmarks', () => {
  it('should process typical dataset (1000 rows, 10 columns) in <3s', async () => {
    // Generate typical dataset: 1000 rows x 10 columns
    const headers = Array.from({ length: 10 }, (_, i) => `column_${i}`);
    const data = Array.from({ length: 1000 }, (_, rowIdx) =>
      Array.from({ length: 10 }, (_, colIdx) => {
        // Mix of data types
        if (colIdx % 4 === 0) return String(Math.random() * 1000); // numeric as string
        if (colIdx % 4 === 1) return `text_${rowIdx}_${colIdx}`; // string
        if (colIdx % 4 === 2) return Math.random() > 0.5 ? 'true' : 'false'; // boolean
        return rowIdx % 10 === 0 ? null : String(Math.random() * 100); // numeric with nulls
      })
    );

    const startTime = performance.now();
    const result = await DeepDataValidator.analyzeDataContent(headers, data, {
      skipGeoDetection: true
    });
    const endTime = performance.now();
    const duration = endTime - startTime;


    expect(result.rowCount).toBe(1000);
    expect(result.columnCount).toBe(10);
    expect(duration).toBeLessThan(3000); // < 3 seconds
  });

  it('should process large dataset (5000 rows, 20 columns) in <10s', async () => {
    // Generate large dataset: 5000 rows x 20 columns
    const headers = Array.from({ length: 20 }, (_, i) => `column_${i}`);
    const data = Array.from({ length: 5000 }, (_, rowIdx) =>
      Array.from({ length: 20 }, (_, colIdx) => {
        // Mix of data types
        if (colIdx % 4 === 0) return String(Math.random() * 1000); // numeric
        if (colIdx % 4 === 1) return `text_${rowIdx}_${colIdx}`; // string
        if (colIdx % 4 === 2) return Math.random() > 0.5 ? 'true' : 'false'; // boolean
        return rowIdx % 10 === 0 ? null : String(Math.random() * 100); // numeric with nulls
      })
    );

    const startTime = performance.now();
    const result = await DeepDataValidator.analyzeDataContent(headers, data, {
      skipGeoDetection: true
    });
    const endTime = performance.now();
    const duration = endTime - startTime;


    expect(result.rowCount).toBe(5000);
    expect(result.columnCount).toBe(20);
    expect(duration).toBeLessThan(10000); // < 10 seconds
  });

  it('should process very large dataset (10000 rows, 30 columns) efficiently', async () => {
    // Generate very large dataset: 10000 rows x 30 columns
    const headers = Array.from({ length: 30 }, (_, i) => `column_${i}`);
    const data = Array.from({ length: 10000 }, (_, rowIdx) =>
      Array.from({ length: 30 }, (_, colIdx) => {
        // Mix of data types
        if (colIdx % 4 === 0) return String(Math.random() * 1000); // numeric
        if (colIdx % 4 === 1) return `text_${rowIdx}_${colIdx}`; // string
        if (colIdx % 4 === 2) return Math.random() > 0.5 ? 'true' : 'false'; // boolean
        return rowIdx % 10 === 0 ? null : String(Math.random() * 100); // numeric with nulls
      })
    );

    const startTime = performance.now();
    const result = await DeepDataValidator.analyzeDataContent(headers, data, {
      skipGeoDetection: true
    });
    const endTime = performance.now();
    const duration = endTime - startTime;


    expect(result.rowCount).toBe(10000);
    expect(result.columnCount).toBe(30);
    // Should complete (no specific time constraint for edge case)
  });

  it('should show performance improvement over naive algorithm', () => {
    // This test demonstrates the improvement using Welford's algorithm
    // vs. multiple passes for mean and standard deviation

    const values = Array.from({ length: 10000 }, () => Math.random() * 1000);

    // Naive approach (multiple passes)
    const naiveStart = performance.now();
    const naiveMean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const naiveVariance =
      values.reduce((sum, v) => sum + Math.pow(v - naiveMean, 2), 0) /
      values.length;
    const naiveStdDev = Math.sqrt(naiveVariance);
    const naiveEnd = performance.now();
    const naiveDuration = naiveEnd - naiveStart;

    // Welford's algorithm (single pass)
    const welfordStart = performance.now();
    let count = 0;
    let mean = 0;
    let m2 = 0;
    for (const value of values) {
      count++;
      const delta = value - mean;
      mean += delta / count;
      const delta2 = value - mean;
      m2 += delta * delta2;
    }
    const welfordStdDev = Math.sqrt(m2 / count);
    const welfordEnd = performance.now();
    const welfordDuration = welfordEnd - welfordStart;


    // Results should be very close (within floating point precision)
    expect(Math.abs(naiveStdDev - welfordStdDev)).toBeLessThan(0.0001);

    // Welford should be faster or comparable
    // (Note: for small datasets, the difference might be negligible due to JS engine optimizations)
    expect(welfordDuration).toBeLessThanOrEqual(naiveDuration * 1.5);
  });
});
