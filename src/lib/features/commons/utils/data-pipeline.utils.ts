import type { UploadedFile } from '../store/create-project.types';
import { FileType } from '../store/create-project.types';
import { logger, LogCategory } from './logger';
import {
  GeoColumnDetector,
  type GeoDetectionResult
} from './geo-detector.utils';
import {
  isTabularData,
  isGeoJSONFeatureCollection,
  type GeoJSONFeatureCollection
} from '$lib/types/data';

export interface DataColumn {
  name: string;
  type: 'string' | 'number' | 'date' | 'boolean' | 'geometry';
  nullable: boolean;
  unique: boolean;
  min?: number | Date;
  max?: number | Date;
  uniqueValues?: Set<unknown>;
  sampleValues?: unknown[];
}

export interface ProcessedDataset {
  id: string;
  name: string;
  sourceFileId: string;
  columns: DataColumn[];
  rowCount: number;
  data: Record<string, unknown>[];
  duckdbTableName?: string;
  geometry?: {
    type:
      | 'Point'
      | 'LineString'
      | 'Polygon'
      | 'MultiPoint'
      | 'MultiLineString'
      | 'MultiPolygon';
    bounds?: [number, number, number, number];
    centroid?: [number, number];
  };
  geoDetection?: GeoDetectionResult;
  metadata: {
    processedAt: Date;
    transformations: string[];
  };
  originalData?: {
    columns: DataColumn[];
    data: Record<string, unknown>[];
    rowCount: number;
  };
}

export function detectColumnType(values: unknown[]): DataColumn['type'] {
  if (!values || values.length === 0) return 'string';

  const nonNullValues = values.filter(
    (v) => v !== null && v !== undefined && v !== ''
  );
  if (nonNullValues.length === 0) return 'string';

  const sample = nonNullValues.slice(0, 100);

  const allNumbers = sample.every((v) => {
    const num = Number(v);
    return !isNaN(num) && isFinite(num);
  });
  if (allNumbers) return 'number';

  const datePatterns = [
    /^\d{4}-\d{2}-\d{2}$/,
    /^\d{2}\/\d{2}\/\d{4}$/,
    /^\d{2}-\d{2}-\d{4}$/
  ];
  const allDates = sample.every((v) => {
    return (
      datePatterns.some((pattern) => pattern.test(String(v))) ||
      !isNaN(Date.parse(String(v)))
    );
  });
  if (allDates) return 'date';

  const allBooleans = sample.every((v) => {
    const str = String(v).toLowerCase();
    return ['true', 'false', '0', '1', 'yes', 'no', 'oui', 'non'].includes(str);
  });
  if (allBooleans) return 'boolean';

  return 'string';
}

export function analyzeColumn(name: string, values: unknown[]): DataColumn {
  const type = detectColumnType(values);
  const nonNullValues = values.filter(
    (v) => v !== null && v !== undefined && v !== ''
  );

  const column: DataColumn = {
    name,
    type,
    nullable: nonNullValues.length < values.length,
    unique: new Set(nonNullValues).size === nonNullValues.length,
    uniqueValues: new Set(nonNullValues),
    sampleValues: nonNullValues.slice(0, 10)
  };

  if (type === 'number') {
    const numbers = nonNullValues.map(Number).filter((n) => !isNaN(n));
    if (numbers.length > 0) {
      column.min = Math.min(...numbers);
      column.max = Math.max(...numbers);
    }
  }

  return column;
}

