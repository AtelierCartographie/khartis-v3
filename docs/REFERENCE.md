# Reference technique

> Types principaux, utilitaires, erreurs, raccourcis et conventions transversales.

## Types principaux

### Projet

```ts
// src/lib/features/project-management/types.ts
interface KhartisProject {
  id: string;
  manifest: ProjectManifest;
  data: ProjectData;
  visualization?: VisualizationConfig;
  layout?: LayoutConfig;
  resources?: Record<string, unknown>;
}

interface ProjectManifest {
  version: string;       // '3.0.0'
  createdAt: Date;
  updatedAt: Date;
  name: string;
  author?: string;
  description?: string;
  format: 'kh' | 'khartis';
}

interface ProjectData {
  sourceFiles: UploadedFile[];
  processedData?: Record<string, unknown>;
  joinedData?: Record<string, unknown>;
  basemap?: { type: string; id: string; data?: Record<string, unknown> };
}
```

### Donnees

```ts
// src/lib/features/commons/store/create-project.types.ts
interface UploadedFile {
  id: string; name: string; size: number; type: string;
  fileType: FileType;
  status: FileStatus;  // uploading | processing | complete | edit | error | incomplete
  relatedFiles?: string[];  // Composants Shapefile
}
```

### Visualisation

```ts
// src/lib/features/commons/store/visualization.store.svelte.ts
enum VisualizationType {
  CHOROPLETH = 'choropleth', PROPORTIONAL = 'proportional',
  CATEGORICAL = 'categorical', BIVARIATE = 'bivariate'
}

enum ClassificationMethod {
  EQUAL_INTERVAL = 'equal_interval', QUANTILES = 'quantiles',
  JENKS = 'jenks', MANUAL = 'manual', STANDARD_DEVIATION = 'standard_deviation',
  Q6 = 'q6', NESTED_MEANS = 'nested_means', HEAD_TAIL = 'head_tail'
}

// src/lib/features/commons/store/create-project.types.ts
enum FileType {
  CSV = 'csv', TSV = 'tsv', GEOJSON = 'geojson', SHAPEFILE = 'shapefile',
  GEOPACKAGE = 'geopackage', GEOPARQUET = 'geoparquet', ARROW = 'arrow',
  KML = 'kml', KMZ = 'kmz', GPX = 'gpx', ZIP = 'zip', UNKNOWN = 'unknown'
}

// src/lib/features/data-pipeline/types.ts
enum ColumnType { BOOLEAN = 'boolean', DATE = 'date', NUMBER = 'number', GEOMETRY = 'geometry', TEXT = 'text' }
```

## Fonctions utilitaires

### Validation et assainissement

| Fonction | Usage |
| --- | --- |
| `ProjectValidator.validateProjectName` | Max 255 car., pas de caracteres speciaux |
| `ProjectValidator.validateFileSize` | Verif. taille avant import |
| `ProjectValidator.validateProjectSize` | Verif. taille avant sauvegarde |
| `ProjectValidator.validateStorageCapacity` | Verif. capacite de stockage (nombre de projets) |
| `DataValidator.validateCSVData` | Validation donnees CSV apres parsing |
| `DataValidator.validateGeoData` | Validation GeoJSON apres parsing |
| `sanitizeProjectName` | Nettoyage nom de projet |
| `sanitizeTextInput` | Nettoyage saisie utilisateur |
| `escapeSqlString` | Echappement chaines pour DuckDB |

Localisation : `src/lib/features/commons/utils/validation.utils.ts` et `sanitize.utils.ts`.

### Pipeline

- **Detection de types** : inference des types de colonnes depuis un echantillon
- **Accumulation de stats** : min/max/moyenne/compte en streaming
- **Bornes geometriques** : calcul de bbox depuis les features
- **Filtrage / Agregation** : filtres de colonnes et operations group-by

## Hierarchie d'erreurs

Toutes les erreurs du pipeline heritent de `PipelineError` (avec `code` et `details`).

Localisation : `src/lib/features/commons/errors/pipeline.errors.ts`.

| Nom | Code | Contexte | Fatal |
| --- | --- | --- | --- |
| `PipelineError` | (variable) | Erreur de base du pipeline | Oui |
| `DataValidationError` | `DATA_VALIDATION_ERROR` | Donnees invalides | Oui |
| `ParseError` | `PARSE_ERROR` | Erreur de lecture de fichier | Oui |
| `DuckDBError` | `DUCKDB_ERROR` | Echec de requete DuckDB | Oui |
| `NonFatalError` | (variable) | Erreur non fatale (toast sans rollback) | Non |
| `DuplicateFileError` | `DUPLICATE_FILE` | Fichier deja importe | Non |

