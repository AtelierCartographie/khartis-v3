# Référence technique

> Types principaux, hiérarchie d'erreurs, logger, raccourcis clavier, fonctions de validation, limites de stockage, et commandes. Source unique pour les contrats d'interface transversaux.

**Voir aussi** : [ARCHITECTURE.md](ARCHITECTURE.md) · [GESTION_ETAT.md](GESTION_ETAT.md) · [PIPELINE_DONNEES.md](PIPELINE_DONNEES.md) · [GLOSSAIRE.md](GLOSSAIRE.md)

---

## Types principaux

### Projet

```typescript
// src/lib/features/project-management/types.ts
interface KhartisProject {
  id: string;
  manifest: {
    version: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    format: 'kh';
  };
  data: {
    sourceFiles: UploadedFile[];
    basemap?: { type: string; id: string; data?: unknown };
  };
  visualization?: VisualizationConfig;
  layout?: LayoutConfig;
  resources?: Record<string, unknown>;
}
```

### Visualisation

```typescript
// src/lib/features/commons/stores/visualization.store.svelte.ts
enum VisualizationType {
  CHOROPLETH = 'choropleth',
  PROPORTIONAL = 'proportional',
  CATEGORICAL = 'categorical',
  BIVARIATE = 'bivariate'
}

enum ClassificationMethod {
  EQUAL_INTERVAL = 'equal_interval',
  QUANTILES = 'quantiles',
  KMEANS = 'kmeans',
  MANUAL = 'manual',
  Q6 = 'q6',
  NESTED_MEANS = 'nested_means',
  HEAD_TAIL = 'head_tail'
}
```

### Fichier

```typescript
// src/lib/features/commons/types/create-project.types.ts
enum FileType {
  CSV = 'csv',
  TSV = 'tsv',
  GEOJSON = 'geojson',
  SHAPEFILE = 'shapefile',
  GEOPACKAGE = 'geopackage',
  GEOPARQUET = 'geoparquet',
  ARROW = 'arrow',
  KML = 'kml',
  KMZ = 'kmz',
  GPX = 'gpx',
  ZIP = 'zip',
  UNKNOWN = 'unknown'
}

enum FileStatus {
  UPLOADING = 'uploading',
  PROCESSING = 'processing',
  COMPLETE = 'complete',
  EDIT = 'edit',
  ERROR = 'error',
  INCOMPLETE = 'incomplete'
}
```

### Opérateurs de filtres

10 opérateurs supportés par `addFilter()` (`duckdb/orchestrator/filter-ops.ts`) :

| Opérateur    | SQL équivalent              | Sémantique                  |
| ------------ | --------------------------- | --------------------------- |
| `gte`        | `>=`                        | Supérieur ou égal           |
| `lte`        | `<=`                        | Inférieur ou égal           |
| `equals`     | `=`                         | Égal                        |
| `not_equals` | `!=`                        | Différent                   |
| `contains`   | `ILIKE`                     | Contient (insensible casse) |
| `between`    | `BETWEEN a AND b`           | Encadrement                 |
| `top_asc`    | `ORDER BY col LIMIT N`      | N plus petites valeurs      |
| `top_desc`   | `ORDER BY col DESC LIMIT N` | N plus grandes valeurs      |
| `empty`      | `IS NULL OR = ''`           | Vide ou NULL                |
| `not_empty`  | `IS NOT NULL AND != ''`     | Non vide                    |

### Catégorie « Nationale » (projections)

Codes EPSG retenus pour la catégorie « Nationale » de l'outil Projections (`step-toolbar/tools/projections/data.ts` + `national-region-label.ts`) :

| Zone / pays | Projection                     | EPSG       |
| ----------- | ------------------------------ | ---------- |
| Europe      | LAEA                           | 3035       |
| France      | Lambert-93                     | 2154       |
| Royaume-Uni | OSGB36 / British National Grid | 27700      |
| Irlande     | Irish Transverse Mercator      | 2157       |
| Suisse      | Swiss Oblique Mercator         | 2056       |
| Autres pays | Projection officielle du pays  | selon pays |

L'UI affiche le nom du pays/zone à côté du badge « Nationale » (ex. « Nationale · France »), car « Nationale » seul est ambigu — `national-eu` (Europe LAEA) n'est pas une projection française.

### Colonnes

```typescript
// src/lib/features/data-pipeline/types.ts
enum ColumnType {
  BOOLEAN = 'boolean',
  DATE = 'date',
  NUMBER = 'number',
  GEOMETRY = 'geometry',
  TEXT = 'text'
}
```

