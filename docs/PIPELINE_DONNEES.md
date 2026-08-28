# Pipeline de données

> Architecture d'ingestion basée sur DuckDB WASM : formats supportés, détection, validation, processeurs et export.

**Voir aussi** : [ARCHITECTURE.md](ARCHITECTURE.md) · [DUCKDB.md](DUCKDB.md) · [GESTION_ETAT.md](GESTION_ETAT.md)

---

## Formats supportés

| Format               | Extensions                        | Méthode DuckDB          | Notes                                                         |
| -------------------- | --------------------------------- | ----------------------- | ------------------------------------------------------------- |
| CSV / TSV            | `.csv`, `.tsv`, `.txt`            | `read_csv()`            | Détection auto séparateur, décimal, en-tête                   |
| GeoJSON              | `.geojson`, `.json`               | `ST_Read()`             | Détection CRS via `ST_Read_Meta()`                            |
| Shapefile            | `.shp` (+ `.dbf`, `.shx`, `.prj`) | `ST_Read()`             | Bundle de fichiers requis ; import ZIP recommandé             |
| GeoPackage           | `.gpkg`                           | `ST_Read()`             | Support multi-couches, sélection auto de la couche principale |
| GeoParquet / Parquet | `.geoparquet`, `.parquet`, `.gpq` | `read_parquet()`        | Métadonnées GeoParquet détectées, géométrie normalisée        |
| GPX                  | `.gpx`                            | `ST_Read()` + parse XML | Seul format activé via processeur dédié                       |
| KML / KMZ            | `.kml`, `.kmz`                    | `ST_Read()` (GDAL)      | Pas de processeur dédié — fallback géo direct                 |
| ZIP                  | `.zip`                            | Détection interne       | Archive Shapefile ou bundle multi-datasets                    |

---

## Flux de traitement

```
Upload fichier
    └─ validateFile()
        ├─ Extension dans PIPELINE_CONST.EXTENSIONS.ALL ?
        ├─ Taille > 0 ?
        └─ Taille ≤ limite par format ?
            └─ processFileInternal()
                ├─ Type dans RAW_FILE_PROCESSOR_TYPES (GPX) → processeur dédié
                ├─ isGeospatialFile() → Duck.read_geofile() (ST_Read)
                └─ sinon → readTabularFile() (read_csv / read_parquet)
                    ├─ métadonnées `geo` présentes → normalizeGeoParquetTable()
                    └─ buildDatasetFromDuckTable()
                        └─ DatasetResult
```

Le routage de `processFileInternal()` suit trois branches :

1. **Processeur enregistré** : activé uniquement pour les types listés dans `RAW_FILE_PROCESSOR_TYPES` (actuellement `GPX` uniquement). Pour tout autre type, retourne `null` et force le fallback.
2. **Fallback géospatial** : tout fichier détecté par `isGeospatialFile()` (GeoJSON, Shapefile, GeoPackage, KML, KMZ) passe par `Duck.read_geofile()`.
3. **Fallback tabulaire** : CSV, TSV, Arrow, Parquet et GeoParquet passent par `Duck.read_tabular()`. Après `read_parquet()`, la présence de métadonnées GeoParquet déclenche la normalisation spatiale. Un Parquet sans ces métadonnées reste tabulaire.

Le handler ZIP relance `processFileInternal()` pour chaque fichier extrait, en appliquant le même routage.

---

## Détection automatique CSV

Le pipeline détecte quatre paramètres avant d'appeler `read_csv()`. Cette logique vit dans `utils/decimal-detector.ts` (délimiteur, séparateur décimal) et `utils/csv-header-detector.ts` (en-tête), et s'appuie sur les 20 premières lignes du fichier (lues une seule fois via `readFileHead()`).

**Séparateur de champ** : `detectFieldDelimiter()` compte les occurrences de `;`, `,`, `\t` et `|` sur la première ligne. Le plus fréquent est retenu.

**Séparateur décimal** : `detectDecimalSeparator()` cherche les patterns `X.XXX,XX` (format européen) et `X,XXX.XX` (format standard). Si le ratio européen dépasse le standard ET couvre plus de 30 % des valeurs, le format européen est retenu. Le séparateur de milliers correspondant est transmis à `read_csv()`.