Helpers : `isPipelineError()`, `isFatalError()`, `formatError()`.

### Pattern d'utilisation

```ts
import { isFatalError, formatError } from '$lib/features/commons/errors/pipeline.errors';
import { showError, showWarning } from '$lib/features/commons/utils/notification.utils.svelte';
import { logger, LogCategory } from '$lib/features/commons/utils/logger';

try {
  const dataset = await dataPipeline.processFile(file);
} catch (error) {
  logger.error('File import failed', LogCategory.DATA, formatError(error));

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

## Raccourcis clavier

Geres globalement dans `keyboard-shortcuts.svelte`. Les actions projet utilisent le prefixe `Ctrl+K` (K pour Khartis) suivi d'une lettre dans les 2 secondes.

| Action | macOS | Windows/Linux |
| --- | --- | --- |
| Ouvrir navigation laterale | Ctrl+K, B | Ctrl+K, B |
| Nouveau projet | Ctrl+K, N | Ctrl+K, N |
| Ouvrir projet | Ctrl+K, O | Ctrl+K, O |
| Sauvegarder projet | Ctrl+K, S | Ctrl+K, S |
| Dupliquer projet | Ctrl+K, D | Ctrl+K, D |
| Supprimer projet | Ctrl+K, X | Ctrl+K, X |
| Onglet Donnees | 1 | 1 |
| Onglet Visualisation | 2 | 2 |
| Onglet Habillage | 3 | 3 |
| Basculer mode zoom | Alt+Z | Alt+Z |
| Zoom + / - / reset | Cmd +/-/0 | Ctrl +/-/0 |
| Annuler | Cmd+Z | Ctrl+Z |
| Retablir | Cmd+Shift+Z ou Cmd+Y | Ctrl+Shift+Z ou Ctrl+Y |
| Zoom molette | Cmd+molette | Ctrl+molette |
| Fermer modale/panneau | Escape | Escape |

## Logger

Le logger est disponible uniquement en developpement (desactive en test et en production).

```ts
import { logger, LogCategory } from '$lib/features/commons/utils/logger';

logger.debug('Debug info', LogCategory.DATA);
logger.info('Info message', LogCategory.STORE);
logger.warn('Warning', LogCategory.DUCKDB, { details: '...' });
logger.error('Error', LogCategory.SYSTEM, error);
logger.success('Operation done', LogCategory.PROJECT);
```

Chaque appel necessite une `LogCategory` (`DATA`, `STORE`, `DUCKDB`, `MAP`, `UI`, `PERSISTENCE`, `PROJECT`, `VISUALIZATION`, `FILE`, `NOTIFICATION`, `EXPORT`, `ERROR_HANDLER`, `SYSTEM`).

Niveaux : `DEBUG`, `INFO`, `WARN`, `ERROR`, `SUCCESS`. Jamais de `console.log` dans le code de production.

Utilitaires supplementaires : `logger.time(label, category, fn)` pour mesurer la duree d'une operation async, `logger.startTiming(label, category)` pour un timer manuel.

## Limites de stockage

| Limite | Valeur | Seuil d'alerte |
| --- | --- | --- |
| Taille max. par fichier | 50 Mo | 25 Mo |
| Taille max. par projet | 100 Mo | 80 Mo |
| Nombre max. de projets | 50 | 40 |

Stockage via IndexedDB (localforage). Les donnees ne quittent jamais le navigateur.

## Internationalisation (i18n)

Messages compile-time via Paraglide (type-safe, zero overhead runtime). Locales : FR (par defaut), EN.

```ts
import * as m from '$lib/paraglide/messages';
// ou : import { m } from '$lib/paraglide/messages';
<button>{m.create_project_process_button()}</button>
<p>{m.create_project_processing_file({ name: file.name })}</p>
```

Convention de cles : `snake_case` semantique par feature (`tool_legend_title`, `validation_error_size`). Les cles dans `messages/en.json` et `messages/fr.json` deviennent des fonctions typees dans `$lib/paraglide/messages`.

## Securite et vie privee

- **Aucun serveur** : tout le traitement se fait dans le navigateur
- **Pas d'API externe** : les donnees utilisateur restent locales
- **Pas de tracking** : aucune analyse sur les donnees utilisateur
- **Assainissement** : noms de fichiers, cellules CSV (anti-injection formule), saisies utilisateur

## Glossaire

Voir [GLOSSAIRE.md](GLOSSAIRE.md) pour les definitions des termes techniques (choroplethe, classification, CRS, facettes, LOD, etc.).

---

**Voir aussi :** [ARCHITECTURE.md](ARCHITECTURE.md) -- [PIPELINE_DONNEES.md](PIPELINE_DONNEES.md) -- [VISUALISATIONS.md](VISUALISATIONS.md)
