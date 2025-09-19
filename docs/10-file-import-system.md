# Import/Export System

## Overview

Complete bidirectional data flow system for importing various formats and exporting projects, maps, and data.

## Supported File Formats

### Tabular Data

- **CSV** (Comma-Separated Values)
- **TSV** (Tab-Separated Values)
- **TXT** (Text files with delimiters)

### Geospatial Formats

- **GeoJSON** - Standard JSON-based geographic format
- **Shapefile** - Multi-file format (.shp, .shx, .dbf, .prj, .cpg)
- **GeoPackage** (.gpkg) - SQLite-based spatial format (fully implemented)

### Project Formats

- **KH/Khartis** - Native Khartis project format for saving and loading complete projects

## Import Methods

### 1. File Upload (Drag & Drop)

```typescript
// Implementation in create-new-project.svelte
async function handleFileDrop(event: CustomEvent<readonly File[]>) {
  const files = Array.from(event.detail);
  await createProjectActions.processFiles(files);
  // Project name must be entered manually by the user
}
```

### 2. Data Pasting

Users can paste tabular data directly from spreadsheets or text editors:

```typescript
async function handlePasteData() {
  if (pastedDataValue.trim()) {
    await createProjectActions.processPastedData(pastedDataValue);
    pastedDataValue = '';
  }
}
```

### 3. URL Import

Load files directly from web URLs:

```typescript
async function handleLoadOnlineFile() {
  if (onlineUrlValue.trim()) {
    createProjectActions.setOnlineFileUrl(onlineUrlValue);
    await createProjectActions.loadOnlineFile();
    if (!createProjectState.newProject.error) {
      onlineUrlValue = '';
    }
  }
}
```

## File Validation

### Size Limits

- Maximum file size: **100 MB** per file
- Total project size limit: **500 MB**

### Validation Process

```typescript
export function validateFile(file: File): FileValidation {
  const validation: FileValidation = {
    isValid: true,
    errors: [],
    warnings: []
  };

  // Size check
  if (file.size > MAX_FILE_SIZE) {
    validation.isValid = false;
    validation.errors.push(
      `File exceeds maximum size of ${MAX_FILE_SIZE / 1024 / 1024}MB`
    );
  }

  // Type detection
  const fileType = detectFileType(file);
  if (fileType === FileType.UNKNOWN) {
    validation.warnings.push(
      'Unknown file type - will attempt to process as text'
    );
  }

  return validation;
}
```

### CSV Validation
- Minimum 2 lines required (header + data)
- Consistent column count validation
- Automatic delimiter detection (comma, semicolon, tab)
- UTF-8 encoding with BOM support

## Shapefile Handling

Shapefiles consist of multiple related files that are automatically grouped by base name:
- Required: `.shp` (geometry), `.shx` (index), `.dbf` (attributes)
- Optional: `.prj` (projection), `.cpg` (encoding)

## File Processing

### CSV Processing
CSV files are processed using PapaParse with:
- Automatic delimiter detection
- Dynamic typing
- BOM handling
- Progress tracking
- Empty line skipping

### GeoPackage Parsing with sql.js

Complete GeoPackage support using sql.js for SQLite parsing:

```typescript
export async function parseGeoPackage(
  buffer: ArrayBuffer,
  onProgress?: (progress: number) => void
): Promise<any> {
  const SQL = await import('sql.js');
  const sqlJs = await SQL.default({
    locateFile: (file: string) => `https://sql.js.org/dist/${file}`
  });

  const db = new sqlJs.Database(new Uint8Array(buffer));

  // Find geometry tables
  const result = db.exec(
    `SELECT table_name FROM gpkg_contents WHERE data_type IN ('features', 'tiles')`
  );

  const features: any[] = [];

  if (result.length > 0 && result[0].values.length > 0) {
    const tableName = result[0].values[0][0] as string;
    const rows = db.exec(`SELECT * FROM ${tableName}`);

    if (rows.length > 0) {
      const columns = rows[0].columns;
      const geomColumnIndex = columns.findIndex((c) =>
        c.toLowerCase().includes('geom')
      );

      rows[0].values.forEach((row, index) => {
        if (onProgress) {
          onProgress((index / rows[0].values.length) * 100);
        }

        // Parse WKB geometry and convert to GeoJSON
        const properties: Record<string, any> = {};
        columns.forEach((col, i) => {
          if (i !== geomColumnIndex) {
            properties[col] = row[i];
          }
        });

        features.push({
          type: 'Feature',
          properties,
          geometry: parseWKBtoGeoJSON(row[geomColumnIndex] as ArrayBuffer)
        });
      });
    }
  }

  db.close();

  return {
    type: 'FeatureCollection',
    features
  };
}
```

### Shapefile Processing
Shapefiles are processed using shpjs with automatic GeoJSON conversion and support for projection/encoding metadata.

### Duplicate File Detection

Prevents importing the same file multiple times:

```typescript
export function isFileDuplicate(fileName: string): boolean {
  const existingFiles = createProjectState.newProject.uploadedFiles;
  const currentProject = projectStore.currentProject;

  // Check against current project files
  if (currentProject?.data?.sourceFiles) {
    const isDuplicate = currentProject.data.sourceFiles.some(
      (f) => f.name === fileName
    );
    if (isDuplicate) return true;
  }

  // Check against pending files
  return existingFiles.some(
    (f) => f.name === fileName && f.status !== 'error'
  );
}
```

### Duplicate Row Detection

Automatic detection and reporting of duplicate rows:

```typescript
export function detectDuplicateRows(data: any[]): {
  hasDuplicates: boolean;
  duplicateIndices: number[];
  duplicateCount: number;
} {
  const seen = new Map<string, number[]>();
  const duplicateIndices: number[] = [];

  data.forEach((row, index) => {
    const key = JSON.stringify(row);
    if (seen.has(key)) {
      seen.get(key)!.push(index);
      duplicateIndices.push(index);
    } else {
      seen.set(key, [index]);
    }
  });

  return {
    hasDuplicates: duplicateIndices.length > 0,
    duplicateIndices,
    duplicateCount: duplicateIndices.length
  };
}
```

### Data Pipeline Integration

Imported files are automatically processed through the data pipeline:

```typescript
// After successful file import
const processedDataset = await processDataset({
  id: generateId(),
  name: file.name,
  data: parsedData,
  source: {
    type: 'file',
    fileName: file.name,
    fileSize: file.size
  }
});

