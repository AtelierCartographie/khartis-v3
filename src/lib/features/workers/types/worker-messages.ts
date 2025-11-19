/**
 * Worker message types for type-safe communication
 */

// Base message types
export interface WorkerRequest<T = unknown> {
  id: string;
  type: string;
  payload: T;
  transferables?: Transferable[];
}

export interface WorkerResponse<T = unknown> {
  id: string;
  type: 'success' | 'error' | 'progress';
  payload?: T;
  error?: string;
  progress?: number;
}

// CSV Parser messages
export interface CSVParseRequest {
  fileData: ArrayBuffer | string;
  options?: {
    delimiter?: string;
    header?: boolean;
    skipEmptyLines?: boolean;
    preview?: number;
    encoding?: string;
  };
}

export interface CSVParseResponse {
  headers: string[];
  rows: unknown[][];
  rowCount: number;
  metadata?: {
    delimiter: string;
    linebreak: string;
    aborted: boolean;
    truncated: boolean;
  };
}

// Type Inference messages
export interface TypeInferenceRequest {
  columns: Array<{
    name: string;
    values: unknown[];
  }>;
  sampleSize?: number;
  threshold?: number;
}

export interface TypeInferenceResponse {
  columns: Array<{
    name: string;
    type: 'text' | 'numeric' | 'date' | 'boolean' | 'geometry';
    confidence: number;
    nullable: boolean;
    uniqueCount?: number;
  }>;
}

// DuckDB Batch messages
export interface DuckDBBatchRequest {
  queries: Array<{
    id: string;
    sql: string;
    params?: unknown[];
  }>;
  sequential?: boolean; // If true, execute queries in order
}

export interface DuckDBBatchResponse {
  results: Array<{
    id: string;
    success: boolean;
    data?: unknown[];
    error?: string;
    executionTime: number;
  }>;
  totalExecutionTime: number;
}

// Shapefile Parser messages
export interface ShapefileParseRequest {
  shpData: ArrayBuffer;
  dbfData?: ArrayBuffer;
  shxData?: ArrayBuffer;
  prjData?: ArrayBuffer;
}

export interface ShapefileParseResponse {
  features: Array<{
    type: 'Feature';
    properties: Record<string, unknown>;
    geometry: unknown;
  }>;
  bounds?: [number, number, number, number];
  crs?: string;
}

// GeoJSON Parser messages
export interface GeoJSONParseRequest {
  data: string | ArrayBuffer;
  validate?: boolean;
  simplify?: boolean;
  tolerance?: number;
}

export interface GeoJSONParseResponse {
  type: 'FeatureCollection' | 'Feature' | 'Geometry';
  features?: unknown[];
  geometry?: unknown;
  properties?: Record<string, unknown>;
  bounds?: [number, number, number, number];
  validationErrors?: string[];
}

// Geometry Processing messages
export interface GeometryProcessRequest {
  operation: 'extent' | 'centroid' | 'simplify' | 'buffer' | 'union' | 'intersect';
  geometry: unknown;
  params?: Record<string, unknown>;
}

export interface GeometryProcessResponse {
  result: unknown;
  executionTime: number;
}

// Worker pool events
export interface WorkerPoolStatus {
  activeWorkers: number;
  queuedTasks: number;
  completedTasks: number;
  failedTasks: number;
  averageExecutionTime: number;
}

// Type guards
export function isWorkerRequest(msg: unknown): msg is WorkerRequest {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'id' in msg &&
    'type' in msg &&
    'payload' in msg
  );
}

export function isWorkerResponse(msg: unknown): msg is WorkerResponse {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'id' in msg &&
    'type' in msg &&
    ['success', 'error', 'progress'].includes((msg as any).type)
  );
}