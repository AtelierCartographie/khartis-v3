# Pipeline de donnees

> Architecture d'ingestion basee sur DuckDB WASM

**Voir aussi** : [Architecture](ARCHITECTURE.md) | [Gestion de l'etat](GESTION_ETAT.md) | [Visualisation](VISUALISATIONS.md)

---

## Formats supportes

| Format               | Extensions                        | Methode                   | Notes                                          |
| -------------------- | --------------------------------- | ------------------------- | ---------------------------------------------- |
| CSV / TSV            | `.csv`, `.tsv`, `.txt`            | DuckDB `read_csv()`       | Detection automatique du separateur decimal    |
| GeoJSON              | `.geojson`, `.json`               | DuckDB `ST_Read()`        | Datasets spatiaux                              |
| Shapefile            | `.shp` (+ `.dbf`, `.shx`)         | DuckDB `ST_Read()`        | Bundle de fichiers requis                      |
| GeoPackage           | `.gpkg`                           | DuckDB `ST_Read()`        | Support spatial natif                          |
| GeoParquet / Parquet | `.geoparquet`, `.parquet`, `.gpq` | `geoParquetReader` (WASM) | Arrow insertion + conversion geometrie WKB     |
| KML / KMZ            | `.kml`, `.kmz`                    | Detection de format       | Extensions reconnues (pas de processeur dedie) |
| GPX                  | `.gpx`                            | Detection de format       | Extension reconnue (pas de processeur dedie)   |

## Flux de traitement

```
1. Upload fichier
       |
2. validateFile()  -->  taille, extension, type MIME
       |
3. getProcessor()  -->  registre par priorite
       |
4. processor.process()  -->  creation table DuckDB
       |
5. buildDatasetFromDuckTable()  -->  analyse + stats via Duck.analyse()
       |
6. DatasetResult  -->  colonnes enrichies, geometrie, avertissements
```

## Architecture : Registry Pattern

Le pipeline utilise un **registre de processeurs** (pattern Strategy, principe ouvert/ferme SOLID).

```ts
interface FileProcessor {
  readonly supportedFileTypes: FileType[];
  canHandle(file: UploadedFile): boolean;
  process(ctx: ProcessContext, file: UploadedFile): Promise<ProcessorDataset>;
}

function registerProcessor(processor: FileProcessor, priority?: number): void;
function getProcessor(file: UploadedFile): FileProcessor | null;
```

`FileType` est defini dans `commons/store/create-project.types.ts`, `ProcessContext` et `ProcessorDataset` dans `processors/file-processor.interface.ts`.

### Processeurs enregistres

| Processeur          | Types             | Priorite | Notes                                     |
| ------------------- | ----------------- | -------- | ----------------------------------------- |
| csvProcessor        | CSV, TSV, TXT     | 10       | DuckDB `read_csv()` avec options          |
| geojsonProcessor    | GeoJSON           | 10       | DuckDB `ST_Read()`                        |
| shapefileProcessor  | SHP bundle        | 10       | Necessite .shp + .dbf + .shx              |
| geopackageProcessor | GPKG              | 10       | Spatial natif DuckDB                      |
| geoparquetProcessor | GeoParquet, Arrow | 10       | `geoParquetReader` WASM + Arrow insertion |

Enregistrement dans `processors/register-processors.ts`. Les fichiers ZIP sont geres separement dans `processors/zip-processor.ts` (extraction puis delegation au processeur adequat). Les fichiers KML/KMZ et GPX sont reconnus comme formats valides mais n'ont pas de processeur strategy dedie.

## API publique

```ts
import { dataPipeline } from '$lib/features/data-pipeline';

// Initialisation (une fois au demarrage)
await dataPipeline.initialize();

// Traitement de fichiers
const result = await dataPipeline.processFile(file);
const result = await dataPipeline.processUploadedFile(
  uploadedFile,
  originalFile
);
const result = await dataPipeline.processRemoteFile(url, {
  tableName: 'remote_data'
});
const result = await dataPipeline.processPastedData(csvContent, {
  name: 'pasted'
});

// Jointures
await dataPipeline.joinDatasetById(tableName, idColumn, options);
await dataPipeline.applyJoinAssociation(tableName, basemap);

// Validation
const validation = await dataPipeline.validateFile(file);
```

## Interface DatasetResult

```ts
interface DatasetResult {
  id: string;
  name: string;
  sourceFileId: string;
  tableName: string;
  columns: EnrichedColumn[];
  rowCount: number;
  geometry?: GeometryInfo;
  metadata: DatasetMetadata; // { processedAt, fileType, parserUsed, ... }
  data?: Record<string, unknown>[];
  format?: FileFormat;
  analysis?: AnalysisResult; // { columns, hasGeoData, geoColumns, rowCount, warnings }
  geoDetection?: GeoDetectionResult;
  bounds?: { minLat; maxLat; minLon; maxLon };
  joinedBasemap?: string;
  geoColumn?: string;
}
```

Defini dans `src/lib/features/data-pipeline/types.ts`.

## Moteur DuckDB (`src/lib/features/duckdb/`)

```
duckdb/
  duck.ts                 # Facade singleton Duck
  core/
    engine.ts             # Init WASM, extensions
    query.ts              # Execution SQL + conversion Arrow
    transaction.ts        # TransactionMutex
  io/
    readers.ts            # read_tabular, read_geofile, read_link
    reprojection.ts       # Fallback proj4js
    exporters.ts          # CSV, GeoParquet
    arrow-converter.ts    # Insertion Arrow table dans DuckDB
  cache/
    cache-manager.ts      # Cache describe, rowcount, geoparquet
  operations/
    analysis.ts           # analyse, describeColumns
    search.ts             # searchInTable (2 phases + cache)
    join.ts               # join_by_id, apply_join_association
    simplification.ts     # Simplification geometrie
    table-ops.ts          # Operations sur les tables
  macros/                 # Macros SQL (analyse, breaks, join, search, simplification)
  orchestrator/           # Service reactif Svelte 5
    orchestrator.svelte.ts
    dataset-state.ts
```

### Transactions

Les operations d'ingestion (`read_tabular`, `read_geofile`, `read_link`) sont encapsulees dans `runInTransaction`. Un `TransactionMutex` empeche les executions concurrentes.

### Cache

Cache memoire LRU (~100 Mo) pour les buffers GeoParquet, les descriptions de table et les comptages de lignes. Les mutations invalident automatiquement les entrees concernees via `invalidateTableCache()`.

## Reprojection (fallback proj4js)

`ST_Transform` de DuckDB WASM ne supporte pas toutes les projections (le build WASM n'a pas acces a la base PROJ complete). Cela concerne notamment le **Lambert-93 (EPSG:2154)**, frequent dans les datasets francais.

```
1. Tentative ST_Transform via DuckDB
2. En cas d'echec --> extraction des geometries en WKT
3. Reprojection des coordonnees avec proj4js (cote client)
4. Mise a jour de la table DuckDB avec le WKT reprojete
```

**Projections supportees par le fallback** :

- EPSG:2154 -- Lambert-93 (France metropolitaine)
- EPSG:27572 -- Lambert II etendu
- EPSG:32631 / 32632 -- UTM zones 31N / 32N

proj4js est utilise **uniquement** pour la transformation de coordonnees. Les donnees restent dans DuckDB pour toutes les autres operations.

## Optimisations

| Defi                     | Solution                                                    |
| ------------------------ | ----------------------------------------------------------- |
| Imports volumineux       | Parsing natif DuckDB (read_csv, read_parquet, ST_Read)      |
| Conversions multiples    | Pipeline en une seule passe                                 |
| Preservation metadonnees | GeoParquet avec encodage GeoArrow                           |
| Concurrence              | `TransactionMutex` serialise les operations d'ingestion     |
| Fichiers ephemeres       | Cleanup via `dropRegisteredFile` apres creation de la table |

**Cible** : < 3 s de chargement pour un dataset standard, ~60 fps en pan/zoom.

## Ajouter un nouveau processeur

```ts
// 1. Creer la strategie dans processors/strategies/
export const myProcessor: FileProcessor = {
  supportedFileTypes: [FileType.MY_FORMAT],
  canHandle: (file) => file.fileType === FileType.MY_FORMAT,
  process: async (ctx, file) => {
    /* implementation retourne ProcessorDataset */
  }
};

// 2. Exporter depuis processors/strategies/index.ts

// 3. Enregistrer dans processors/register-processors.ts
registerProcessor(myProcessor, 10);

// 4. Ajouter le FileType dans commons/store/create-project.types.ts
export enum FileType {
  MY_FORMAT = 'my-format'
}

// 5. Ajouter l'extension dans data-pipeline/constants.ts
// 6. Mettre a jour detectFileFormat() dans core/format-detector.ts
```

Types (`DatasetResult`, `EnrichedColumn`, `ColumnType`) definis dans `src/lib/features/data-pipeline/types.ts`.
