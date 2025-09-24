# Type Reference

Core TypeScript interfaces and types used throughout the application.

## Project Types

### KhartisProject

Main project structure persisted to IndexedDB.

```ts
interface KhartisProject {
  id: string;
  manifest: {
    version: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    author?: string;
    description?: string;
    format: 'kh' | 'khartis';
  };
  data: {
    sourceFiles: UploadedFile[];
    processedData?: any;
    joinedData?: any;
    basemap?: {
      type: string;
      id: string;
      data?: any;
    };
  };
  visualization?: VisualizationConfig;
  layout?: LayoutConfig;
  resources?: Record<string, any>;
}
```

### SavedProjectMetadata

Lightweight project info stored in localforage.

```ts
interface SavedProjectMetadata {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  description?: string;
  size: number;
}
```

## File & Data Types

### UploadedFile

File representation during import process.

```ts
interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  content?: ArrayBuffer | string;
  parsedData?: any[];
  fileType: FileType;
  status: 'uploading' | 'processing' | 'complete' | 'error';
  errorMessage?: string;
  relatedFiles?: string[];
  validation?: FileValidation;
  statistics?: DataStatistics;
}
```

### FileType Enum

```ts
enum FileType {
  CSV = 'csv',
  TSV = 'tsv',
  GEOJSON = 'geojson',
  SHAPEFILE = 'shapefile',
  GEOPACKAGE = 'geopackage',
  KML = 'kml',
  KMZ = 'kmz',
  EXCEL = 'excel',
  JSON = 'json',
  UNKNOWN = 'unknown'
}
```

### ProcessedDataset

Dataset after processing and analysis.

```ts
interface ProcessedDataset {
  id: string;
  name: string;
  sourceFileId: string;
  columns: DataColumn[];
  rowCount: number;
  data: any[];
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
  metadata: {
    processedAt: Date;
    transformations: string[];
  };
}
```

### DataColumn

```ts
interface DataColumn {
  name: string;
  type: 'string' | 'number' | 'date' | 'boolean' | 'geometry';
  nullable: boolean;
  unique: boolean;
  min?: number;
  max?: number;
  uniqueValues?: Set<any>;
  sampleValues?: any[];
}
```

### DuckDBDataset

Dataset representation in DuckDB.

```ts
interface DuckDBDataset {
  id: string;
  tableName: string;
  sourceFileId: string;
  name: string;
  columns: any[];
  rowCount: number;
  metadata: {
    processedAt: Date;
    fileType: FileType;
  };
}
```

## Visualization Types

### VisualizationConfig

```ts
interface VisualizationConfig {
  id: string;
  name: string;
  type: VisualizationType;
  datasetId: string;
  enabled: boolean;
  style: {
    fillColor?: string | string[];
    fillOpacity?: number;
    strokeColor?: string;
    strokeWidth?: number;
    strokeOpacity?: number;
  };
  mapping: {
    valueColumn?: string;
    categoryColumn?: string;
    sizeColumn?: string;
    colorColumn?: string;
    geometryColumn?: string;
  };
  classification?: {
    method: ClassificationMethod;
    classes: number;
    breaks?: number[];
    colors?: string[];
    labels?: string[];
  };
  symbols?: {
    type: 'circle' | 'square' | 'triangle' | 'diamond';
    minSize: number;
    maxSize: number;
    sizeScale: 'linear' | 'sqrt' | 'log';
  };
}
```

### VisualizationType Enum

```ts
enum VisualizationType {
  CHOROPLETH = 'choropleth',
  PROPORTIONAL = 'proportional',
  CATEGORICAL = 'categorical',
  BIVARIATE = 'bivariate',
  COMBINED = 'combined'
}
```

### ClassificationMethod Enum

```ts
enum ClassificationMethod {
  EQUAL_INTERVAL = 'equal_interval',
  QUANTILES = 'quantiles',
  JENKS = 'jenks',
  MANUAL = 'manual',
  STANDARD_DEVIATION = 'standard_deviation'
}
```

## Annotation Types

### AnnotationType

```ts
interface AnnotationType {
  id: string;
  type: 'text' | 'shape' | 'drawing' | 'image';
  content: unknown;
  position: { x: number; y: number };
  style?: AnnotationStyle;
}
```

### AnnotationStyle

