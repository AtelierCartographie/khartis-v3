# Type Inference

## DuckDB-first + Semantic Enrichment

Le système d'inférence de types a été simplifié pour s'appuyer sur DuckDB tout en ajoutant une couche d'enrichissement sémantique.

### Architecture

```
DuckDB analyse() → Type basique (string/numeric/date) →
Semantic enrichment → Type sémantique (QTA/QTR/QL/QLO/geometry/geoid/geolat/geolon)
```

### Types sémantiques

| Type         | Description          | Exemples                    | Détection                                            |
| ------------ | -------------------- | --------------------------- | ---------------------------------------------------- |
| **QTA**      | Quantitative Absolu  | Population, surface, nombre | Numerique + integers > 80%                           |
| **QTR**      | Quantitative Relatif | %, taux, proportion         | Numeric + ratio words ('%, rate, ratio, proportion') |
| **QL**       | Qualitatif           | Catégories, noms            | String values                                        |
| **QLO**      | Qualitatif Ordonné   | Rangs, niveaux              | Numeric + rank words ('rank, ranking, order')        |
| **geometry** | Géométrie            | WKT, GeoJSON                | Column name contains 'geom' or 'geometry'            |
| **geoid**    | Identifiant géo      | Codes pays, départements    | Contains 'id', 'code', 'key'                         |
| **geolat**   | Latitude             | -90 to 90                   | Name matches 'lat', 'latitude'                       |
| **geolon**   | Longitude            | -180 to 180                 | Name matches 'lon', 'lng', 'longitude'               |

### Logique d'inférence

Implémentée dans `inferSemanticType()` ([create-data-pipeline.ts:881-924](src/lib/features/data-pipeline/pipeline/create-data-pipeline.ts#L881-L924)):

1. **Geometry detection** (priorité 1)
   - Si nom contient "geom" ou est "geometry"

2. **Geo coordinates** (priorité 2)
   - Latitude: `/^(lat|latitude)$/i`
   - Longitude: `/^(lon|lng|longitude)$/i`

3. **ID detection** (priorité 3)
   - Mots-clés: 'id', 'code', 'key', 'identifier'

4. **Numeric with semantic context**
   - Ratio (QTR): '%', 'rate', 'ratio', 'proportion', 'percent', 'share'
   - Rank (QLO): 'rank', 'ranking', 'order', 'position'
   - Absolute (QTA): Default si >80% integers

5. **Fallback to Qualitative (QL)**
   - Text/categorical data

### Utilisation

```typescript
import { Duck } from '$lib/features/duckdb';

// 1. DuckDB analyze (type inference + statistics)
const duckdbColumns = await Duck.analyse(tableName);
// Returns: { name, type_simple, count, nulls, uniques, min, max, mean, median, stddev }

// 2. Semantic enrichment
const enrichedColumns = enrichColumnsWithSemanticTypes(duckdbColumns);
// Adds: semanticType field based on column name patterns
```

### Avantages vs ancien système

| Aspect             | Old (HeuristicTypeInferrer)   | New (DuckDB + Semantic)   |
| ------------------ | ----------------------------- | ------------------------- |
| **Type inference** | Client-side (sample 100 rows) | DuckDB SQL (full dataset) |
| **Performance**    | ~100ms                        | ~50ms (dans Duck.analyse) |
| **Accuracy**       | Limited to sample             | Full dataset analysis     |
| **Semantic types** | No                            | Yes (QTA/QTR/QL/QLO)      |
| **Maintenance**    | Complex heuristics            | Simple pattern matching   |

### Exemple de résultat

```typescript
{
  name: "population",
  values: [], // Data stays in DuckDB
  type: ColumnType.NUMBER,
  stats: {
    count: 1000,
    nulls: 0,
    uniques: 998,
    min: 100000,
    max: 1400000000,
    mean: 45000000,
    median: 25000000,
    stdDev: 120000000
  },
  semanticType: "QTA" // Inferred from numeric + high integer share
}
```

### Extension

Pour ajouter de nouveaux types sémantiques:

1. Ajouter la détection dans `inferSemanticType()`
2. Documenter les patterns de détection
3. Ajouter tests si nécessaire

### Migration depuis l'ancien système

L'ancien `HeuristicTypeInferrer` est **deprecated** mais conservé pour compatibilité.

Pour migrer:

- Remplacer `typeInferrer.inferColumnTypes()` par `enrichColumnsWithSemanticTypes(duckdbColumns)`
- Les types de base viennent maintenant de DuckDB
- Les types sémantiques sont ajoutés automatiquement
