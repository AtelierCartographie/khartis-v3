# Data Management Module

## 1. Data Import

### 1.1 Supported Data Types

#### Tabular data

The system accepts table-structured data with the following characteristics:

- CSV format with automatic delimiter detection (comma, semicolon, tab)
- UTF-8 encoding with or without BOM
- Required column headers on the first line
- Support for null values and empty strings
- Maximum file size of 100 MB

#### Geospatial data

Native support for standard formats:

- GeoJSON with geometries and attributes (WGS84 by default)
- Shapefile (set of files loaded together)
- GeoPackage (spatial SQLite, multi-layer)

### 1.2 Import Methods

#### Local import

Select files from the local system; drag-and-drop is supported with a visual drop area. MIME type and structure are validated before processing.

#### Import by URL

Load from public HTTP/HTTPS URLs with CORS handling and configurable timeout.

#### Copy-paste

Paste tabular content into a text area; the parser auto-detects CSV/TSV and validates structure before import.

## 2. Table Preview and Variable Analysis

### 2.1 Resizable table panel

Imported data is displayed in a side panel with a limited number of visible rows for performance reasons. The panel is resizable within defined bounds, and the user can scroll through records.

### 2.2 Variable typing and actions

Each variable has a visual code indicating its type (text, number, geographic subtype). A context menu on the header provides actions:

- Change type if auto-detection needs correction
- Refine: change case (upper/lower), trim leading/trailing spaces, compact consecutive spaces
- Rename
- Hide: remove from later selection lists without deleting data
- Delete

### 2.3 Automatic type detection

- Numeric: integers, decimals, scientific notation, locale-aware decimal separators
- Text: category counting and distribution preview
- Geographic: administrative names or codes (e.g., ISO), or coordinates in latitude/longitude columns with range validation

### 2.4 Descriptive summary per variable

Shown under each header and user-toggleable:

- Geographic: number of unique objects, null values, duplicates
- Text: number of categories
- Numeric: frequency histogram summary, min/max, number of nulls

## 3. Table Operations

### 3.1 Sorting

Ascending/descending sorting for numeric variables or alphabetical for text. Sorting applies to the current view and downstream operations.

### 3.2 Find and replace

Global search with option to restrict to a variable. Shows total results, navigation controls, and highlights in the table. Replacement is supported by specifying the substitute value.

### 3.3 Filters

Add one or more filters, each defined by a variable, an operator, and optionally a value. A compact visual summary shows filtered counts and percentages. Supported operators:

- Greater than or equal, less than or equal
- Equal, not equal, between
- Contains, starts with, ends with
- Top N ascending/descending
- Empty, not empty

Filters can be removed and reversed, with preview before application.

### 3.4 Calculator

Create a new variable defined by a formula. The editor supports variables, basic arithmetic operators and common functions (average, power, round, concatenation, substring, extraction). Autocomplete assists input and formulas can be tested before validation.

### 3.5 Trash and reset

Rows or variables can be deleted after selection; a warning appears if this impacts existing visualizations. A reset function restores the dataset to its imported state; all modifications and linked visualizations are lost.

## 4. Data Processing Pipeline

### Overview
Imported data flows through an automated pipeline that detects types, analyzes statistics, and prepares datasets for visualization. See [Data Pipeline Architecture](17-data-pipeline-architecture.md) for detailed implementation.

### Key Features
- **Automatic type detection**: Numeric, date, boolean, geometry, text
- **Statistical analysis**: Min/max/mean, unique values, null counts
- **Geometry processing**: Bounds, centroid, CRS detection
- **Transformations**: Type casting, normalization, cleaning, enrichment

### Integration
The pipeline automatically:
1. Processes imported files
2. Creates structured datasets
3. Suggests appropriate visualizations
4. Updates projection settings for geographic data
5. Synchronizes with the layer system

## 5. Geolocation and Joins

### 5.1 Geolocate tabular data

Automatic detection of geographic variables. The user can confirm or correct by selecting a geographic reference and the involved columns.

### 5.2 Join to a basemap

Join tabular data to a basemap from the integrated catalog or to a geospatial file imported by the user. If data is geolocated by coordinates, an OpenStreetMap basemap can be overlaid without a true attribute join.

#### Suggestions

A short list of catalog basemaps is proposed according to the match rate with the imported data, with thumbnails showing title, administrative level, year, source, and match percentage.

#### Assisted join

After choosing a basemap (except OpenStreetMap), a wizard helps correct links between table rows and basemap entities. Results are categorized: joined, to review, non-unique, or unrecognized. Corrections can be propagated back to the table.

#### Import a basemap

If the catalog is unsuitable, the user can import a geospatial file and perform the same assisted join. For coordinate-only data, overlay without join remains available.

### 5.3 Enrich a geospatial file

Starting from a geospatial file, the user can import tabular data to join to it, select the common keys, then run the same assisted join. Joined attributes are visible in the main table preview.

## 6. Map Preview

### 6.1 Immediate preview

After import, a map appears on a centered white page in the interface. It shows the first suggested basemap or a world basemap by default if no suggestion applies; for imported geospatial files, geometries are displayed directly.

### 6.2 Tooltips

On hover or touch, a fixed tooltip shows the attributes of the highlighted entity. If a visualization exists later, the variables used in it are shown first, with other attributes available on demand.

### 6.3 Zoom controls

Zoom controls manage either the page or the map view. These controls remain available throughout the flow.
