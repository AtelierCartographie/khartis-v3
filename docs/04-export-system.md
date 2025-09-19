# Export System

## 1. Map Export

### Supported Formats

#### JPEG (Implemented)
- High-quality bitmap rendering with adjustable compression
- sRGB color profile embedded
- Resolution presets: screen, print, high-quality
- EXIF metadata support

#### SVG (Pending)
- Vector structure preservation
- CSS styling support
- Text editability options
- Compatibility mode for different editors

#### PDF (Pending)
- Vector document with embedded fonts
- Document metadata
- Print-ready with bleeds/margins
- RGB/CMYK color profiles

## 2. Data Export

See [Import/Export System](10-file-import-system.md#export-system) for complete implementation details.

### 2.1 Tabular data

CSV export includes user transformations, computed columns and, optionally, the filtered subset or the entire dataset. UTF-8 with BOM is used and the delimiter is configurable. An optional metadata header can be added.

**Implementation**: PapaParse with BOM for Excel compatibility

### 2.2 Geospatial data

GeoJSON export with WGS84 geometries and full attribute preservation. Geometry validation before export.

### 2.3 Enriched data (Pending)

Export joined data with geometries and attributes in GeoJSON, Shapefile, GeoPackage, or KML/KMZ formats.

## 3. Project System

### 3.1 Khartis project format (.kh)

Projects are compressed JSON archives containing:
- Manifest with metadata and version
- Source data and transformations
- Visualization configurations
- Layout parameters
- Resources (images, custom styles)

**Implementation**: IndexedDB storage with auto-save (30s debounce)

### 3.2 Browser storage

- **IndexedDB**: Large datasets and project data
- **LocalStorage**: Project metadata for quick access
- **SessionStorage**: Temporary/ephemeral data
- **Auto-save**: 30-second debounce with dirty state tracking

### 3.3 Version history (Planned)

- Action logging with timestamps
- Named versions
- Undo/redo with keyboard shortcuts
- Grouped action support

## 4. Performance

- **Async processing**: Non-blocking exports with progress
- **Memory management**: Chunked processing for large files
- **Compression**: CompressionStream API with fallback
- **Size optimization**: Quality/size balance for images

## 5. Metadata and Documentation

### 5.1 Metadata

Automatic metadata generation from:
- Dataset store (sources, processing)
- Visualization store (methods, parameters)
- Projection store (type, settings)
- Project store (author, dates)

### 5.2 Documentation (Planned)

Markdown/HTML reports with data summary, parameters, statistics, and methodology.

## 7. Implementation Status

### ✅ Completed
- CSV export with BOM
- GeoJSON export
- JSON export
- Project archive (.kh)
- Download interface
- Metadata generation

### ⏳ Pending
- SVG map export
- JPEG quality settings
- PDF generation
- Shapefile export
- GeoPackage export
- KML/KMZ support
- Batch exports

## 6. Future Features

- Web embeds with iframe/custom elements
- Print preparation with preflight checks
- OGC standards compliance
- API endpoints for programmatic export
