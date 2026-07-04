# DuckDB

> Architecture et API du moteur DuckDB WASM dans Khartis v3.

**Voir aussi** : [ARCHITECTURE.md](ARCHITECTURE.md) · [PIPELINE_DONNEES.md](PIPELINE_DONNEES.md) · [MAP.md](MAP.md) · [FONDS_DE_CARTE.md](FONDS_DE_CARTE.md)

---

## Architecture en 3 couches

```
duckDBOrchestrator          ← point d'entrée pour tout code applicatif
        ↓
    Duck (façade)           ← API publique bas niveau
        ↓
duckdb/core/   duckdb/io/   duckdb/operations/   duckdb/cache/   duckdb/macros/
```

**Règle d'accès** : tout code applicatif passe par `duckDBOrchestrator`. La façade `Duck` est réservée au code de bas niveau (pipeline, orchestrateur lui-même). Ne jamais instancier `AsyncDuckDB` directement.

---

## Initialisation

```typescript
// Appelé une seule fois au démarrage dans +layout.svelte
await initDuckDB();

// Ce qui se passe :
// 1. initEngine()    — charge DuckDB WASM (bundle mvp ou eh selon le navigateur),
//                      ouvre la connexion via Web Worker
// 2. loadMacros()    — enregistre les macros SQL (breaks, analyse, join, search, simplification)
// 3. LOAD spatial    — chargé une seule fois à l'init, jamais dans le code feature
```

L'init est **idempotente** : les appels concurrents réutilisent la même Promise. Après un échec, la Promise est réinitialisée pour permettre un retry. DuckDB WASM utilise les bundles `mvp` (baseline) ou `eh` (exception handling) selon les capacités du navigateur, sélectionnés via `selectBundle()`.

---

## Façade `Duck` — API publique

```typescript
import { Duck } from '$lib/features/duckdb/duck';

// Requêtes
await Duck.query('SELECT * FROM t', { format: 'array' | 'arrow' });

// Lecture de fichiers (crée une table DuckDB)
await Duck.read_tabular(file); // CSV/TSV/Parquet → table
await Duck.read_geofile(file); // GeoJSON/SHP/GPX → table avec géométrie
await Duck.read_geofile(file, { shapefile: true }); // Shapefile bundle
await Duck.read_link(url); // Fichier distant → table

// Analyse
await Duck.analyse(tableName); // Stats colonnes (min/max/nulls/patterns…)
await Duck.describeColumns(tableName); // Type + null_count par colonne

// Cache
Duck.invalidateTableCache(tableName); // Invalide describeCache + rowCountCache
Duck.get_table_metadata(tableName); // → { analysis, join, filters }
Duck.cleanupTableResources(tableName); // Supprime fichiers enregistrés + métadonnées
```

> `Duck.cleanupTableResources()` **ne supprime jamais la table DuckDB** elle-même. Il nettoie uniquement les ressources associées : fichiers enregistrés (`registered_files`), entrées des caches (`describeCache`, `rowCountCache`, `table_metadata`). Pour supprimer la table, appeler `dropTable()` séparément via l'orchestrateur.

---

## Macros SQL

Les macros sont enregistrées une fois dans `loadMacros()`. Elles définissent des fonctions SQL réutilisables dans tout le pipeline. Ne jamais les appeler manuellement en dehors des services qui les encapsulent.

### Macros de classification (`breaks_macros`)

Ces macros calculent les seuils de discrétisation directement en SQL, sans charger les valeurs en JavaScript. Elles retournent une colonne `LIST<DOUBLE>`.

```sql
kmeans(table, column, n)        -- Seuils naturels par K-means
quantile(table, column, n)      -- Quantiles (effectifs égaux)
equi_width(table, column, n)    -- Intervalles égaux
nested_means(table, column, n)  -- Moyennes emboîtées récursives
q6(table, column)               -- 6 classes prédéfinies (5e, 27.5e, 50e, 72.5e, 95e percentiles)
headtail2(table, column, n)     -- Head/tail breaks (distributions à longue queue)
```

Ce sont des **MACROs** (pas des fonctions) pour que le nom de colonne soit substitué dynamiquement. Les tests vérifient explicitement qu'on n'utilise pas `FUNCTION`. Le résultat (`LIST<DOUBLE>`) est extrait via le helper `toIterableValues()` qui gère les cas `TypedArray`, `Array`, et tout itérable — ne jamais tester `Array.isArray()` seul sur ce résultat.

### Macros de jointure (`join_macros`)

