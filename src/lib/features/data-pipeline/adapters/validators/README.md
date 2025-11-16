# Validators

## Validation Strategy (DuckDB-first)

La validation a été simplifiée pour l'approche DuckDB-first.

### Nouveau flow

```
Pre-flight Validation (size, format) →
DuckDB Processing →
Post-processing Validation (optional quality checks)
```

### Pre-flight validation

Effectuée dans `validateFile()` ([create-data-pipeline.ts:315-349](src/lib/features/data-pipeline/pipeline/create-data-pipeline.ts#L315-L349)):

```typescript
async function validateFile(file: File): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Size check
  if (file.size === 0) {
    errors.push('File is empty');
  }

  if (file.size > 50 * 1024 * 1024) {
    errors.push('File size exceeds 50MB limit');
  }

  // Format check
  const supportedExtensions = [
    '.csv',
    '.tsv',
    '.txt',
    '.geojson',
    '.json',
    '.shp',
    '.gpkg',
    '.kml',
    '.parquet',
    '.geoparquet'
  ];

  const isSupported = supportedExtensions.some((e) =>
    file.name.toLowerCase().endsWith(e)
  );
  if (!isSupported) {
    errors.push(`Unsupported file format: ${file.name}`);
  }

  return { isValid: errors.length === 0, errors, warnings };
}
```

### Checks effectués

| Check                | Type  | Rationale                                   |
| -------------------- | ----- | ------------------------------------------- |
| **File size = 0**    | Error | Fichier vide                                |
| **File size > 50MB** | Error | Limite mémoire browser                      |
| **Format supporté**  | Error | DuckDB supporte uniquement certains formats |

### DuckDB validation

DuckDB effectue sa propre validation lors du parsing:

- **Schema validation**: colonnes mal formées
- **Encoding detection**: UTF-8, Latin1, etc.
- **Type inference**: valeurs incompatibles avec type détecté

Si DuckDB échoue, l'erreur est propagée à l'utilisateur.

### Post-processing validation (optionnel)

Après `Duck.analyse()`, on peut ajouter des checks de qualité:

```typescript
const duckdbColumns = await Duck.analyse(tableName);

// Quality checks
const warnings: string[] = [];
for (const col of duckdbColumns) {
  if (col.nulls && col.count && Number(col.nulls) / Number(col.count) > 0.5) {
    warnings.push(`Column "${col.name}" has >50% null values`);
  }

  if (col.uniques && col.uniques === 1) {
    warnings.push(`Column "${col.name}" has only one unique value`);
  }
}
```

### Validators legacy (deprecated)

Les validators `SizeValidator`, `SchemaValidator`, `QualityValidator` sont **deprecated** car:

1. **SizeValidator**: Déjà fait dans pre-flight
2. **SchemaValidator**: DuckDB le fait nativement
3. **QualityValidator**: Peut être ajouté post-DuckDB si nécessaire

Ces classes sont conservées pour compatibilité mais ne sont plus utilisées.

### Migration guide

**Old approach:**

```typescript
const rawDataset = await parser.parse(file);
const validationResult = runValidators(rawDataset, validators);
if (!validationResult.isValid) {
  throw new Error(validationResult.errors.join(', '));
}
```

**New approach:**

```typescript
const validationResult = await validateFile(file);
if (!validationResult.isValid) {
  throw new Error(validationResult.errors.join(', '));
}
// DuckDB handles the rest
await Duck.read_tabular(file);
```

### Avantages

- **Plus rapide**: Pas besoin de parser le fichier pour valider
- **Plus simple**: Moins de code à maintenir
- **Plus robuste**: DuckDB gère les edge cases (encodings, etc.)
- **Meilleurs messages**: Erreurs DuckDB plus précises

### Extension

Pour ajouter des validations custom:

```typescript
async function validateCustomRules(
  tableName: string
): Promise<ValidationResult> {
  const analysis = await Duck.analyse(tableName);

  // Custom business logic
  const errors: string[] = [];
  const warnings: string[] = [];

  // Example: Check if required columns exist
  const requiredColumns = ['id', 'name', 'value'];
  for (const required of requiredColumns) {
    if (!analysis.find((col) => col.name === required)) {
      errors.push(`Missing required column: ${required}`);
    }
  }

  return { isValid: errors.length === 0, errors, warnings };
}
```
