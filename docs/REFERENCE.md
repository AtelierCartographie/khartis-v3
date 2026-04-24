# Référence technique

> Types principaux, erreurs, raccourcis clavier et conventions transversales. Voir [GUIDE_DEVELOPPEUR.md](./GUIDE_DEVELOPPEUR.md) pour le contexte architectural de chaque élément.

**Voir aussi** : [ARCHITECTURE.md](./ARCHITECTURE.md) | [GESTION_ETAT.md](./GESTION_ETAT.md) | [GLOSSAIRE.md](./GLOSSAIRE.md)

---

## Types principaux

### Projet

```ts
// src/lib/features/project-management/types.ts
// Définition complète dans le fichier source (certains champs sont omis ici)
interface KhartisProject {
  id: string;
  manifest: ProjectManifest;
  data: ProjectData;
  visualization?: VisualizationConfig;
  layout?: LayoutConfig;
  resources?: Record<string, unknown>;
}
```

### Visualisation

```ts
// src/lib/features/commons/store/visualization.store.svelte.ts
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

```ts
// src/lib/features/commons/store/create-project.types.ts
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

### Colonnes

```ts
// src/lib/features/data-pipeline/types.ts
enum ColumnType {
  BOOLEAN = 'boolean',
  DATE = 'date',
  NUMBER = 'number',
  GEOMETRY = 'geometry',
  TEXT = 'text'
}
```

---

## Hiérarchie d'erreurs

Toutes les erreurs du pipeline héritent de `PipelineError` (avec `code` et `details`). Localisation : `src/lib/features/commons/errors/pipeline.errors.ts`.

| Nom                   | Code                    | Contexte                     | Fatal |
| --------------------- | ----------------------- | ---------------------------- | ----- |
| `PipelineError`       | (variable)              | Erreur de base du pipeline   | Oui   |
| `DataValidationError` | `DATA_VALIDATION_ERROR` | Données invalides            | Oui   |
| `ParseError`          | `PARSE_ERROR`           | Erreur de lecture de fichier | Oui   |
| `DuckDBError`         | `DUCKDB_ERROR`          | Échec de requête DuckDB      | Oui   |
| `NonFatalError`       | (variable)              | Toast sans rollback          | Non   |
| `DuplicateFileError`  | `DUPLICATE_FILE`        | Fichier déjà importé         | Non   |

Helpers : `isPipelineError()`, `isFatalError()`, `formatError()`.

```ts
import {
  isFatalError,
  formatError
} from '$lib/features/commons/errors/pipeline.errors';
import {
  showError,
  showWarning
} from '$lib/features/commons/utils/notification.utils.svelte';

try {
  const dataset = await dataPipeline.processFile(file);
} catch (error) {
  if (isFatalError(error)) {
    showError(
      m.error_fatal_import_title(),
      error instanceof Error ? error.message : m.error_unknown_message()
    );
  } else {
    showWarning(
      m.warning_generic_title(),
      error instanceof Error ? error.message : m.warning_import_message()
    );
  }
}
```

---

## Logger

**Jamais de `console.log`** — utiliser le logger conditionnel (désactivé en test et production).

```ts
import { logger, LogCategory } from '$lib/features/commons/utils/logger';

logger.debug('Debug info', LogCategory.DATA);
logger.info('Info message', LogCategory.STORE);
logger.warn('Warning', LogCategory.DUCKDB, { details: '...' });
logger.error('Error', LogCategory.SYSTEM, error);
logger.success('Operation done', LogCategory.PROJECT);
```

Catégories : `DATA`, `STORE`, `DUCKDB`, `MAP`, `UI`, `PERSISTENCE`, `PROJECT`, `VISUALIZATION`, `FILE`, `NOTIFICATION`, `EXPORT`, `ERROR_HANDLER`, `SYSTEM`.

Outils : `logger.time(label, category, fn)` pour mesurer une opération asynchrone.

---

## Raccourcis clavier

Gérés dans `keyboard-shortcuts.svelte`. Préfixe `Ctrl+K` (K pour Khartis) suivi d'une lettre dans les 2 secondes.