```sql
normalize_text_join(text)
  -- Normalisation pour matching insensible casse/accents :
  -- NFC normalize → strip accents → lowercase → trim → collapse spaces

get_similarity(text1, text2)
  -- Score Jaro-Winkler (0–1) entre deux chaînes normalisées
```

Utilisées par les opérations de jointure de `join-ops` et `finalizeJoin` pour le matching approximatif des entités géographiques avec le fond de carte.

### Macros de simplification (`simplification_macros`)

8 macros couvrant polygones et lignes :

```sql
simplify_and_clean(table, geom_col, tolerance)
  -- Pipeline complet polygones : snap → Douglas-Peucker → prune triangles

simplify_and_clean_linestring(table, geom_col, tolerance)
  -- Pipeline complet lignes : snap + Douglas-Peucker

extract_innerlines(table)
  -- Extrait les limites partagées entre polygones adjacents

snap_topology_normalized(table, geom_col, tolerance)
  -- Snap des vertex proches (correction micro-bords)
```

### Macros d'analyse et de recherche

- `analyse_macros` : stats par colonne (min, max, null_count, unique_count, avg, median, std_dev, top_values, patterns).
- `search_macros` : recherche textuelle full-text avec scoring de pertinence.

---

## Cache manager

Trois caches en mémoire, indexés par nom de table :

| Cache            | Type                                       | Contenu                          |
| ---------------- | ------------------------------------------ | -------------------------------- |
| `describeCache`  | `Map<string, ColumnInfo[]>`                | Résultats de `describeColumns()` |
| `rowCountCache`  | `Map<string, number>`                      | Nombre de lignes                 |
| `table_metadata` | `Map<string, { analysis, join, filters }>` | Résultats d'`analyse()`          |

**Invalidation** : un callback enregistré au démarrage (`registerTableMutationCallback`) appelle `Duck.invalidateTableCache(tableName)` à chaque mutation. Toute opération qui passe par `duckDBOrchestrator` déclenche ce callback automatiquement. Si une table est modifiée directement via `Duck.query()`, appeler `Duck.invalidateTableCache()` manuellement.

---

## Orchestrateur (`duckDBOrchestrator`)

Point d'entrée unique pour toutes les opérations de données. Il délègue à des sous-modules spécialisés, gère le cache WeakMap des Arrow tables, et maintient l'état réactif Svelte 5.

### Datasets

```typescript
await duckDBOrchestrator.processFile(fileDescriptor);
await duckDBOrchestrator.registerExistingTable(table, fileId, name);
await duckDBOrchestrator.dropTable(tableName);
await duckDBOrchestrator.clear(); // drop toutes les tables + reset état
```

### Arrow tables (lecture)

```typescript
await duckDBOrchestrator.getArrowTable(tableName); // cache WeakMap
await duckDBOrchestrator.getArrowTableDirect(tableName); // ignore le cache (prefetch)
await duckDBOrchestrator.getJoinedArrowTable(tableName, basemap);
await duckDBOrchestrator.getGPSArrowTable(datasetId);
```

**Cache WeakMap** : `getArrowTable()` retourne la **même référence** si les filtres et la table n'ont pas changé. Cela préserve toute la chaîne de caches en aval (GeoArrow binaire, bounds, centroïdes). Ne jamais utiliser `getArrowTableDirect()` sur le chemin de rendu : c'est uniquement pour le prefetch.

### Mutations de colonnes

```typescript
await duckDBOrchestrator.renameColumn(table, old, newName, { skipAnalysis? });
await duckDBOrchestrator.changeColumnType(table, col, sqlType);
await duckDBOrchestrator.dropColumn(table, col);
await duckDBOrchestrator.dropRows(table, rowIds);
await duckDBOrchestrator.refineColumn(table, col, operation);
await duckDBOrchestrator.addCalculatedColumn(table, name, expression);
await duckDBOrchestrator.testExpression(table, expression);  // → valeur ou null
```

> Sur les opérations en batch, passer `skipAnalysis: true` et appeler `getFullAnalysis(tableName, true)` une seule fois à la fin. Chaque mutation sans `skipAnalysis` déclenche un `Duck.analyse()` complet.

### Sécurité des expressions SQL

`validateExpression()` dans `column-ops.ts` rejette :

- Multi-statements (`;`)
- Sous-requêtes (`(SELECT…)`)
- Appels de fonctions dangereux (`read_csv('/tmp/…')`)
- Projections non agrégées sur plusieurs colonnes

### Filtres

```typescript
await duckDBOrchestrator.addFilter(tableName, { column, operator, value });
await duckDBOrchestrator.removeFilter(tableName, filterId);
await duckDBOrchestrator.deleteFilteredRows(tableName);
```

