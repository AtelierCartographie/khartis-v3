# Stratégie de tests -- Khartis v3

> Guide synthetique de la strategie de tests multi-couches.

## Vue d'ensemble

| Couche            | Outil                     | Environnement                   | Commande             | CI  |
| ----------------- | ------------------------- | ------------------------------- | -------------------- | --- |
| Tests serveur CI  | Vitest + @duckdb/node-api | node                            | `pnpm test`          | oui |
| Tests unitaires   | Vitest                    | jsdom (client) / node (serveur) | `pnpm test:unit`     | --  |
| Tests de pipeline | Vitest + @duckdb/node-api | node                            | `pnpm test:pipeline` | oui |
| Tests DuckDB      | Vitest + @duckdb/node-api | node                            | `pnpm test:duckdb`   | oui |
| Tests E2E         | Playwright                | Chromium headless (port 5176)   | `pnpm test:e2e`      | non |

**Les tests E2E ne tournent pas en CI.** Ils s'executent en local avant un deploiement. Voir la section [Deploiement](#deploiement).

---

## CI -- GitHub Actions (`pr-validation.yml`)

Le job `Quality Checks` tourne sur chaque pull request vers `staging` ou `main`. Il valide :

| Etape          | Commande             | Ce qui est verifie                                |
| -------------- | -------------------- | ------------------------------------------------- |
| Lint           | `pnpm lint`          | Prettier + ESLint                                 |
| Type check     | `pnpm check`         | TypeScript strict + types Svelte                  |
| Pipeline tests | `pnpm test:pipeline` | Ingestion DuckDB de tous les formats de donnees   |
| DuckDB tests   | `pnpm test:duckdb`   | Operations SQL, jointures, cache                  |
| Build          | `pnpm build`         | Build de production SvelteKit (adaptateur static) |

Le build produit un dossier `build/` contenant le site statique pret a deployer.

---

## Deploiement

Khartis est deploye manuellement sur un serveur FTP. Le processus avant chaque deploiement :

```bash
# 1. Verifier que la CI passe (Quality Checks vert sur GitHub)

# 2. Rejouer localement la suite serveur si besoin
pnpm test

# 3. Lancer les tests E2E en local pour valider l'UX
pnpm test:e2e

# 4. Builder
pnpm build

# 5. Deployer le contenu de build/ sur le FTP
```

Si un test E2E echoue, corriger avant de deployer. Si tous passent, deployer `build/` via le client FTP habituel.

---

## Configuration Vitest

Vitest est configure avec **deux projets** dans `vite.config.ts` :

```typescript
test: {
  projects: [
    {
      // Projet "client" : composants Svelte, stores
      extends: './vite.config.ts',
      plugins: [svelteTesting()],
      test: {
        name: 'client',
        environment: 'jsdom',
        clearMocks: true,
        include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
        exclude: ['src/lib/server/**'],
        setupFiles: ['./vitest-setup-client.ts']
      }
    },
    {
      // Projet "server" : fonctions pures, pipeline, DuckDB
      extends: './vite.config.ts',
      test: {
        name: 'server',
        environment: 'node',
        include: [
          'tests/pipeline/**/*.{test,spec}.{js,ts}',
          'tests/duckdb/**/*.{test,spec}.{js,ts}'
        ],
        exclude: ['tests/e2e/**'],
        pool: 'threads',
        fileParallelism: false
      }
    }
  ];
}
```

**Client** : DuckDB est mocke globalement dans `vitest-setup-client.ts`. **Server** : DuckDB Node API est utilise pour les tests d'integration reels.

---

## Structure des tests

```
tests/
  pipeline/
    pipeline-integration.test.ts    # Integration : ingestion DuckDB de tous les formats
    serialization-safety.test.ts  # Round-trip binaire + compatibilite
    validators.test.ts             # Validation de fichiers
    format-detector.test.ts        # Detection de format
    duckdb-node-helper.ts         # Utilitaire de connexion DuckDB Node
    ...                            # 30+ fichiers de test (processeurs, orchestrateur, etc.)
  duckdb/
    engine.test.ts                 # Init WASM, bundle eh/mvp, extension repo
    duck.test.ts                   # Façade Duck, initDuckDB, macros, cache
    orchestrator.svelte.test.ts    # Orchestrateur (20+ ops, filtres, Arrow)
    dataset-ops.test.ts            # Jointures : stats, corrections, finalizeJoin
    column-ops.test.ts             # Mutations colonnes + sécurité SQL
    breaks.test.ts                 # Structure macros classification
    gps-ops.test.ts                # Validation GPS, bounds, vue ST_Point
    simplification.test.ts         # Simplification géométrique + macros
    cache-manager.test.ts          # Cache describe/rowcount + callbacks mutation
    basemap-import.utils.test.ts   # Import fond : polygon/ligne/geoparquet
    join.test.ts                   # Jointures SQL (legacy)
    join-ops.test.ts               # Opérations de jointure (nouveau pipeline)
  e2e/
    catalog-search.spec.ts         # L'app charge et le modal est accessible
    enrich-workflow.spec.ts        # Import d'un fichier geo
    join-workflow.spec.ts          # Workflow tabulaire (CSV)
    join-second-dataset.spec.ts    # Ajout d'un second dataset
    url-import.spec.ts             # Erreur sur URL invalide
    osm-activation.spec.ts         # Upload CSV (tabular et GPS)
    incomplete-shapefile.spec.ts   # Erreur sur shapefile incomplet
    helpers.ts                     # Utilitaires E2E (upload, navigation)
```