**En-tête** : `detectCsvHeader()` compare les deux premières lignes. Si la première est 100 % numérique ou que les deux lignes ont une similarité de catégorie > 80 %, il n'y a pas d'en-tête.

**Retry sur zéro ligne** : si `read_csv()` retourne 0 ligne, le pipeline relance avec `ignore_errors=true, all_varchar=true` pour tolérer les fichiers malformés.

**Post-normalisation numérique** : après import, le pipeline rescanne les colonnes restées en `VARCHAR`. Si toutes les valeurs non-vides sont convertibles en nombre, la colonne est promueen `BIGINT` ou `DOUBLE` via DuckDB — sans perte.

---

## Registre de processeurs

Les processeurs sont enregistrés via `registerProcessor()` dans `processor-registry.ts`. Chaque processeur implémente :

```typescript
interface FileProcessor {
  supportedFileTypes: FileType[];
  canHandle(file: UploadedFile): boolean;
  process(ctx: ProcessContext, file: UploadedFile): Promise<ProcessorDataset>;
}
```

| Processeur            | FileTypes  | Actuellement actif via RAW_FILE_PROCESSOR_TYPES |
| --------------------- | ---------- | ----------------------------------------------- |
| `csvProcessor`        | CSV, TSV   | Non — fallback tabulaire                        |
| `geojsonProcessor`    | GEOJSON    | Non — fallback géo                              |
| `shapefileProcessor`  | SHP        | Non — fallback géo                              |
| `geopackageProcessor` | GPKG       | Non — fallback géo                              |
| `geoparquetProcessor` | GEOPARQUET | Non — fallback tabulaire                        |
| `gpxProcessor`        | GPX        | **Oui**                                         |

Pour activer un processeur sur un nouveau format, ajouter son `FileType` dans `RAW_FILE_PROCESSOR_TYPES` (dans `file-processor.ts`).

---

## Formats géospatiaux : comportements spécifiques

**Shapefile** : les companions `.shx` et `.dbf` sont obligatoires. Sans eux, `ParseError` est levé. `register_files({ shapefile: true })` enregistre le bundle avant la lecture.

**GeoPackage** : si `ST_Read()` échoue dans le navigateur (le build WASM DuckDB ne supporte pas tous les GeoPackage), Khartis bascule sur un fallback client-only : lecture SQLite WASM → extraction WKB → reprojection éventuelle vers EPSG:4326 → GeoJSON temporaire → pipeline normal. Ce fallback est limité à l'import de fond de carte GeoPackage.

**GeoPackage multi-couches** : la couche spatiale principale est sélectionnée automatiquement. L'heuristique préfère les polygones, puis les lignes, puis les points, et retient la couche la plus riche en entités dans chaque famille.

**GeoParquet** : le pipeline lit les métadonnées `geo` avant de libérer le fichier DuckDB, puis transforme la colonne géométrique principale en type DuckDB `GEOMETRY`. Les encodages WKB et GeoArrow natifs `point`, `multipoint`, `linestring`, `multilinestring`, `polygon` et `multipolygon` sont pris en charge, avec coordonnées séparées ou intercalées. Un CRS déclaré autre que WGS84/CRS84 est reprojeté vers EPSG:4326. Un encodage non pris en charge produit une erreur de validation explicite plutôt qu'une carte vide ou grise. L'identifiant `__id` est ensuite ajouté via `CREATE SEQUENCE`.

**GPX** : processeur dédié (`gpxProcessor`). Parse le XML pour extraire points et lignes, puis insère via `ST_Read()`.

---

## Archives ZIP

`unzip()` (bibliothèque `fflate`, pas de dépendance Node). Limite de décompression : **500 Mo** (protection anti-zip bombs). Les fichiers macOS (`__MACOSX/`, `._`) et les entrées répertoires sont ignorés.

**Détection archive Shapefile** : un ZIP est considéré comme un Shapefile si et seulement si il contient exactement un `.shp` avec ses companions (`.dbf`, `.shx`) partageant le même basename. Sinon, il est traité comme un **ZIP générique** (bundle multi-datasets).

```
ZIP
├─ isShapefileArchive() → vrai  →  processShapefileArchive()     (1 dataset)
└─ isShapefileArchive() → faux  →  processGenericZip()
       ├─ 1 fichier supporté    →  processSingleFileFromZip()
       └─ N fichiers supportés  →  processMultipleFilesFromZip()  (ZipDatasetResult)
```

