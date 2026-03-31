# Strategie de tests -- Khartis v3

> Guide synthetique de la strategie de tests multi-couches.

## Vue d'ensemble

| Couche              | Outil                     | Environnement                                    | Commande             |
| ------------------- | ------------------------- | ------------------------------------------------ | -------------------- |
| Tests unitaires     | Vitest                    | jsdom (client) / node (serveur)                  | `pnpm test:unit`     |
| Tests de composants | @testing-library/svelte   | jsdom                                            | `pnpm test:unit`     |
| Tests de pipeline   | Vitest + @duckdb/node-api | node                                             | `pnpm test:pipeline` |
| Tests E2E           | Playwright                | Chromium (port 5176, max 2 workers local / 1 CI) | `pnpm test:e2e`      |

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

## Structure des tests

```
tests/
  pipeline/
    pipeline-integration.test.ts    # Integration : ingestion DuckDB de tous les formats
    serialization-safety.test.ts    # Round-trip binaire + compatibilite
    validators.test.ts              # Validation de fichiers
    format-detector.test.ts         # Detection de format
    duckdb-node-helper.ts           # Utilitaire de connexion DuckDB Node
    ...                             # 30+ fichiers de test (processeurs, orchestrateur, etc.)
  duckdb/
    duck.test.ts                    # Tests DuckDB engine
    column-ops.test.ts              # Operations sur les colonnes
    join.test.ts                    # Jointures
    ...                             # Tests cache, simplification, etc.
  e2e/
    catalog-search.spec.ts          # Recherche dans le catalogue
    join-workflow.spec.ts           # Workflow de jointure
    url-import.spec.ts              # Import par URL
    helpers.ts                      # Utilitaires E2E (chemins, selecteurs)
    ...                             # Tests enrichissement, shapefile, OSM
```

## Tests de pipeline (integration)

`pipeline-integration.test.ts` teste l'**ingestion reelle** de chaque fichier de `tests-datasets/` via `@duckdb/node-api` :

| Section CDC       | Ce qui est teste                                              | Fichiers                     |
| ----------------- | ------------------------------------------------------------- | ---------------------------- |
| CSV import        | Comptage lignes/colonnes + classification des types           | CSV valides                  |
| CSV edge cases    | Gestion gracieuse (0-byte, header seul, structure cassee)     | CSV malformes                |
| Detection de type | text/numeric, hints geo, variations NULL                      | CSV cibles                   |
| Statistiques      | count/uniques/nulls, min/max, histogramme                     | fossil-fuel CSV              |
| Import geo        | Colonnes geometrie + donnees, extraction des bounds           | GeoJSON, GPKG, GPX, KML, SHP |
| ZIP               | Extraction + ingestion (csv unique, csv multiples, shapefile) | 3 ZIP                        |

**Note importante :** les macros DuckDB utilisant `query_table()` + `"colname"` ne peuvent pas etre testees via Node API (resolution differente entre Node API et WASM). Les tests d'integration utilisent du SQL direct equivalent.

## Tests DuckDB : Node API vs WASM

| Contexte                | API              | Usage                             |
| ----------------------- | ---------------- | --------------------------------- |
| Production (navigateur) | DuckDB WASM      | `Duck.query()`, `Duck.read_csv()` |
| Tests unitaires         | Mock complet     | `vi.mock('$lib/features/duckdb')` |
| Tests d'integration     | @duckdb/node-api | Ingestion reelle des fichiers     |

## Tests E2E (Playwright)

Configuration dans `playwright.config.ts` :

- **Port** : 5176 (serveur de dev via `pnpm dev`)
- **Navigateur** : Chromium headless
- **Retries** : 2 en CI, 0 en local
- **Traces** : capturees au premier retry
- **Screenshots** : captures sur echec uniquement
- **Video** : conserve sur echec uniquement

## Datasets de test

Les fichiers de test sont dans `static/tests-datasets/` (servis par le serveur de dev a `/tests-datasets/`) :

| Dossier           | Contenu                                                                 |
| ----------------- | ----------------------------------------------------------------------- |
| `csv/`            | 9 CSV valides + 12 CSV malformes (vide, header seul, formats mixtes...) |
| `geojson/`        | Lignes de transport, regions NUTS2                                      |
| `gpkg/`           | Lambert-93, IGN Admin Express, noms avec espaces                        |
| `gpx/`            | Arrets de transport en commun (Point)                                   |
| `kml-kmz/`        | Aires de covoiturage                                                    |
| `shp/`            | Natural Earth, foncier, transport, zones maritimes                      |
| `shp-incomplete/` | Shapefile incomplet (fichier .shp seul, sans .dbf/.shx)                 |
| `zip/`            | CSV unique, CSV multiples, shapefile complet                            |

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
// tests/e2e/url-import.spec.ts
import { expect, test } from '@playwright/test';
import { createProject } from './helpers';

test.describe('URL Import', () => {
  test('should import CSV from URL and create project', async ({ page }) => {
    test.slow();
    const csvUrl =
      'http://localhost:5176/tests-datasets/csv/fossil-fuel-subsidies-gdp-2021.csv';
    await createProject(page, csvUrl, `Test ${Date.now()}`);

    await expect(page.locator('.map-container').first()).toBeVisible();
  });
});
```

## Commandes de debug

```bash
# Lancer un fichier de test specifique
pnpm test:unit tests/pipeline/validators.test.ts

# Filtrer par nom de test
pnpm test:unit -t "should reject empty file"

# Lancer les tests en mode run (pas de watch)
pnpm test:unit:ui

# E2E en mode visible (headed)
pnpm test:e2e --headed

# E2E avec debugger Playwright
PWDEBUG=1 pnpm test:e2e

# E2E avec traces
pnpm test:e2e --trace on

# Interface graphique Playwright
pnpm test:e2e:ui

# Visualiser un fichier de trace
npx playwright show-trace trace.zip
```

## Bonnes pratiques

1. **Arrange-Act-Assert** : structurer chaque test en trois phases claires
2. **Independance** : chaque test doit pouvoir tourner seul (`beforeEach` pour reinitialiser)
3. **Comportement, pas implementation** : tester ce que l'utilisateur voit, pas les details internes
4. **`data-testid`** pour les selecteurs E2E, stables face au refactoring CSS
5. **Tests obligatoires** pour toute feature ajoutee et tout bug corrige (regression)