---

## Tests de pipeline (integration)

`pipeline-integration.test.ts` teste l'**ingestion reelle** de chaque fichier de `tests-datasets/` via `@duckdb/node-api` :

| Domaine           | Ce qui est teste                                              | Fichiers                     |
| ----------------- | ------------------------------------------------------------- | ---------------------------- |
| CSV import        | Comptage lignes/colonnes + classification des types           | CSV valides                  |
| CSV edge cases    | Gestion gracieuse (0-byte, header seul, structure cassee)     | CSV malformes                |
| Detection de type | text/numeric, hints geo, variations NULL                      | CSV cibles                   |
| Statistiques      | count/uniques/nulls, min/max, histogramme                     | fossil-fuel CSV              |
| Import geo        | Colonnes geometrie + donnees, extraction des bounds           | GeoJSON, GPKG, GPX, KML, SHP |
| ZIP               | Extraction + ingestion (csv unique, csv multiples, shapefile) | 3 ZIP                        |

**Fichiers de test pipeline** (`tests/pipeline/`) :

| Fichier                                 | API réelle ?   | Ce qui est testé                                |
| --------------------------------------- | -------------- | ----------------------------------------------- |
| `pipeline-integration.test.ts`          | Oui (Node API) | Ingestion réelle de tous les formats            |
| `pipeline-orchestrator.test.ts`         | Non (mocks)    | Init once, zip routing, remote processing       |
| `file-processor.test.ts`                | Non (mocks)    | CSV options, companion files, parquet path      |
| `format-detector.test.ts`               | Non (mocks)    | Extension priority, case-insensitive, multi-dot |
| `validators.test.ts`                    | Non (mocks)    | Extension reject, empty file, size limits       |
| `csv-header-detector.test.ts`           | Non (mocks)    | Header-only low confidence, mixed types         |
| `decimal-detector.test.ts`              | Non (mocks)    | European format, thousands separator            |
| `zip-handler.test.ts`                   | Non (mocks)    | isZipFile, macOS filtering, shapefile detection |
| `geometry.test.ts`                      | Non (mocks)    | No geometry, bounds query, null fallback        |
| `quality.test.ts`                       | Non (mocks)    | Small dataset, null ratio, low cardinality      |
| `classification.service.test.ts`        | Non (mocks)    | Quantile macro, std_dev → nested_means          |
| `processor-utils.test.ts`               | Non (mocks)    | isTabularData, convertToCSV, getFileForDuckDB   |
| `serialization-safety.test.ts`          | Non (mocks)    | BigInt round-trip, binary preserve              |
| `csv-processor.strategy.test.ts`        | Non (mocks)    | Arrow path, fallback on failure                 |
| `geojson-processor.strategy.test.ts`    | Non (mocks)    | ST_Read path, Arrow opt-in                      |
| `geoparquet-processor.strategy.test.ts` | Non (mocks)    | read_parquet, \_\_id sequence                   |
| `shapefile-processor.strategy.test.ts`  | Non (mocks)    | ParseError sans companions                      |
| `geopackage-processor.strategy.test.ts` | Non (mocks)    | read_geofile, createArrowTableWithMetadata      |
| `gpx-processor.strategy.test.ts`        | Non (mocks)    | GPX format support                              |
| `register-processors.test.ts`           | Non (mocks)    | 6 processors registered at priority 10          |
| `zip-processor.test.ts`                 | Non (mocks)    | Shapefile archive, multi-dataset routing        |
| `remote-processor.test.ts`              | Non (mocks)    | read_link, standalone shp rejection             |
| `analysis.test.ts`                      | Non (mocks)    | enrichColumns, buildDatasetFromDuckTable        |

**Note importante :** les macros DuckDB utilisant `query_table()` + `"colname"` ne peuvent pas etre testees via Node API (resolution differente entre Node API et WASM). Les tests d'integration utilisent du SQL direct equivalent.

---

## Tests DuckDB : Node API vs WASM

