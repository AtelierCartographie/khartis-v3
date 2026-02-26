import { describe, expect, it } from 'vitest';

import type { GeoDetectionResult } from '$lib/features/commons/utils/geo-detector.utils';

import {
  ColumnType,
  FileFormatEnum,
  type DatasetResult,
  type EnrichedColumn
} from '$lib/features/data-pipeline/types';
import {
  normalizeDatasets,
  normalizeToProcessedDataset
} from '$lib/features/data-pipeline/utils/processed-dataset.utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEnrichedColumn(
  name: string,
  type: ColumnType = ColumnType.TEXT,
  statsOverrides: Partial<{
    count: number;
    nulls: number;
    uniques: number;
    min: unknown;
    max: unknown;
    mean: number;
  }> = {}
): EnrichedColumn {
  return {
    name,
    type,
    values: [],
    stats: {
      name,
      type,
      count: 10,
      nulls: 0,
      uniques: 10,
      ...statsOverrides
    }
  };
}

function makeDatasetResult(
  overrides: Partial<DatasetResult> = {}
): DatasetResult {
  return {
    id: 'ds-1',
    name: 'Test Dataset',
    sourceFileId: 'file-1',
    tableName: 'test_tbl',
    columns: [makeEnrichedColumn('col_a'), makeEnrichedColumn('col_b')],
    rowCount: 10,
    metadata: {
      processedAt: new Date('2024-01-01'),
      fileType: 'csv',
      parserUsed: 'duck',
      transformations: []
    },
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// normalizeToProcessedDataset — structure de base
// ---------------------------------------------------------------------------

describe('processed-dataset.utils', () => {
  describe('normalizeToProcessedDataset', () => {
    it('préserve id, name, sourceFileId et rowCount', () => {
      const ds = makeDatasetResult();
      const result = normalizeToProcessedDataset(ds);

      expect(result.id).toBe('ds-1');
      expect(result.name).toBe('Test Dataset');
      expect(result.sourceFileId).toBe('file-1');
      expect(result.rowCount).toBe(10);
    });

    it('mappe tableName → duckdbTableName', () => {
      const ds = makeDatasetResult({ tableName: 'my_table' });
      const result = normalizeToProcessedDataset(ds);
      expect(result.duckdbTableName).toBe('my_table');
    });

    it('retourne directement un ProcessedDataset déjà normalisé (idempotent)', () => {
      const ds = makeDatasetResult();
      const first = normalizeToProcessedDataset(ds);
      const second = normalizeToProcessedDataset(first);
      expect(second).toBe(first); // même référence
    });

    // --- format mapping ---
    it.each([
      ['csv', FileFormatEnum.CSV],
      ['geojson', FileFormatEnum.GEOJSON],
      ['shapefile', FileFormatEnum.SHAPEFILE],
      ['geopackage', FileFormatEnum.GEOPACKAGE],
      ['geoparquet', FileFormatEnum.GEOPARQUET],
      ['kml', FileFormatEnum.KML],
      ['kmz', FileFormatEnum.KMZ]
    ])('mappe le format "%s" correctement', (format, expected) => {
      const ds = makeDatasetResult({
        format: format as DatasetResult['format']
      });
      const result = normalizeToProcessedDataset(ds);
      expect(result.format).toBe(expected);
    });

    it('utilise "csv" comme format par défaut pour un format inconnu', () => {
      const ds = makeDatasetResult({ format: undefined });
      const result = normalizeToProcessedDataset(ds);
      expect(result.format).toBe(FileFormatEnum.CSV);
    });

    it('prefer metadata.fileType si format principal absent', () => {
      const ds = makeDatasetResult({
        format: undefined,
        metadata: {
          processedAt: new Date(),
          fileType: 'geojson',
          parserUsed: 'duck',
          transformations: []
        }
      });
      const result = normalizeToProcessedDataset(ds);
      expect(result.format).toBe(FileFormatEnum.GEOJSON);
    });

    // --- colonnes ---
    it('convertit les colonnes en ColumnInfo', () => {
      const ds = makeDatasetResult({
        columns: [makeEnrichedColumn('age', ColumnType.NUMBER)]
      });
      const result = normalizeToProcessedDataset(ds);
      expect(result.columns).toHaveLength(1);
      expect(result.columns[0].name).toBe('age');
      expect(result.columns[0].type).toBe('number');
    });

    it('mappe le type ColumnType.TEXT → "string"', () => {
      const ds = makeDatasetResult({
        columns: [makeEnrichedColumn('label', ColumnType.TEXT)]
      });
      const result = normalizeToProcessedDataset(ds);
      expect(result.columns[0].type).toBe('string');
    });

    it('mappe le type ColumnType.BOOLEAN → "boolean"', () => {
      const ds = makeDatasetResult({
        columns: [makeEnrichedColumn('active', ColumnType.BOOLEAN)]
      });
      const result = normalizeToProcessedDataset(ds);
      expect(result.columns[0].type).toBe('boolean');
    });

    it('mappe le type ColumnType.DATE → "date"', () => {
      const ds = makeDatasetResult({
        columns: [makeEnrichedColumn('created', ColumnType.DATE)]
      });
      const result = normalizeToProcessedDataset(ds);
      expect(result.columns[0].type).toBe('date');
    });

    // --- nullable ---
    it('marque une colonne nullable si nulls > 0', () => {
      const ds = makeDatasetResult({
        columns: [makeEnrichedColumn('col', ColumnType.TEXT, { nulls: 3 })]
      });
      const result = normalizeToProcessedDataset(ds);
      expect(result.columns[0].nullable).toBe(true);
    });

    it('marque une colonne non nullable si nulls = 0 et aucune valeur null', () => {
      const ds = makeDatasetResult({
        columns: [makeEnrichedColumn('col', ColumnType.NUMBER, { nulls: 0 })]
      });
      const result = normalizeToProcessedDataset(ds);
      expect(result.columns[0].nullable).toBe(false);
    });

    // --- unique ---
    it('marque une colonne unique si uniques = count et count > 0', () => {
      const ds = makeDatasetResult({
        columns: [
          makeEnrichedColumn('id', ColumnType.TEXT, { count: 5, uniques: 5 })
        ]
      });
      const result = normalizeToProcessedDataset(ds);
      expect(result.columns[0].unique).toBe(true);
    });

    it('marque une colonne non unique si uniques < count', () => {
      const ds = makeDatasetResult({
        columns: [
          makeEnrichedColumn('cat', ColumnType.TEXT, { count: 10, uniques: 3 })
        ]
      });
      const result = normalizeToProcessedDataset(ds);
      expect(result.columns[0].unique).toBe(false);
    });

    // --- mean uniquement pour les numériques ---
    it('inclut mean pour une colonne numérique', () => {
      const ds = makeDatasetResult({
        columns: [
          makeEnrichedColumn('value', ColumnType.NUMBER, { mean: 42.5 })
        ]
      });
      const result = normalizeToProcessedDataset(ds);
      expect(result.columns[0].mean).toBe(42.5);
    });

    it("n'inclut pas mean pour une colonne non numérique", () => {
      const ds = makeDatasetResult({
        columns: [makeEnrichedColumn('label', ColumnType.TEXT, { mean: 42.5 })]
      });
      const result = normalizeToProcessedDataset(ds);
      expect(result.columns[0].mean).toBeUndefined();
    });

    // --- geoDetection ---
    it('construit analysis.geoColumns depuis geoDetection', () => {
      const geoDetection: GeoDetectionResult = {
        hasGeoColumns: true,
        geoColumns: [
          { index: 0, columnName: 'iso3', type: 'iso3', confidence: 0.9 }
        ],
        suggestedPrimaryGeoColumn: {
          index: 0,
          columnName: 'iso3',
          type: 'iso3',
          confidence: 0.9
        },
        warnings: []
      };
      const ds = makeDatasetResult({ geoDetection });
      const result = normalizeToProcessedDataset(ds);

      expect(result.analysis.hasGeoData).toBe(true);
      expect(result.analysis.geoColumns).toHaveLength(1);
      expect(
        (result.analysis.geoColumns[0] as { columnName: string }).columnName
      ).toBe('iso3');
      expect(result.analysis.suggestedGeoColumn).toBe('iso3');
    });

    it('analysis.hasGeoData est false si geoDetection absent', () => {
      const ds = makeDatasetResult({ geoDetection: undefined });
      const result = normalizeToProcessedDataset(ds);
      expect(result.analysis.hasGeoData).toBe(false);
    });

    it('merge les warnings de geoDetection et analysis', () => {
      const geoDetection: GeoDetectionResult = {
        hasGeoColumns: false,
        geoColumns: [],
        warnings: ['geo-warning']
      };
      const ds = makeDatasetResult({
        geoDetection,
        analysis: {
          columns: [],
          geoColumns: [],
          hasGeoData: false,
          rowCount: 0,
          warnings: ['analysis-warning']
        }
      });
      const result = normalizeToProcessedDataset(ds);
      expect(result.analysis.warnings).toContain('geo-warning');
      expect(result.analysis.warnings).toContain('analysis-warning');
    });

    it('fallback sur les geoColumns legacy de analysis quand geoDetection est absent', () => {
      const ds = makeDatasetResult({
        geoDetection: undefined,
        analysis: {
          columns: [],
          geoColumns: [
            { name: 'legacy_iso', type: 'iso3', confidence: '0.8' },
            { columnName: 'legacy_city', type: 'city', confidence: 0.6 },
            42,
            null
          ] as unknown as NonNullable<DatasetResult['analysis']>['geoColumns'],
          hasGeoData: true,
          rowCount: 10,
          warnings: []
        }
      });

      const result = normalizeToProcessedDataset(ds);

      expect(result.analysis.geoColumns).toHaveLength(2);
      expect(
        (result.analysis.geoColumns[0] as { columnName: string }).columnName
      ).toBe('legacy_iso');
      expect(
        (result.analysis.geoColumns[1] as { columnName: string }).columnName
      ).toBe('legacy_city');
      expect(result.analysis.hasGeoData).toBe(true);
    });

    it('utilise suggestedGeoColumn depuis analysis legacy si geoDetection ne propose rien', () => {
      const ds = makeDatasetResult({
        geoDetection: undefined,
        analysis: {
          columns: [],
          geoColumns: [
            { columnName: 'code', type: 'iso3', confidence: 0.95 }
          ] as unknown as NonNullable<DatasetResult['analysis']>['geoColumns'],
          hasGeoData: true,
          suggestedGeoColumn: 'code',
          rowCount: 10,
          warnings: []
        }
      });

      const result = normalizeToProcessedDataset(ds);
      expect(result.analysis.suggestedGeoColumn).toBe('code');
    });

    // --- createdAt ---
    it('utilise dataset.createdAt si disponible', () => {
      const date = new Date('2023-06-15');
      const ds = makeDatasetResult({ createdAt: date });
      const result = normalizeToProcessedDataset(ds);
      expect(result.createdAt).toBe(date);
    });

    it('fall back sur metadata.processedAt si createdAt absent', () => {
      const processedAt = new Date('2023-07-01');
      const ds = makeDatasetResult({
        createdAt: undefined,
        metadata: {
          processedAt,
          fileType: 'csv',
          parserUsed: 'duck',
          transformations: []
        }
      });
      const result = normalizeToProcessedDataset(ds);
      expect(result.createdAt).toBe(processedAt);
    });

    // --- fileSize ---
    it('utilise fileSize du dataset ou 0 par défaut', () => {
      const ds = makeDatasetResult({ fileSize: 2048 });
      expect(normalizeToProcessedDataset(ds).fileSize).toBe(2048);

      const dsNoSize = makeDatasetResult({ fileSize: undefined });
      expect(normalizeToProcessedDataset(dsNoSize).fileSize).toBe(0);
    });

    // --- originalData ---
    it('mappe originalData si présent', () => {
      const ds = makeDatasetResult({
        originalData: {
          columns: [makeEnrichedColumn('orig_col', ColumnType.TEXT)],
          data: [{ orig_col: 'val' }],
          rowCount: 1
        }
      });
      const result = normalizeToProcessedDataset(ds);
      expect(result.originalData).toBeDefined();
      expect(result.originalData!.rowCount).toBe(1);
      expect(result.originalData!.columns[0].name).toBe('orig_col');
    });

    it('laisse originalData à undefined si absent', () => {
      const ds = makeDatasetResult({ originalData: undefined });
      const result = normalizeToProcessedDataset(ds);
      expect(result.originalData).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // normalizeDatasets
  // ---------------------------------------------------------------------------

  describe('normalizeDatasets', () => {
    it('normalise un tableau vide en tableau vide', () => {
      expect(normalizeDatasets([])).toEqual([]);
    });

    it('normalise plusieurs datasets', () => {
      const datasets = [
        makeDatasetResult({ id: 'a', name: 'A' }),
        makeDatasetResult({ id: 'b', name: 'B' })
      ];
      const result = normalizeDatasets(datasets);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('a');
      expect(result[1].id).toBe('b');
    });

    it('normalise des ProcessedDataset déjà normalisés sans les modifier', () => {
      const ds = makeDatasetResult({ id: 'x' });
      const normalized = normalizeToProcessedDataset(ds);
      const result = normalizeDatasets([normalized]);
      expect(result[0]).toBe(normalized);
    });
  });
});
