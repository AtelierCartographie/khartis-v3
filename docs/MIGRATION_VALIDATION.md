# Migration Guide: New Validation System

## Overview

This guide helps you migrate existing code to use the new validation system introduced in Khartis v3.

## What's New

### New Modules

- `geo-detector.utils.ts` - Automatic geographic column detection
- `deep-validator.utils.ts` - Comprehensive data analysis
- `geo-matcher.utils.ts` - Catalogue matching with fuzzy logic
- `duckdb-validator.service.ts` - DuckDB-powered validation

### Enhanced Features

- Automatic detection of geographic columns
- Data quality scoring
- Performance warnings
- Fuzzy matching for geographic entities
- Multi-language support

## Migration Steps

### 1. Update File Import Flow

**Before:**

```typescript
// Basic validation only
const validation = validateFile(file);
if (validation.isValid) {
  processFile(file);
}
```

**After:**

```typescript
// Enhanced validation with geo detection
import { FileValidator } from '../utils/file-validator.utils';
import { DeepDataValidator } from '../utils/deep-validator.utils';

const validation = FileValidator.validate(file);
if (validation.isValid) {
  // Parse file first
  const data = await parseFile(file);

  // Deep analysis with geo detection
  const analysis = await DeepDataValidator.analyzeDataContent(
    headers,
    dataRows,
    { sampleSize: 100 }
  );

  if (!analysis.geoDetection.hasGeoColumns) {
    showError('No geographic columns detected');
    return;
  }

  processFile(file, analysis);
}
```

### 2. Add Geographic Column Detection

**Before:**

```typescript
// Manual column selection
const geoColumn = userSelectedColumn || 'country';
```

**After:**

```typescript
import { GeoColumnDetector } from '../utils/geo-detector.utils';

const detection = await GeoColumnDetector.detectGeoColumns(headers, data);

if (detection.suggestedPrimaryGeoColumn) {
  const geoColumn = detection.suggestedPrimaryGeoColumn.columnName;
  // Use with confidence score
  console.log(
    `Using ${geoColumn} (${detection.suggestedPrimaryGeoColumn.confidence * 100}% confidence)`
  );
}
```

### 3. Implement Catalogue Matching

**Before:**

```typescript
// Simple exact matching
const matches = values.filter((v) => catalogue.includes(v));
```

**After:**

```typescript
import { GeoMatcher } from '../utils/geo-matcher.utils';

const result = await GeoMatcher.validateAgainstCatalogue(
  values,
  'world_countries',
  { fuzzyMatch: true }
);

console.log(`Match rate: ${result.matchRate * 100}%`);
console.log(`Fuzzy matches: ${result.fuzzyMatches.length}`);

// Handle fuzzy matches
result.fuzzyMatches.forEach((match) => {
  console.log(
    `"${match.original}" → "${match.suggestion}" (${match.similarity * 100}%)`
  );
});
```

### 4. Update Type Definitions

**Add to your types file:**

```typescript
import type { DataAnalysisResult } from '../utils/deep-validator.utils';
import type { MatchResult } from '../utils/geo-matcher.utils';

interface UploadedFile {
  // ... existing fields
  deepAnalysis?: DataAnalysisResult;
  geoMatchResult?: MatchResult;
}
```

### 5. Handle Performance Warnings

**New feature - no direct migration needed:**

```typescript
// Analysis now includes performance warnings
if (analysis.performanceWarnings.length > 0) {
  analysis.performanceWarnings.forEach((warning) => {
    showWarning('Performance', warning);
  });
}

// Check against thresholds
if (analysis.rowCount > 10000) {
  // Handle large dataset
  enablePagination();
}
```

## Configuration Updates

### Custom Thresholds

Update performance thresholds in `deep-validator.utils.ts`:

```typescript
private static readonly PERFORMANCE_THRESHOLDS = {
  maxRows: 10000,    // Your limit
  warningRows: 5000,  // Your warning threshold
  maxColumns: 100,
  warningColumns: 50
};
```

### Custom Catalogues

Add your catalogues in `geo-matcher.utils.ts`:

```typescript
await GeoMatcher.loadCatalogue('my_custom_regions');
```

### Custom Geo Patterns

Extend patterns in `geo-detector.utils.ts`:

```typescript
private static readonly COLUMN_NAME_PATTERNS = {
  // Add your patterns
  district: /^(district|quartier|bezirk)$/i,
  postal: /^(postal|zip|plz|code_postal)$/i
};
```

## Breaking Changes

### 1. Validation Result Structure

The validation result now includes more detailed information:

```typescript
// Old
{ isValid: boolean; errors: string[] }

// New
{
  isValid: boolean;
  errors: string[];
  warnings: string[];
  requiresAsyncValidation?: boolean;
}
```

### 2. Required Geographic Data

Files without geographic columns will now be rejected:

```typescript
if (!analysis.geoDetection.hasGeoColumns) {
  // File rejection - maps require geographic data
}
```

### 3. Async Validation

Some validations are now async:

```typescript
// Now async
const asyncValidation = await FileValidator.validateAsync(file);
```

## Testing Your Migration

### Unit Tests

```typescript
describe('Validation Migration', () => {
  it('should detect geographic columns', async () => {
    const result = await GeoColumnDetector.detectGeoColumns(
      ['Country', 'Population'],
      [['France', 67000000]]
    );
    expect(result.hasGeoColumns).toBe(true);
  });

  it('should match with fuzzy logic', async () => {
    const result = await GeoMatcher.validateAgainstCatalogue(
      ['Frence'], // Typo
      'world_countries'
    );
    expect(result.fuzzyMatches[0].suggestion).toBe('FRANCE');
  });
});
```

### E2E Tests

```typescript
test('should validate file with geo detection', async ({ page }) => {
  await page.setInputFiles('input[type="file"]', 'data-with-geo.csv');

  // Should not show geo error
  await expect(page.locator('.geo-error')).toBeHidden();

  // Should show detected column
  await expect(page.locator('.detected-geo-column')).toBeVisible();
});
```

## Rollback Plan

If you need to temporarily disable the new validation:

```typescript
// Add feature flag
const USE_NEW_VALIDATION = false;

if (USE_NEW_VALIDATION) {
  // New validation flow
  const analysis = await DeepDataValidator.analyzeDataContent(headers, data);
} else {
  // Legacy validation
  const validation = legacyValidate(file);
}
```

## Common Issues & Solutions

### Issue: "No geographic column detected"

**Solution:** Check column names match expected patterns or add custom patterns.

### Issue: Low match rate with catalogue

**Solution:** Enable fuzzy matching or check normalization settings.

### Issue: Performance warning on small files

**Solution:** Adjust thresholds in configuration.

### Issue: TypeScript errors after update

**Solution:** Update type imports and add new optional fields.

## Support

For questions or issues:

1. Check the [VALIDATION.md](VALIDATION.md) documentation
2. Review test files for examples
3. Check existing implementations in `create-project.store.svelte.ts`

## Deprecation Timeline

- **v3.0.0** - New validation system introduced
- **v3.1.0** - Legacy validation deprecated (warnings)
- **v3.2.0** - Legacy validation removed

---

_Last updated: 24/09/2025_