| Contexte                | API              | Usage                             |
| ----------------------- | ---------------- | --------------------------------- |
| Production (navigateur) | DuckDB WASM      | `Duck.query()`, `Duck.read_csv()` |
| Tests unitaires         | Mock complet     | `vi.mock('$lib/features/duckdb')` |
| Tests d'integration     | @duckdb/node-api | Ingestion reelle des fichiers     |

---

## Tests E2E (Playwright)

Les tests E2E sont des **smoke tests** : ils verifient que les flux principaux de l'application fonctionnent dans un vrai navigateur (DuckDB WASM, upload, rendu). Ils ne testent pas les details de l'UI.

Configuration dans `playwright.config.ts` :

- **Port** : 5176 (serveur de dev via `pnpm dev`)
- **Navigateur** : Chromium headless
- **Retries** : 2 en CI (non utilise), 0 en local
- **Traces** : capturees au premier retry

### Pourquoi pas en CI ?

DuckDB WASM s'initialise dans un vrai navigateur avec des dependances asynchrones (workers, extensions, IndexedDB). Ce comportement est difficile a reproduire de facon fiable sur des runners CI mutualisees (latence variable, memoire limitee). Le risque de tests flaky l'emporte sur la valeur ajoutee, d'autant que le deploiement est manuel.

Les tests de pipeline (server-side, DuckDB Node API) couvrent la logique de traitement des donnees de facon fiable en CI.

---

## Tests rendu map

Les tests de rendu map sont dans `tests/pipeline/` (ils ne dependent pas de DuckDB) :

| Fichier                           | Ce qui est testé                        |
| --------------------------------- | --------------------------------------- |
| `orthographic-reference.test.ts`  | Références de projection orthographique |
| `use-map-position.test.ts`        | Position camera / viewport              |
| `basemap-styles.test.ts`          | Styles MapLibre, structure JSON         |
| `map-tooltip-position.test.ts`    | Calcul position tooltip viewport        |
| `carbon-tooltip-position.test.ts` | Position Carbon tooltip                 |

Le rendu GPU reel (Deck.gl layers, GeoArrow binary parsing) n'est pas teste en unit. Les smoke tests E2E (`tests/e2e/`) couvrent le flux complet dans un vrai navigateur.

---

## Datasets de test

Les fichiers de test sont dans `static/tests-datasets/` (servis par le serveur de dev a `/tests-datasets/`) :

| Dossier           | Contenu                                                                 |
| ----------------- | ----------------------------------------------------------------------- |
| `csv/`            | 9 CSV valides + 12 CSV malformes (vide, header seul, formats mixtes...) |
| `geojson/`        | Lignes de transport, regions NUTS2, geometries simples                  |
| `gpkg/`           | Lambert-93, IGN Admin Express, noms avec espaces                        |
| `gpx/`            | Arrets de transport en commun (Point)                                   |
| `kml-kmz/`        | Aires de covoiturage                                                    |
| `shp/`            | Natural Earth, foncier, transport, zones maritimes                      |
| `shp-incomplete/` | Shapefile incomplet (fichier .shp seul, sans .dbf/.shx)                 |
| `zip/`            | CSV unique, CSV multiples, shapefile complet                            |

---

## Ecrire un test

### Exemple : test unitaire (Vitest)

```typescript
// tests/pipeline/validators.test.ts
import { describe, it, expect } from 'vitest';
import { validateFile } from '$lib/features/data-pipeline/core/validators';

describe('validateFile', () => {
  it('rejects unsupported extension', async () => {
    const file = {
      name: 'data.exe',
      size: 1024,
      type: 'application/octet-stream'
    } as File;
    const result = await validateFile(file);

    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
```

### Exemple : test E2E (Playwright)

```typescript
// tests/e2e/mon-workflow.spec.ts
import { expect, test } from '@playwright/test';
import { uploadURL } from './helpers';

test('TC-MON-001: smoke test description', async ({ page }) => {
  await page.goto('/');
  await uploadURL(page, 'csv/mon-fichier.csv');

  await expect(page.locator('#khartis-data-tab')).toBeVisible({
    timeout: 30000
  });
});
```

Les tests E2E doivent rester des smoke tests : verifier qu'un flux fonctionne, pas tester les details d'un composant.

---

## Commandes de debug

```bash
# Lancer un fichier de test specifique
pnpm test:unit tests/pipeline/validators.test.ts

# Filtrer par nom de test
pnpm test:unit -t "should reject empty file"

# E2E en mode visible (headed) -- utile pour debugger
pnpm test:e2e --headed

# E2E avec debugger Playwright
PWDEBUG=1 pnpm test:e2e

# E2E pour un seul fichier
pnpm test:e2e tests/e2e/enrich-workflow.spec.ts

# Visualiser un fichier de trace
npx playwright show-trace trace.zip
```
