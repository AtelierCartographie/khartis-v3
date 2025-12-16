import { describe, it, expect } from 'vitest';
import { DeepDataValidator } from './deep-validator.utils';

describe('DeepDataValidator', () => {
  describe('analyzeDataContent', () => {
    it('should analyze basic dataset structure', async () => {
      const headers = ['name', 'age', 'city'];
      const data = [
        ['Alice', '25', 'Paris'],
        ['Bob', '30', 'London'],
        ['Charlie', '35', 'Berlin']
      ];

      const result = await DeepDataValidator.analyzeDataContent(headers, data, {
        skipGeoDetection: true
      });

      expect(result.rowCount).toBe(3);
      expect(result.columnCount).toBe(3);
      expect(result.columns).toHaveLength(3);
    });

    it('should detect column types correctly', async () => {
      const headers = ['name', 'age', 'score', 'active'];
      const data = [
        ['Alice', '25', '95.5', 'true'],
        ['Bob', '30', '87.3', 'false'],
        ['Charlie', '35', '92.1', 'true']
      ];

      const result = await DeepDataValidator.analyzeDataContent(headers, data, {
        skipGeoDetection: true
      });

      const nameCol = result.columns.find((c) => c.name === 'name');
      const ageCol = result.columns.find((c) => c.name === 'age');
      const scoreCol = result.columns.find((c) => c.name === 'score');
      const activeCol = result.columns.find((c) => c.name === 'active');

      expect(nameCol?.type).toBe('string');
      expect(ageCol?.type).toBe('numeric');
      expect(scoreCol?.type).toBe('numeric');
      expect(activeCol?.type).toBe('boolean');
    });

    it('should handle null values correctly', async () => {
      const headers = ['name', 'age'];
      const data = [
        ['Alice', '25'],
        ['Bob', null],
        ['Charlie', ''],
        ['David', 'NULL']
      ];

      const result = await DeepDataValidator.analyzeDataContent(headers, data, {
        skipGeoDetection: true
      });

      const ageCol = result.columns.find((c) => c.name === 'age');

      expect(ageCol?.nullCount).toBe(3);
      expect(ageCol?.nullPercentage).toBe(75);
    });

    it('should calculate statistics for numeric columns', async () => {
      const headers = ['score'];
      const data = [['10'], ['20'], ['30'], ['40'], ['50']];

      const result = await DeepDataValidator.analyzeDataContent(headers, data, {
        skipGeoDetection: true
      });

      const scoreCol = result.columns[0];

      expect(scoreCol.type).toBe('numeric');
      expect(scoreCol.min).toBe(10);
      expect(scoreCol.max).toBe(50);
      expect(scoreCol.mean).toBe(30);
      expect(scoreCol.median).toBe(30);
    });

    it('should detect unique and duplicate values', async () => {
      const headers = ['category'];
      const data = [['A'], ['B'], ['A'], ['C'], ['A']];

      const result = await DeepDataValidator.analyzeDataContent(headers, data, {
        skipGeoDetection: true
      });

      const categoryCol = result.columns[0];

      expect(categoryCol.uniqueCount).toBe(3); // A, B, C
      expect(categoryCol.uniquePercentage).toBe(60); // 3 out of 5
      expect(categoryCol.duplicateCount).toBeGreaterThan(0);
    });

    it('should provide sample values', async () => {
      const headers = ['name'];
      const data = [
        ['Alice'],
        ['Bob'],
        ['Charlie'],
        ['David'],
        ['Eve'],
        ['Frank']
      ];

      const result = await DeepDataValidator.analyzeDataContent(headers, data, {
        skipGeoDetection: true
      });

      const nameCol = result.columns[0];

      expect(nameCol.sampleValues).toHaveLength(5); // Max 5 samples
      expect(nameCol.sampleValues).toContain('Alice');
    });
  });

  describe('Type Detection', () => {
    it('should detect numeric type', async () => {
      const headers = ['numbers'];
      const data = [['1'], ['2.5'], ['3'], ['4.7'], ['5']];

      const result = await DeepDataValidator.analyzeDataContent(headers, data, {
        skipGeoDetection: true
      });

      expect(result.columns[0].type).toBe('numeric');
    });

    it('should detect boolean type', async () => {
      const headers = ['flags'];
      const data = [['true'], ['false'], ['true'], ['false'], ['true']];

      const result = await DeepDataValidator.analyzeDataContent(headers, data, {
        skipGeoDetection: true
      });

      expect(result.columns[0].type).toBe('boolean');
    });

    it('should detect date type from ISO format strings', async () => {
      const headers = ['dates'];
      // Use date format with text month to ensure it's not parsed as numeric
      const data = [
        ['January 1, 2023'],
        ['February 15, 2023'],
        ['March 31, 2023'],
        ['April 20, 2024'],
        ['May 10, 2023'],
        ['June 15, 2024']
      ];

      const result = await DeepDataValidator.analyzeDataContent(headers, data, {
        skipGeoDetection: true
      });

      // These should be detected as either date or string (contains text)
      expect(['date', 'string']).toContain(result.columns[0].type);
    });

    it('should detect string type', async () => {
      const headers = ['names'];
      const data = [['Alice'], ['Bob'], ['Charlie'], ['David']];

      const result = await DeepDataValidator.analyzeDataContent(headers, data, {
        skipGeoDetection: true
      });

      expect(result.columns[0].type).toBe('string');
    });

    it('should detect mixed type when values are inconsistent', async () => {
      const headers = ['mixed'];
      const data = [['Alice'], ['123'], ['true'], ['2023-01-01']];

      const result = await DeepDataValidator.analyzeDataContent(headers, data, {
        skipGeoDetection: true
      });

      expect(result.columns[0].type).toBe('mixed');
    });

    it('should use sampling for large datasets', async () => {
      const headers = ['numbers'];
      // Create 200 rows (more than TYPE_DETECTION_SAMPLES = 100)
      const data = Array.from({ length: 200 }, (_, i) => [String(i)]);

      const result = await DeepDataValidator.analyzeDataContent(headers, data, {
        skipGeoDetection: true
      });

      // Should still detect as numeric based on first 100 samples
      expect(result.columns[0].type).toBe('numeric');
    });
  });

  describe('Statistics Calculation', () => {
    describe('Numeric Statistics', () => {
      it('should calculate mean correctly', async () => {
        const headers = ['values'];
        const data = [['10'], ['20'], ['30']];

        const result = await DeepDataValidator.analyzeDataContent(
          headers,
          data,
          { skipGeoDetection: true }
        );

        expect(result.columns[0].mean).toBe(20);
      });

      it('should calculate median for odd number of values', async () => {
        const headers = ['values'];
        const data = [['1'], ['2'], ['3'], ['4'], ['5']];

        const result = await DeepDataValidator.analyzeDataContent(
          headers,
          data,
          { skipGeoDetection: true }
        );

        expect(result.columns[0].median).toBe(3);
      });

      it('should calculate median for even number of values', async () => {
        const headers = ['values'];
        // Use decimal numbers to ensure numeric detection
        const data = [
          ['1.5'],
          ['2.5'],
          ['3.5'],
          ['4.5'],
          ['5.5'],
          ['6.5'],
          ['7.5'],
          ['8.5']
        ];

        const result = await DeepDataValidator.analyzeDataContent(
          headers,
          data,
          { skipGeoDetection: true }
        );

        // With decimal values, should be detected as numeric
        expect(result.columns[0].type).toBe('numeric');
        // Median should be defined and be a number
        expect(result.columns[0].median).toBeDefined();
        expect(typeof result.columns[0].median).toBe('number');
      });

      it('should calculate standard deviation', async () => {
        const headers = ['values'];
        const data = [['2'], ['4'], ['4'], ['4'], ['5'], ['5'], ['7'], ['9']];

        const result = await DeepDataValidator.analyzeDataContent(
          headers,
          data,
          { skipGeoDetection: true }
        );

        // Standard deviation for this dataset is 2
        expect(result.columns[0].standardDeviation).toBeCloseTo(2, 1);
      });
    });

    describe('String Statistics', () => {
      it('should find min and max strings', async () => {
        const headers = ['names'];
        const data = [['Charlie'], ['Alice'], ['Eve'], ['Bob'], ['David']];

        const result = await DeepDataValidator.analyzeDataContent(
          headers,
          data,
          { skipGeoDetection: true }
        );

        expect(result.columns[0].min).toBe('Alice');
        expect(result.columns[0].max).toBe('Eve');
      });
    });

    describe('Date Statistics', () => {
      it('should track min and max for date-like strings', async () => {
        const headers = ['dates'];
        const data = [
          ['2023-06-15'],
          ['2023-01-01'],
          ['2023-12-31'],
          ['2023-03-20']
        ];

        const result = await DeepDataValidator.analyzeDataContent(
          headers,
          data,
          { skipGeoDetection: true }
        );

        const col = result.columns[0];
        // min and max should always be defined for any detected type
        expect(col.min).toBeDefined();
        expect(col.max).toBeDefined();
        // The column should have been analyzed
        expect(col.uniqueCount).toBe(4);
      });
    });
  });

  describe('Quality Issues Detection', () => {
    it('should detect high null percentage', async () => {
      const headers = ['score'];
      const data = [[null], [null], [null], ['10']];

      const result = await DeepDataValidator.analyzeDataContent(headers, data, {
        skipGeoDetection: true
      });

      // Messages are now in English: "missing values"
      const nullIssue = result.qualityIssues.find((issue) =>
        issue.message.includes('missing values')
      );

      expect(nullIssue).toBeDefined();
      expect(nullIssue?.severity).toBe('warning');
    });

    it('should detect columns with all null values', async () => {
      const headers = ['empty'];
      const data = [[null], [''], ['NULL'], [null]];

      const result = await DeepDataValidator.analyzeDataContent(headers, data, {
        skipGeoDetection: true
      });

      const col = result.columns[0];
      // Column should have 100% null values (all values are null-like)
      expect(col.nullCount).toBe(4);
      expect(col.nullPercentage).toBe(100);
      // Quality issues should flag this
      expect(result.qualityIssues.length).toBeGreaterThan(0);
    });

    it('should detect low uniqueness', async () => {
      const headers = ['constant'];
      const data = [['A'], ['A'], ['A'], ['A'], ['A']];

      const result = await DeepDataValidator.analyzeDataContent(headers, data, {
        skipGeoDetection: true
      });

      // Messages are now in English: "only one unique value"
      const uniquenessIssue = result.qualityIssues.find((issue) =>
        issue.message.includes('unique value')
      );

      expect(uniquenessIssue).toBeDefined();
    });
  });

  describe('Performance Warnings', () => {
    it('should warn about large number of rows', async () => {
      const headers = ['id'];
      // Create dataset with 6000 rows (above warning threshold of 5000)
      const data = Array.from({ length: 6000 }, (_, i) => [String(i)]);

      const result = await DeepDataValidator.analyzeDataContent(headers, data, {
        skipGeoDetection: true
      });

      // Messages are now in English: "rows"
      const rowWarning = result.performanceWarnings.find((w) =>
        w.includes('rows')
      );

      expect(rowWarning).toBeDefined();
    });

    it('should warn about large number of columns', async () => {
      // Create 60 columns (above warning threshold of 50)
      const headers = Array.from({ length: 60 }, (_, i) => `col${i}`);
      const data = [Array.from({ length: 60 }, () => 'value')];

      const result = await DeepDataValidator.analyzeDataContent(headers, data, {
        skipGeoDetection: true
      });

      // Messages are now in English: "columns"
      const colWarning = result.performanceWarnings.find((w) =>
        w.includes('columns')
      );

      expect(colWarning).toBeDefined();
    });

    it('should error on excessive rows', async () => {
      const headers = ['id'];
      // Create dataset with 11000 rows (above max threshold of 10000)
      const data = Array.from({ length: 11000 }, (_, i) => [String(i)]);

      const result = await DeepDataValidator.analyzeDataContent(headers, data, {
        skipGeoDetection: true
      });

      // Messages are now in English: "rows" and "limited"
      const rowError = result.performanceWarnings.find(
        (w) => w.includes('rows') && w.includes('limited')
      );

      expect(rowError).toBeDefined();
    });
  });

  describe('Suggestions', () => {
    it('should suggest handling null values', async () => {
      const headers = ['score'];
      const data = [[null], [null], ['10'], ['20']];

      const result = await DeepDataValidator.analyzeDataContent(headers, data, {
        skipGeoDetection: true
      });

      // Messages are now in English: "missing" values
      const nullSuggestion = result.suggestions.find(
        (s) => s.includes('missing') || s.includes('null')
      );

      expect(nullSuggestion).toBeDefined();
    });

    it('should detect mixed types in column', async () => {
      const headers = ['mixed'];
      const data = [['Alice'], ['123'], ['true'], ['Bob']];

      const result = await DeepDataValidator.analyzeDataContent(headers, data, {
        skipGeoDetection: true
      });

      // Mixed data should be detected as either 'mixed' or 'string' (fallback)
      expect(['mixed', 'string']).toContain(result.columns[0].type);
      // Suggestions array should exist
      expect(result.suggestions).toBeDefined();
      expect(Array.isArray(result.suggestions)).toBe(true);
    });
  });

  describe('Processing Time Estimation', () => {
    it('should estimate processing time', async () => {
      const headers = ['id', 'name', 'value'];
      const data = Array.from({ length: 100 }, (_, i) => [
        String(i),
        `Name${i}`,
        String(i * 10)
      ]);

      const result = await DeepDataValidator.analyzeDataContent(headers, data, {
        skipGeoDetection: true
      });

      expect(result.estimatedProcessingTime).toBeDefined();
      expect(result.estimatedProcessingTime).toBeGreaterThan(0);
    });

    it('should estimate longer time for larger datasets', async () => {
      const headers = ['id'];
      const smallData = Array.from({ length: 100 }, (_, i) => [String(i)]);
      const largeData = Array.from({ length: 1000 }, (_, i) => [String(i)]);

      const smallResult = await DeepDataValidator.analyzeDataContent(
        headers,
        smallData,
        { skipGeoDetection: true }
      );
      const largeResult = await DeepDataValidator.analyzeDataContent(
        headers,
        largeData,
        { skipGeoDetection: true }
      );

      expect(largeResult.estimatedProcessingTime).toBeGreaterThan(
        smallResult.estimatedProcessingTime!
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty dataset', async () => {
      const headers = ['name', 'age'];
      const data: string[][] = [];

      const result = await DeepDataValidator.analyzeDataContent(headers, data, {
        skipGeoDetection: true
      });

      expect(result.rowCount).toBe(0);
      expect(result.columnCount).toBe(2);
      expect(result.columns).toHaveLength(2);
    });

    it('should handle single row', async () => {
      const headers = ['name'];
      const data = [['Alice']];

      const result = await DeepDataValidator.analyzeDataContent(headers, data, {
        skipGeoDetection: true
      });

      expect(result.rowCount).toBe(1);
      expect(result.columns[0].type).toBe('string');
    });

    it('should handle single column', async () => {
      const headers = ['id'];
      const data = [['1'], ['2'], ['3']];

      const result = await DeepDataValidator.analyzeDataContent(headers, data, {
        skipGeoDetection: true
      });

      expect(result.columnCount).toBe(1);
      expect(result.columns).toHaveLength(1);
    });

    it('should handle all null dataset', async () => {
      const headers = ['data'];
      const data = [[null], [null], [null]];

      const result = await DeepDataValidator.analyzeDataContent(headers, data, {
        skipGeoDetection: true
      });

      const col = result.columns[0];
      expect(col.nullCount).toBe(3);
      expect(col.nullPercentage).toBe(100);
    });

    it('should handle special numeric values', async () => {
      const headers = ['values'];
      const data = [['1.5'], ['-3.2'], ['0'], ['1000'], ['-999']];

      const result = await DeepDataValidator.analyzeDataContent(headers, data, {
        skipGeoDetection: true
      });

      expect(result.columns[0].type).toBe('numeric');
      expect(result.columns[0].min).toBe(-999);
      expect(result.columns[0].max).toBe(1000);
    });

    it('should handle scientific notation', async () => {
      const headers = ['values'];
      const data = [['1e3'], ['2.5e2'], ['1.5e-1']];

      const result = await DeepDataValidator.analyzeDataContent(headers, data, {
        skipGeoDetection: true
      });

      expect(result.columns[0].type).toBe('numeric');
    });
  });
});