export function processTabularData(
  data: Record<string, unknown>[],
  headers?: string[]
): { columns: DataColumn[]; processedData: Record<string, unknown>[] } {
  if (!data || data.length === 0) {
    return { columns: [], processedData: [] };
  }

  const columnNames = headers || Object.keys(data[0]);
  const columns: DataColumn[] = [];

  for (const colName of columnNames) {
    const values = data.map((row) => row[colName]);
    columns.push(analyzeColumn(colName, values));
  }

  const processedData = data.map((row) => {
    const processedRow: Record<string, unknown> = {};

    columns.forEach((col) => {
      const value = row[col.name];

      if (value === null || value === undefined || value === '') {
        processedRow[col.name] = null;
      } else if (col.type === 'number') {
        processedRow[col.name] = Number(value);
      } else if (col.type === 'boolean') {
        const str = String(value).toLowerCase();
        processedRow[col.name] = ['true', '1', 'yes', 'oui'].includes(str);
      } else if (col.type === 'date') {
        processedRow[col.name] = new Date(value as string | number | Date);
      } else {
        processedRow[col.name] = String(value);
      }
    });

    return processedRow;
  });

  return { columns, processedData };
}

export function processGeospatialData(geojson: GeoJSONFeatureCollection): {
  columns: DataColumn[];
  processedData: Record<string, unknown>[];
  geometry: ProcessedDataset['geometry'];
} {
  if (!geojson || !geojson.features) {
    return { columns: [], processedData: [], geometry: undefined };
  }

  const allProperties = new Map<string, unknown[]>();
  const geometryTypes = new Set<string>();
  const bounds: [number, number, number, number] = [
    Infinity,
    Infinity,
    -Infinity,
    -Infinity
  ];

  geojson.features.forEach((feature) => {
    const geometry = feature.geometry;
    if (geometry && geometry.coordinates !== undefined) {
      geometryTypes.add(geometry.type);
      updateBounds(bounds, geometry as { coordinates: unknown });
    }

    if (feature.properties) {
      Object.entries(feature.properties).forEach(([key, value]) => {
        if (!allProperties.has(key)) {
          allProperties.set(key, []);
        }
        allProperties.get(key)!.push(value);
      });
    }
  });

  const columns: DataColumn[] = [
    {
      name: 'geometry',
      type: 'geometry',
      nullable: false,
      unique: false
    }
  ];

  allProperties.forEach((values, name) => {
    columns.push(analyzeColumn(name, values));
  });

  const processedData = geojson.features.map((feature, index) => {
    return {
      _id: index,
      geometry: feature.geometry,
      ...feature.properties
    };
  });

  const geometryTypeArray = Array.from(geometryTypes);
  const geometryType =
    geometryTypeArray[0] as ProcessedDataset['geometry'] extends {
      type: infer T;
    }
      ? T
      : never;
  const centroid = calculateCentroid(bounds);

  return {
    columns,
    processedData,
    geometry: {
      type: geometryType,
      bounds: bounds[0] === Infinity ? undefined : bounds,
      centroid
    }
  };
}

function updateBounds(
  bounds: [number, number, number, number],
  geometry: { coordinates: unknown }
) {
  if (!geometry || !geometry.coordinates) return;

  function processCoordinate(coord: number[]) {
    if (coord.length >= 2) {
      bounds[0] = Math.min(bounds[0], coord[0]);
      bounds[1] = Math.min(bounds[1], coord[1]);
      bounds[2] = Math.max(bounds[2], coord[0]);
      bounds[3] = Math.max(bounds[3], coord[1]);
    }
  }

  function processCoordinates(coords: unknown): void {
    if (Array.isArray(coords)) {
      if (typeof coords[0] === 'number') {
        processCoordinate(coords);
      } else {
        coords.forEach((c) => processCoordinates(c));
      }
    }
  }

  processCoordinates(geometry.coordinates);
}

function calculateCentroid(
  bounds: [number, number, number, number]
): [number, number] {
  return [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2];
}