// The pipeline performs:
// 1. Automatic type detection for all columns
// 2. Statistical analysis (min, max, mean, unique values)
// 3. Geometry processing for spatial data
// 4. Null value handling and validation
// 5. Column schema generation

datasetsStore.addDataset(processedDataset);
```

### Data Statistics
Automatic analysis generates statistics including:
- Column type detection (numeric, text, date, boolean, geometry)
- Null value counts
- Unique value counts
- Min/max/mean for numeric columns
- Category distribution for text columns

## Processing Pipeline

### File Type Detection
Extension-based detection with MIME type fallback:
- CSV/TSV/TXT → Tabular data
- JSON/GeoJSON → Geospatial data
- SHP/SHX/DBF → Shapefile components
- GPKG → GeoPackage
- KH → Khartis project

### Processing Flow
1. **Validation**: Size limits, structure checks, duplicate detection
2. **Parsing**: Format-specific parsing with progress tracking
3. **Analysis**: Type detection, statistics generation
4. **Storage**: Processed data stored with metadata

## State Management

### Upload State
Files are tracked with status, progress, validation results, and statistics throughout the import process.

### Store Actions
- `processFiles()`: Handle multiple files with shapefile grouping
- `processPastedData()`: Process clipboard data
- `loadOnlineFile()`: Fetch from URL
- `removeUploadedFile()`: Remove single file
- `clearAllFiles()`: Clear all uploads






## Export System

### Export Formats

#### Project Export (.kh)
- Complete project state with all data and visualizations
- Compression using CompressionStream API
- Fallback to uncompressed for older browsers

#### Map Export
- **SVG**: Vector format for editing
- **JPEG**: Raster format with quality control
- **PDF**: Print-ready (pending implementation)

#### Data Export
- **CSV**: Transformed tabular data with BOM for Excel
- **GeoJSON**: Spatial features with attributes
- **JSON**: Raw data export

### Export Implementation

#### Archive Creation
Projects are exported as compressed JSON archives containing:
- Manifest with metadata
- Source data and transformations
- Visualization configurations
- Layout settings
- Resources (images, custom styles)

#### Download Interface
Three-tab modal in header:
1. **Project tab**: Export complete .kh project
2. **Map tab**: Export as SVG/JPEG image
3. **Data tab**: Export processed CSV/GeoJSON

## Project Persistence

### IndexedDB Storage
- Database: `KhartisDB`
- Object store: `projects`
- Indexes: `updatedAt`, `name`
- Metadata cached in localStorage for quick access

### Auto-Save System
- 30-second debounce after changes
- Dirty state tracking
- Background saving with progress
- Version history management

## Notification System

Toast notifications using Carbon Design System:
- Auto-dismiss: 5s default, 10s for errors
- Maximum 5 concurrent notifications
- Console logging for debugging

Usage:
```typescript
showSuccess('File imported', subtitle);
showError('Import failed', errorMessage);
showWarning('Duplicate data', details);
showInfo('Processing', status);
```

## Data Pipeline Integration

Imported files flow through the data pipeline:
1. **Type Detection**: Automatic column type analysis
2. **Statistics**: Min/max/mean, unique values, nulls
3. **Geometry Processing**: Bounds, centroid, CRS
4. **Dataset Creation**: Structured storage with metadata
5. **Visualization Suggestions**: Based on data types
6. **Layer Management**: Auto-creation for geographic data

## Performance Optimizations

### Memory Management
- ArrayBuffer cleanup after processing
- Object URL revocation
- Streaming for files > 10MB
- Progressive loading with chunking

### Processing Strategy
- Web Workers for heavy operations (planned)
- Chunked parsing for large CSVs
- Lazy loading of file content
- IndexedDB caching for processed data

## Security

### Validation
- MIME type verification
- Extension validation
- Content scanning for scripts
- Path traversal prevention

### Data Protection
- Client-side only processing
- No server transmission
- Secure URL validation

## Implementation Status

### ✅ Completed
- CSV/TSV import with PapaParse
- GeoJSON import/export
- Shapefile support
- GeoPackage support
- Duplicate detection
- Data pipeline integration
- Progress tracking
- Error handling
- Statistics generation
- Project persistence
- Notification system
- CSV/JSON export

### ⏳ Pending
- KML/KMZ support
- TopoJSON support
- Excel file support
- PDF map export
- SVG optimization
- Batch processing
- Web Workers
- Streaming uploads