Les filtres sont stockés dans `state.svelte.ts` sous `filtersByTable`. Chaque filtre a un `id` auto-incrémenté.

### Jointures

```typescript
await duckDBOrchestrator.computeJoinStats(datasetId, basemap, geoColumn);
await duckDBOrchestrator.applyJoinCorrections(
  datasetId,
  geoColumn,
  corrections
);
// corrections = { 'Armenia': 'Arménie' }

await duckDBOrchestrator.finalizeJoin(datasetId, basemap, geoColumn);
// → { joinedBasemap, geoColumn, gpsMode, gpsColumns }
```

`finalizeJoin` utilise le **cache de similarité**. `ensureSimilarityCached()` le construit si nécessaire, puis `applyCachedJoinAssociation()` applique l'association. `invalidateSimilarityCache()` est appelé après toute correction utilisateur.

Le cache de similarité est une table DuckDB nommée avec le préfixe `__similarity_cache__` + l'identifiant du dataset. Elle est construite par `ensureSimilarityCached()` via un cross-join `dataset × basemap_attributes` filtré par `jaro_winkler_similarity(normalize_text_join(left), normalize_text_join(right), 0.85)`. La construction est coûteuse (O(N×M)) mais n'a lieu qu'une fois par dataset/fond ; les corrections utilisateur réutilisent cette table sans la recalculer.

### GPS

```typescript
await duckDBOrchestrator.getGPSArrowTable(datasetId);
// → { table: ArrowTable, latColumn, lonColumn }

await duckDBOrchestrator.getGPSBounds(datasetId);
// → { minLon, minLat, maxLon, maxLat } | null
```

Un dataset est en mode GPS quand `gpsMode: true` et `gpsColumns: { lat, lon }`. La vue GPS est créée avec `ST_Point(lon, lat)` et permet d'afficher les points sur un fond OSM sans jointure avec le catalogue.

`validateGPSColumns()` détecte les inversions lat/lon, les valeurs hors plage et les NULLs. `detectGPSColumns()` tente une résolution automatique depuis les noms de colonnes et les métadonnées sémiotiques.

### Recherche

```typescript
await duckDBOrchestrator.searchInTable(tableName, query);
// → { totalRows, matches: [{ row, column, snippet }] }
```

---

## Import de fond de carte (`basemap-import.utils.ts`)

Pipeline DuckDB déclenché quand un utilisateur importe un fichier géo comme fond de carte personnalisé.

**Polygones** :

```
ST_Read() → table_raw
    → simplify_and_clean()  → table_clean
    → extract_innerlines()  → table_innerlines
    → ST_MaximumInscribedCircle() → table_centroids
```

Résultat : 3 couches (POLYGON, LIMIT, CENTROID).

**Lignes** (`LINESTRING` / `MULTILINESTRING`) :

```
Clone source
    → simplify_and_clean_linestring(..., 0.0)  → géométries nettoyées
    → ST_PointOnSurface()                      → table_centroids
```

Résultat : 2 couches (LINE, CENTROID).

**Points** (`POINT` / `MULTIPOINT`) :

```
Géométries source inchangées
    → ST_PointOnSurface()  → table_centroids
```

Résultat : 2 couches (POINT, CENTROID).

Les tables CENTROID sont le chemin nominal pour le rendu des **Textes** et **Symboles** sur les primitives non-ponctuelles.

---

## Pièges courants

| Piège                                                | Symptôme                                                   | Solution                                                                           |
| ---------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Utiliser `Duck` au lieu de `duckDBOrchestrator`      | Cache pas invalidé, état désynchronisé                     | Toujours passer par `duckDBOrchestrator` depuis le code applicatif                 |
| Modifier une table sans `markTableMutated`           | Cache garde les anciennes métadonnées                      | Appeler `Duck.invalidateTableCache()` explicitement si mutation via `Duck.query()` |
| `getArrowTableDirect` sur le chemin de rendu         | Cache WeakMap invalidé, re-parsing GeoArrow à chaque frame | Utiliser `getArrowTable()` pour le rendu, `getArrowTableDirect()` pour le prefetch |
| Batch sans `skipAnalysis: true`                      | N appels `analyse()` coûteux                               | Passer `skipAnalysis: true` + 1 seul `getFullAnalysis(tableName, true)` à la fin   |
| Mock `Duck` sans enregistrer le callback de mutation | Cache ne se nettoie pas entre tests                        | Enregistrer et nettoyer le callback dans `beforeEach` / `afterEach`                |