export async function processUploadedFile(
  file: UploadedFile
): Promise<ProcessedDataset | null> {
  const parsedData = file.parsedData;
  const status = file.status;

  if (!parsedData || status !== 'complete') {
    return null;
  }

  const baseDataset: ProcessedDataset = {
    id: crypto.randomUUID(),
    name: file.name,
    sourceFileId: file.id,
    columns: [],
    rowCount: 0,
    data: [],
    metadata: {
      processedAt: new Date(),
      transformations: []
    }
  };

  if (
    file.fileType === FileType.CSV &&
    parsedData &&
    isTabularData(parsedData)
  ) {
    const { columns, processedData } = processTabularData(parsedData);

    const headers = columns.map((c) => c.name);
    const dataArray = processedData.map((row) =>
      headers.map((header) => row[header])
    );

    const geoDetection = await GeoColumnDetector.detectGeoColumns(
      headers,
      dataArray
    );

    logger.info('Geo detection completed', LogCategory.DATA, {
      hasGeoColumns: geoDetection.hasGeoColumns,
      geoColumnsCount: geoDetection.geoColumns.length,
      suggestedColumn: geoDetection.suggestedPrimaryGeoColumn?.columnName
    });

    return {
      ...baseDataset,
      columns,
      rowCount: processedData.length,
      data: processedData,
      geoDetection,
      originalData: {
        columns: JSON.parse(JSON.stringify(columns)),
        data: JSON.parse(JSON.stringify(processedData)),
        rowCount: processedData.length
      }
    };
  }

  if (
    [FileType.GEOJSON, FileType.SHAPEFILE, FileType.GEOPACKAGE].includes(
      file.fileType
    ) &&
    parsedData &&
    isGeoJSONFeatureCollection(parsedData)
  ) {
    const { columns, processedData, geometry } =
      processGeospatialData(parsedData);
    return {
      ...baseDataset,
      columns,
      rowCount: processedData.length,
      data: processedData,
      geometry,
      originalData: {
        columns: JSON.parse(JSON.stringify(columns)),
        data: JSON.parse(JSON.stringify(processedData)),
        rowCount: processedData.length
      }
    };
  }

  return null;
}

export async function createDataPipeline(
  files: UploadedFile[]
): Promise<ProcessedDataset[]> {
  logger.info('Creating data pipeline', LogCategory.DATA, {
    filesCount: files.length
  });
  const datasets: ProcessedDataset[] = [];

  for (const file of files) {
    const dataset = await processUploadedFile(file);
    if (dataset) {
      datasets.push(dataset);
    }
  }

  if (datasets.length > 0) {
    logger.success('Data pipeline created', LogCategory.DATA, {
      datasetsCount: datasets.length
    });
  }
  return datasets;
}

export function mergeDatasets(
  datasets: ProcessedDataset[],
  joinColumn?: string
): ProcessedDataset {
  if (datasets.length === 0) {
    throw new Error('No datasets to merge');
  }

  if (datasets.length === 1) {
    return datasets[0];
  }

  const mergedColumns = new Map<string, DataColumn>();
  const mergedData: Record<string, unknown>[] = [];

  datasets.forEach((dataset) => {
    dataset.columns.forEach((col) => {
      if (!mergedColumns.has(col.name)) {
        mergedColumns.set(col.name, col);
      }
    });
  });

  if (joinColumn) {
    const joinIndex = new Map<unknown, Record<string, unknown>[]>();

    datasets.forEach((dataset) => {
      dataset.data.forEach((row) => {
        const key = row[joinColumn];
        if (!joinIndex.has(key)) {
          joinIndex.set(key, []);
        }
        joinIndex.get(key)!.push(row);
      });
    });

    joinIndex.forEach((rows, key) => {
      const mergedRow: Record<string, unknown> = { [joinColumn]: key };
      rows.forEach((row) => {
        Object.assign(mergedRow, row);
      });
      mergedData.push(mergedRow);
    });
  } else {
    datasets.forEach((dataset) => {
      mergedData.push(...dataset.data);
    });
  }

  return {
    id: crypto.randomUUID(),
    name: `Merged_${datasets.map((d) => d.name).join('_')}`,
    sourceFileId: datasets.map((d) => d.sourceFileId).join(','),
    columns: Array.from(mergedColumns.values()),
    rowCount: mergedData.length,
    data: mergedData,
    geometry: datasets.find((d) => d.geometry)?.geometry,
    metadata: {
      processedAt: new Date(),
      transformations: ['merge']
    }
  };
}