---

## Validation

`validateFile()` vérifie dans l'ordre :

1. Extension appartenant à `PIPELINE_CONST.EXTENSIONS.ALL`.
2. Taille non nulle (`file.size === 0` → rejeté).
3. Taille maximale par format :

| Formats                                      | Limite |
| -------------------------------------------- | ------ |
| CSV / TSV / GeoJSON / JSON / KML / KMZ / GPX | 150 Mo |
| GeoPackage / GeoParquet / Arrow / Shapefile  | 200 Mo |
| ZIP générique                                | 100 Mo |

4. Avertissement si la taille dépasse 80 % de la limite (ne bloque pas le traitement).

---

## Avertissements qualité

`computeQualityWarnings()` génère des avertissements à partir des statistiques DuckDB :

| Condition                              | Clé i18n                           |
| -------------------------------------- | ---------------------------------- |
| `rowCount === 0`                       | `pipeline_warning_no_data_rows`    |
| `rowCount === 1`                       | `pipeline_warning_single_row`      |
| `rowCount < 5`                         | `pipeline_warning_small_dataset`   |
| `nullRatio > 0.5` (par colonne)        | `pipeline_warning_high_nulls`      |
| `uniquenessRatio < 0.01` (par colonne) | `pipeline_warning_low_cardinality` |

---

## Reprojection (fallback proj4)

`ST_Transform` dans DuckDB WASM ne supporte pas toutes les projections — le build WASM n'embarque pas la base PROJ complète. Le fallback `reprojection.ts` prend le relais :

```
1. Tentative ST_Transform via DuckDB
2. Échec → extraction des géométries en WKT
3. Reprojection des coordonnées via proj4.js (côté client JS)
4. Mise à jour de la table DuckDB avec les WKT reprojetés
```

Projections couvertes par le fallback : EPSG:2154 (Lambert-93), EPSG:27572 (Lambert II étendu), EPSG:32631 / 32632 (UTM zones 31N / 32N), EPSG:3035 (LAEA Europe), plus la conversion EPSG:4326 ↔ EPSG:3857 (Web Mercator). Pour les points, le traitement se fait par batch de 5 000 ; pour les polygones et lignes, par batch de 1 000.

---

## Traitement distant

```typescript
await dataPipeline.processRemoteFile(url, { tableName: 'remote_data' });
```

- `fetch()` → `File` → `processFileInternal()` : le fichier téléchargé suit le pipeline local complet (détection en-tête/délimiteur/décimales incluse).
- Pour une URL ZIP : `processZipFile()` est appelé après téléchargement.
- HTTP 404 → `Error` avec code `pipeline_error_fetch_failed`.
- `.shp` standalone rejeté (Shapefile sans companions → `ParseError`).

---

## Persistance des assets source

Le pipeline ne stocke pas les octets bruts dans le JSON projet. Stratégie :

- Le projet persiste des **métadonnées** : `assetRef`, aperçu limité, statistiques, transformations, jointures.
- Les fichiers source vivent dans IndexedDB (`project_asset_chunks`, chunks de 8 Mo).
- À la réouverture, `createFileFromUpload()` reconstruit un `File` depuis l'`assetRef`, puis `addFile()` rejoue le pipeline DuckDB.

---

## Interface `DatasetResult`

```typescript
interface DatasetResult {
  id: string;
  name: string;
  sourceFileId: string;
  tableName: string;
  columns: EnrichedColumn[];
  rowCount: number;
  geometry?: GeometryInfo;
  metadata: DatasetMetadata; // { processedAt, fileType, parserUsed, … }
  analysis?: AnalysisResult; // { columns, hasGeoData, geoColumns, rowCount, warnings }
  geoDetection?: GeoDetectionResult;
  bounds?: { minLat; maxLat; minLon; maxLon };
  joinedBasemap?: string;
  geoColumn?: string;
}
```

Ne jamais modifier `DatasetResult` sans mettre à jour les tests dans `tests/pipeline/`.

---

## API publique

```typescript
import { dataPipeline } from '$lib/features/data-pipeline';

await dataPipeline.initialize();

const result = await dataPipeline.processFile(file);
const result = await dataPipeline.processRemoteFile(url, { tableName });
const result = await dataPipeline.processPastedData(csvContent, {
  name: 'pasted'
});

const validation = await dataPipeline.validateFile(file);
```