### DatasetResult

```typescript
interface DatasetResult {
  id: string;
  name: string;
  sourceFileId: string;
  tableName: string;
  columns: EnrichedColumn[];
  rowCount: number;
  geometry?: GeometryInfo;
  metadata: DatasetMetadata;
  analysis?: AnalysisResult;
  geoDetection?: GeoDetectionResult;
  bounds?: { minLat: number; maxLat: number; minLon: number; maxLon: number };
  joinedBasemap?: string;
  geoColumn?: string;
}
```

Ne jamais modifier `DatasetResult` sans mettre à jour les tests dans `tests/pipeline/`.

---

## Hiérarchie d'erreurs

Toutes les erreurs du pipeline héritent de `PipelineError`. Fichier : `src/lib/features/commons/pipeline.errors.ts`.

| Classe                | Code                    | Fatal | Contexte                     |
| --------------------- | ----------------------- | ----- | ---------------------------- |
| `PipelineError`       | (variable)              | Oui   | Erreur de base               |
| `DataValidationError` | `DATA_VALIDATION_ERROR` | Oui   | Données invalides à l'import |
| `ParseError`          | `PARSE_ERROR`           | Oui   | Lecture de fichier échouée   |
| `DuckDBError`         | `DUCKDB_ERROR`          | Oui   | Requête DuckDB échouée       |
| `NonFatalError`       | (variable)              | Non   | Toast sans rollback          |
| `DuplicateFileError`  | `DUPLICATE_FILE`        | Non   | Fichier déjà importé         |

Guards : `isPipelineError(err)`, `isFatalError(err)`, `formatError(err)`.

```typescript
import { isFatalError } from '$lib/features/commons/pipeline.errors';
import {
  showError,
  showWarning
} from '$lib/features/commons/utils/notification.utils.svelte';

try {
  await dataPipeline.processFile(file);
} catch (err) {
  if (isFatalError(err)) {
    showError(
      m.error_fatal_import_title(),
      err instanceof Error ? err.message : m.error_unknown_message()
    );
  } else {
    showWarning(
      m.warning_generic_title(),
      err instanceof Error ? err.message : m.warning_import_message()
    );
  }
}
```

---

## Logger

Ne jamais utiliser `console.log` dans le code de production. Utiliser le logger conditionnel (désactivé en test et production) :

```typescript
import { logger, LogCategory } from '$lib/features/commons/utils/logger';

logger.error('message', LogCategory.SYSTEM, error);
```

Catégories disponibles :

`DATA` · `STORE` · `DUCKDB` · `MAP` · `UI` · `PERSISTENCE` · `PROJECT` · `VISUALIZATION` · `FILE` · `EXPORT` · `SYSTEM`

---

## Raccourcis clavier

Gérés dans `keyboard-shortcuts.svelte`. Séquences à deux touches : `Ctrl+K` suivi d'une lettre dans les 2 secondes.

| Action                  | macOS               | Windows / Linux       |
| ----------------------- | ------------------- | --------------------- |
| Navigation latérale     | Ctrl+K, B           | Ctrl+K, B             |
| Nouveau projet          | Ctrl+K, N           | Ctrl+K, N             |
| Ouvrir un projet        | Ctrl+K, O           | Ctrl+K, O             |
| Sauvegarder le projet   | Ctrl+K, S           | Ctrl+K, S             |
| Dupliquer un projet     | Ctrl+K, D           | Ctrl+K, D             |
| Supprimer un projet     | Ctrl+K, X           | Ctrl+K, X             |
| Onglet Données          | 1                   | 1                     |
| Onglet Visualisations   | 2                   | 2                     |
| Onglet Habillage        | 3                   | 3                     |
| Basculer mode zoom      | Alt+Z               | Alt+Z                 |
| Zoom + / – / reset      | Cmd +/–/0           | Ctrl +/–/0            |
| Annuler                 | Cmd+Z               | Ctrl+Z                |
| Rétablir                | Cmd+Shift+Z / Cmd+Y | Ctrl+Shift+Z / Ctrl+Y |
| Zoom molette            | Cmd+molette         | Ctrl+molette          |
| Fermer modale / panneau | Escape              | Escape                |

---

## Fonctions de validation

Fichiers : `src/lib/features/commons/utils/validation.utils.ts` + `sanitize.utils.ts`