```ts
interface AnnotationStyle {
  // Text
  font?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  underlined?: boolean;
  textAlign?: TextAlign;

  // Common
  opacity?: number;
  color?: string | { hue: number; saturation: number; lightness: number };

  // Stroke & Fill
  strokeWidth?: number;
  strokeColor?: string | { hue: number; saturation: number; lightness: number };
  fillColor?: string | { hue: number; saturation: number; lightness: number };
  strokeStyle?: 'solid' | 'dashed' | 'dotted';

  // Shape
  cornerRadius?: number;
  curvature?: number;

  // Drawing
  smoothness?: number;
  drawingType?: 'line' | 'zone';

  // Image
  size?: number;
}
```

## Layout Types

### LayoutConfig

```ts
interface LayoutConfig {
  pageSize: 'A4' | 'A3' | 'letter' | 'custom';
  orientation: 'portrait' | 'landscape';
  width?: number;
  height?: number;
  margins: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  title?: {
    text: string;
    fontSize: number;
    fontFamily: string;
    color: string;
    position: 'top' | 'bottom';
  };
  subtitle?: {
    text: string;
    fontSize: number;
    fontFamily: string;
    color: string;
  };
  credits?: string;
  showLegend: boolean;
  showScaleBar: boolean;
  showNorthArrow: boolean;
}
```

## State Management Types

### Store States

```ts
// Project Store
interface ProjectState {
  currentProject: KhartisProject | null;
  isDirty: boolean;
  isSaving: boolean;
  lastSaveTime: Date | null;
  history: ProjectHistory[];
  historyIndex: number;
}

// Datasets Store
interface DatasetsState {
  datasets: ProcessedDataset[];
  isProcessing: boolean;
  errors: Map<string, string>;
}

// Visualization Store
interface VisualizationState {
  visualizations: VisualizationConfig[];
  selectedVisualizationId?: string;
  activeVisualizationIds: Set<string>;
}

// Create Project Store (ephemeral)
interface CreateProjectState {
  activeTab: ProjectTab;
  projectName: string;
  uploadedFiles: UploadedFile[];
  onlineFileUrl: string;
  isLoading: boolean;
  error?: string;
  savedProjects: SavedProjectMetadata[];
}
```

## Utility Types

### FileValidation

```ts
interface FileValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}
```

### DataStatistics

```ts
interface DataStatistics {
  numeric?: {
    min: number;
    max: number;
    mean: number;
    median?: number;
    stdDev?: number;
    nullCount: number;
  };
  categorical?: {
    uniqueCount: number;
    topValues: Array<{ value: string; count: number }>;
    nullCount: number;
  };
  temporal?: {
    min: Date;
    max: Date;
    nullCount: number;
  };
}
```

### ExampleProject

```ts
interface ExampleProject {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  category: string;
  thumbnail: string;
  dataUrl: string;
  baseMapId?: string;
  visualizations: Array<{
    type: string;
    variable: string;
    classification: string;
    classes: number;
    palette: string;
  }>;
  tags: string[];
}
```

## Error Types

```ts
class DataValidationError extends Error {
  constructor(
    message: string,
    public errors: string[],
    public warnings: string[]
  ) {
    super(message);
  }
}

class FileGroupError extends Error {
  constructor(
    message: string,
    public missingFiles: string[]
  ) {
    super(message);
  }
}

class SizeLimitError extends Error {
  constructor(
    message: string,
    public size: number,
    public limit: number
  ) {
    super(message);
  }
}
```

## Constants

### Size Limits

```ts
const FILE_SIZE_LIMIT = 50 * 1024 * 1024; // 50MB
const PROJECT_SIZE_LIMIT = 100 * 1024 * 1024; // 100MB
const MAX_PROJECT_COUNT = 50;
```

### Default Values

```ts
const DEFAULT_CLASSIFICATION_CLASSES = 5;
const DEFAULT_OPACITY = 0.8;
const DEFAULT_STROKE_WIDTH = 1;
const DEFAULT_SYMBOL_SIZE = 10;
const DEFAULT_PAGE_SIZE = 'A4';
const DEFAULT_ORIENTATION = 'landscape';
```

## Type Guards

```ts
// Check if dataset has geometry
function hasGeometry(dataset: ProcessedDataset): boolean {
  return dataset.geometry !== undefined;
}

// Check if file is geographic
function isGeoFile(file: UploadedFile): boolean {
  return [FileType.GEOJSON, FileType.SHAPEFILE, FileType.GEOPACKAGE].includes(
    file.fileType
  );
}

// Check if column is numeric
function isNumericColumn(column: DataColumn): boolean {
  return column.type === 'number';
}
```

## Migration Types

```ts
interface ProjectMigration {
  fromVersion: string;
  toVersion: string;
  migrate: (project: any) => KhartisProject;
}
```
