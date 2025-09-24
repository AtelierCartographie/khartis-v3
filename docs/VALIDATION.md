# File Validation & Data Quality

## Overview

Khartis v3 implements a multi-layer validation system to ensure data quality and geographic compatibility before project creation.

## Validation Pipeline

```
File Input → Basic Validation → Async Content Check → Deep Analysis → Geo Detection → Catalogue Matching
```

## Validation Layers

### 1. Basic File Validation (`file-validator.utils.ts`)

**Checks performed:**
- File size limits (50MB per file, 100MB total)
- Extension validation (CSV, TSV, GeoJSON, Shapefile, GeoPackage)
- MIME type verification
- Suspicious filename patterns
- Magic number validation for binary formats

**Usage:**
```typescript
const validation = FileValidator.validate(file);
if (!validation.isValid) {
  // Handle errors
}
```

### 2. Deep Data Analysis (`deep-validator.utils.ts`)

**Analysis includes:**
- Column type detection (numeric, string, date, boolean, mixed)
- Statistical computation (min, max, mean, median, std deviation)
- Null value and duplicate detection
- Performance warnings (>10,000 rows, >100 columns)
- Data quality issues identification

**Performance Thresholds:**
| Metric | Warning | Error |
|--------|---------|-------|
| Rows | 5,000 | 10,000 |
| Columns | 50 | 100 |
| Cell Length | - | 2,000 chars |
| File Size | - | 50MB |

### 3. Geographic Column Detection (`geo-detector.utils.ts`)

**Auto-detected patterns:**
- **Coordinates:** lat/latitude, lon/longitude, x/y_coord
- **ISO Codes:** ISO2 (2 letters), ISO3 (3 letters)
- **Place Names:** country, region, city, province
- **Mixed Formats:** WKT, coordinate pairs

**Detection Methods:**
1. Column name pattern matching
2. Value pattern analysis
3. Sample matching against known entities
4. Confidence scoring (0-1)

### 4. Catalogue Matching (`geo-matcher.utils.ts`)

**Features:**
- Exact match with normalization
- Fuzzy matching (Levenshtein distance)
- Alternative names support
- Multi-language variants
- Match rate calculation

**Normalization Applied:**
- Accent removal
- Case harmonization
- Article stripping (le, la, the)
- Special character handling

## Integration with DuckDB

### SQL Analysis Macros

The system integrates with DuckDB for advanced analysis:

```sql
-- Column profiling
SELECT * FROM describe_full('table_name');

-- Statistical summary
SELECT * FROM summary_general('table_name', 'column');

-- Numeric analysis
SELECT * FROM summary_numeric('table_name', 'numeric_col');

-- Histograms
SELECT * FROM histogram_numeric('table_name', 'column');
```

## Error Handling

### Critical Errors (Block Creation)
- No geographic columns detected
- Match rate < 10% with selected catalogue
- File exceeds size limits
- Empty dataset

### Warnings (Allow with Caution)
- High percentage of null values (>50%)
- Performance concerns (large dataset)
- Low match confidence
- Duplicate values detected

## Configuration

### Customizing Thresholds

```typescript
// In deep-validator.utils.ts
private static readonly PERFORMANCE_THRESHOLDS = {
  maxRows: 10000,      // Customize as needed
  warningRows: 5000,
  maxColumns: 100,
  warningColumns: 50
};
```

### Adding Geographic Patterns

```typescript
// In geo-detector.utils.ts
private static readonly COLUMN_NAME_PATTERNS = {
  // Add new patterns
  postal_code: /^(zip|postal|code_postal)$/i,
  address: /^(address|adresse)$/i
};
```

### Custom Catalogues

```typescript
// In geo-matcher.utils.ts
const customCatalogue: CatalogueInfo = {
  id: 'my_regions',
  name: 'My Custom Regions',
  type: 'custom',
  entries: new Set(['REGION1', 'REGION2']),
  alternativeNames: new Map([
    ['REGION1', ['R1', 'REG1']]
  ])
};
```

## Validation Messages

Messages are contextual and localized:

```typescript
const ValidationMessages = {
  geoColumnNotFound: {
    fr: "Aucune colonne géographique détectée.",
    en: "No geographic column detected."
  },
  lowMatchRate: (rate: number) => ({
    fr: `Seulement ${rate}% de correspondance.`,
    en: `Only ${rate}% match rate.`
  })
};
```

## Testing Validation

### Unit Tests
```typescript
// Test geographic detection
const result = await GeoColumnDetector.detectGeoColumns(
  ['country', 'population'],
  [['France', 67000000], ['Germany', 83000000]]
);
expect(result.hasGeoColumns).toBe(true);
```

### E2E Tests
```typescript
// Test file import with validation
await page.setInputFiles('input[type="file"]', 'test-data.csv');
await expect(page.locator('.validation-error')).toBeHidden();
```

## Performance Considerations

| Operation | Strategy | Impact |
|-----------|----------|--------|
| Large Files | Sampling first 100 rows | Fast initial validation |
| Geo Detection | Parallel column analysis | Reduced latency |
| Fuzzy Matching | Levenshtein with cutoff | Bounded computation |
| Statistics | Streaming computation | Memory efficient |

## Future Enhancements

### Planned Features
- Machine learning for improved geo detection
- External catalogue APIs integration
- Streaming validation for huge files
- Custom validation rules UI
- Validation history and reports

### Performance Optimizations
- Web Worker offloading for heavy validation
- Incremental validation on data changes
- Catalogue caching with IndexedDB
- Lazy validation for non-critical checks

## Quick Reference

| Need | Module | Method |
|------|--------|--------|
| Validate file | FileValidator | `validate(file)` |
| Detect geo columns | GeoColumnDetector | `detectGeoColumns()` |
| Match with catalogue | GeoMatcher | `validateAgainstCatalogue()` |
| Deep analysis | DeepDataValidator | `analyzeDataContent()` |
| DuckDB validation | DuckDBValidatorService | `validateWithDuckDB()` |