| Action                | macOS               | Windows / Linux       |
| --------------------- | ------------------- | --------------------- |
| Navigation latérale   | Ctrl+K, B           | Ctrl+K, B             |
| Nouveau projet        | Ctrl+K, N           | Ctrl+K, N             |
| Ouvrir un projet      | Ctrl+K, O           | Ctrl+K, O             |
| Sauvegarder le projet | Ctrl+K, S           | Ctrl+K, S             |
| Dupliquer un projet   | Ctrl+K, D           | Ctrl+K, D             |
| Supprimer un projet   | Ctrl+K, X           | Ctrl+K, X             |
| Onglet Données        | 1                   | 1                     |
| Onglet Visualisations | 2                   | 2                     |
| Onglet Habillage      | 3                   | 3                     |
| Basculer mode zoom    | Alt+Z               | Alt+Z                 |
| Zoom + / - / reset    | Cmd +/-/0           | Ctrl +/-/0            |
| Annuler               | Cmd+Z               | Ctrl+Z                |
| Rétablir              | Cmd+Shift+Z / Cmd+Y | Ctrl+Shift+Z / Ctrl+Y |
| Zoom molette          | Cmd+molette         | Ctrl+molette          |
| Fermer modale/panneau | Escape              | Escape                |

---

## Validation

| Fonction                                   | Usage                                                                 |
| ------------------------------------------ | --------------------------------------------------------------------- |
| `ProjectValidator.validateProjectName`     | Max 255 caractères, pas de caractères spéciaux                        |
| `ProjectValidator.validateFileSize`        | Vérification de la taille avant import (100 à 200 Mo selon le format) |
| `ProjectValidator.validateProjectSize`     | Vérification avant sauvegarde du snapshot metadata-only (max 150 Mo)  |
| `ProjectValidator.validateStorageCapacity` | Quota de stockage (max 50 projets)                                    |
| `DataValidator.validateCSVData`            | Validation des données CSV après parsing                              |
| `DataValidator.validateGeoData`            | Validation du GeoJSON après parsing                                   |
| `sanitizeProjectName`                      | Nettoyage du nom de projet                                            |
| `sanitizeTextInput`                        | Nettoyage de saisie utilisateur                                       |
| `escapeSqlString`                          | Échappement de chaînes pour DuckDB                                    |

Localisation : `src/lib/features/commons/utils/validation.utils.ts` et `sanitize.utils.ts`.

---

## Limites de stockage

| Limite                  | Valeur                          | Seuil d'alerte    |
| ----------------------- | ------------------------------- | ----------------- |
| Taille max. par fichier | 100 à 200 Mo selon le format    | 80 % de la limite |
| Taille max. par projet  | 150 Mo (snapshot metadata-only) | 80 % de la limite |
| Nombre max. de projets  | 50                              | 40                |

Stockage via IndexedDB (object stores `projects`, `metadata`, `project_assets`, `project_asset_chunks`, `project_asset_refs`). Les données ne quittent jamais le navigateur.

---

## Sécurité et vie privée

- **Aucun serveur** : tout le traitement dans le navigateur.
- **Pas d'API externe** : les données utilisateur restent locales.
- **Pas de tracking** : aucune analyse sur les données utilisateur.
- **Assainissement** : noms de fichiers, cellules CSV (anti-injection de formule), saisies utilisateur.

---

## Internationalisation (i18n)

Messages compile-time via Paraglide JS 2 (type-safe, zero overhead runtime). Locales : FR (par défaut), EN.

```ts
import * as m from '$lib/paraglide/messages';
<button>{m.create_project_process_button()}</button>
<p>{m.create_project_processing_file({ name: file.name })}</p>
```

Convention de clés : `snake_case` sémantique par feature (`tool_legend_title`, `validation_error_size`). Les clés dans `messages/en.json` et `messages/fr.json` deviennent des fonctions typées.

---

## Commandes

| Commande                     | Description                                 |
| ---------------------------- | ------------------------------------------- |
| `pnpm dev`                   | Serveur de dev (port 5176)                  |
| `pnpm build`                 | Build production (adaptateur statique)      |
| `pnpm check`                 | Vérification TypeScript + Svelte            |
| `pnpm lint`                  | Prettier + ESLint                           |
| `pnpm test:unit`             | Tests Vitest client (jsdom)                 |
| `pnpm test:unit -- src/path` | Tests ciblés sur un fichier                 |
| `pnpm test:pipeline`         | Tests serveur (pipeline, Node)              |
| `pnpm test:duckdb`           | Tests serveur DuckDB (`@duckdb/node-api`)   |
| `pnpm test:all`              | Suite complète (client + pipeline + DuckDB) |

---

**Voir aussi :** [ARCHITECTURE.md](./ARCHITECTURE.md) — [GESTION_ETAT.md](./GESTION_ETAT.md) — [GLOSSAIRE.md](./GLOSSAIRE.md)