| Fonction                                        | Règle                                          |
| ----------------------------------------------- | ---------------------------------------------- |
| `ProjectValidator.validateProjectName(name)`    | Max 255 caractères, pas de caractères spéciaux |
| `ProjectValidator.validateFileSize(file)`       | Taille ≤ limite par format (100–200 Mo)        |
| `ProjectValidator.validateProjectSize(project)` | Snapshot metadata-only ≤ 150 Mo                |
| `ProjectValidator.validateStorageCapacity()`    | Max 50 projets (alerte à 40)                   |
| `DataValidator.validateCSVData(data)`           | Validation post-parsing CSV                    |
| `DataValidator.validateGeoData(geo)`            | Validation post-parsing GeoJSON                |
| `sanitizeProjectName(name)`                     | Nettoyage du nom de projet                     |
| `sanitizeTextInput(str)`                        | Nettoyage de saisie utilisateur (anti-XSS)     |
| `escapeSqlString(str)`                          | Échappement de chaînes pour injection DuckDB   |

---

## Limites de stockage

| Ressource                                   | Limite | Alerte |
| ------------------------------------------- | ------ | ------ |
| CSV / TSV / GeoJSON / KML / KMZ / GPX       | 150 Mo | 80 %   |
| GeoPackage / GeoParquet / Arrow / Shapefile | 200 Mo | 80 %   |
| ZIP générique                               | 100 Mo | 80 %   |
| Snapshot projet (metadata-only)             | 150 Mo | 80 %   |
| Nombre de projets                           | 50     | 40     |

IndexedDB : 5 object stores (`projects`, `metadata`, `project_assets`, `project_asset_chunks`, `project_asset_refs`). Chunks binaires de 8 Mo max. Les données ne quittent jamais le navigateur.

---

## Sécurité et vie privée

- **Pas de serveur** : tout le traitement s'effectue dans le navigateur via DuckDB WASM.
- **Pas d'API externe** pour les données utilisateur — seul le téléchargement des fonds de carte et des extensions DuckDB nécessite le réseau.
- **Assainissement** : noms de fichiers, cellules CSV (anti-injection de formule), saisies utilisateur.
- **Validation d'expression SQL** : `validateExpression()` bloque les multi-statements, sous-requêtes et appels de fonctions dangereuses dans les colonnes calculées.

---

## i18n — Paraglide JS 2

Messages compile-time, type-safe, zero overhead runtime. Locales : FR (par défaut), EN.

```typescript
import * as m from '$lib/paraglide/messages';

// Clé simple
<button>{m.create_project_button()}</button>

// Clé avec interpolation
<p>{m.create_project_processing_file({ name: file.name })}</p>
```

Convention de clés : `snake_case` sémantique par feature. Sources : `messages/en.json` et `messages/fr.json`. Ne jamais éditer `src/lib/paraglide/` (code généré). Après ajout de clés : `pnpm machine-translate` puis révision.

---

## Commandes de développement

| Commande                   | Description                                                               |
| -------------------------- | ------------------------------------------------------------------------- |
| `pnpm dev`                 | Serveur de développement (port 5176)                                      |
| `pnpm build`               | Build production statique (`build/`)                                      |
| `pnpm check`               | svelte-kit sync + svelte-check (typecheck)                                |
| `pnpm lint`                | prettier --check + eslint                                                 |
| `pnpm format`              | prettier --write                                                          |
| `pnpm deploy:pprd:dry-run` | Vérifie le tag PPRD, le gate CI et le build sans SFTP                     |
| `pnpm deploy:pprd`         | Déploie la dernière prerelease pprd vers la PPRD via le helper SFTP local |
| `pnpm deploy:prod:dry-run` | Vérifie le tag PROD, le gate CI et le build sans SFTP                     |
| `pnpm deploy:prod`         | Déploie la dernière release stable vers la PROD (redemande le tag)        |
| `pnpm test:unit`           | Tous les tests Vitest (client jsdom + server Node)                        |
| `pnpm test:pipeline`       | Tests serveur pipeline + DuckDB                                           |
| `pnpm test:duckdb`         | Tests d'intégration DuckDB uniquement                                     |
| `pnpm test:all`            | Suite complète                                                            |
| `pnpm machine-translate`   | Génère les traductions manquantes via Inlang                              |

Node ≥ 22 (< 25), pnpm 10 via Corepack. Toujours utiliser `vitest run` (ou les scripts `pnpm test:*`) — jamais `vitest` seul qui démarre le mode watch. Utiliser `--reporter=agent` pour minimiser la sortie.
