# Contribuer et tester

Complément technique de [CONTRIBUTING.md](../CONTRIBUTING.md), qui porte
l'installation, les règles, la matrice de validation et le parcours de revue.
Cette page détaille les projets de test, les jeux de données, la vérification
en navigateur, la CI et les hooks git.

## Environnement

Node.js `>=22 <25`, pnpm `>=10` par Corepack. `pnpm install` lance
`pnpm download:extensions`, qui télécharge les extensions DuckDB `spatial`,
`httpfs`, `parquet` et `json` pour les deux bundles WASM (`eh` et `mvp`) dans
`static/duckdb-extensions/`. Ne pas modifier ces fichiers à la main : le
script aligne leur version sur celle de DuckDB WASM.

Le serveur de développement (port 5176) et `pnpm preview` envoient les en-têtes
`COOP`/`COEP` qu'exige DuckDB WASM.

Les fichiers `.env` ne servent qu'au déploiement ([Déploiement](DEPLOYMENT.md)) ;
`.env.example` ne contient que des valeurs fictives.

## Projets Vitest

Deux projets sont définis dans `vite.config.ts` :

| Projet   | Environnement | Fichiers                                         | Commande                                 |
| -------- | ------------- | ------------------------------------------------ | ---------------------------------------- |
| `client` | jsdom         | `src/**/*.svelte.{test,spec}.ts`, à côté du code | `pnpm test:unit`                         |
| `server` | Node          | `tests/pipeline/**`, `tests/duckdb/**`           | `pnpm test:pipeline`, `pnpm test:duckdb` |

- **client** simule `@duckdb/duckdb-wasm` et `$lib/features/duckdb` ; utiliser
  `vi.hoisted()` pour les mocks à déclarer avant les imports.
- **server** s'exécute en `pool: 'forks'`, sans parallélisme entre fichiers.
  Les tests qui ont besoin d'un vrai DuckDB utilisent `@duckdb/node-api` via
  `tests/pipeline/duckdb-node-helper`.

Pour itérer :

```sh
pnpm exec vitest --project client
pnpm exec vitest run --project client src/chemin/vers/le-test.svelte.test.ts
pnpm exec vitest run --project server tests/pipeline/nom-du-test.test.ts
```

Un test sous jsdom ne prouve pas un rendu GPU : une modification WebGL, de
couche Deck.gl ou de cycle de vie MapLibre demande aussi une vérification dans
un navigateur.

## Jeux de données de test

`tests-datasets/` est servi par `pnpm dev` uniquement, sous `/tests-datasets/`
(et sous `${BASE_PATH}/tests-datasets/` si un chemin de base est défini). Il
est exclu de `pnpm preview` et des déploiements.

| Besoin                       | Jeux                                                                                                                                                              |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Jointure par nom ou code     | `csv/naissances-par-commune-departement-et-region-2018.csv`, `csv/world-bank-rural-pop.csv` ; flou : `csv/fuzzy-countries.csv`                                    |
| Coordonnées GPS              | `csv/sites-seveso-idf.csv` et ses variantes `-swapped-gps`, `-invalid-gps`, `-custom-gps-columns`                                                                 |
| Robustesse du lecteur CSV    | `csv/csv-malformed--with-*`                                                                                                                                       |
| Lecteurs de formats          | `geojson/`, `gpkg/`, `shp/`, `shp-incomplete/`, `gpx/`, `kml-kmz/`, `zip/`                                                                                        |
| Sémiologie et simplification | `csv/visualization-toolbox-cases.csv`, `geojson/visualization-toolbox-cases.geojson`, `csv/france-regions-simplification-check.csv`, `geojson/nuts2_data.geojson` |

## Vérifier dans le navigateur

Créer toujours le scénario par l'interface :

1. **Coller un CSV** dans la modale de création, pour un cas ad hoc ;
2. **Importer par URL**, par exemple
   `http://localhost:5176/tests-datasets/csv/<fichier>.csv`, pour un scénario
   reproductible qui passe par le vrai pipeline ;
3. **« Essayer avec un exemple »**, pour une carte complète déjà stylée.

Le premier chargement télécharge le WASM DuckDB et l'extension spatiale :
l'attente initiale n'est pas un blocage. Si l'interface se fige, voir
[Dépannage](DEPANNAGE.md).

Pour la persistance, vérifier un vrai cycle enregistrement → rechargement →
export `.kh` → import. Pour le rendu, essayer plusieurs fonds, dont un qui
force le mode MapLibre.

## Intégration continue

`pr-validation.yml` s'exécute sur les pull requests non brouillons vers
`staging` et `main`, et sur les files de fusion. Après
`pnpm install --frozen-lockfile` :

```text
compilation Paraglide
pnpm lint
pnpm check
pnpm test:unit
pnpm test:pipeline
pnpm test:duckdb
pnpm build
```

`release.yml` rejoue les mêmes étapes à chaque push sur `staging` ou `main`,
puis lance `semantic-release` : prérelease `vX.Y.Z-pprd.N` depuis `staging`,
release stable `vX.Y.Z` depuis `main`.

## Hooks git

Husky installe deux hooks :

- **pre-commit** : `lint-staged` (Prettier et ESLint sur les fichiers indexés),
  puis `scripts/check-doc-sync.sh`, qui signale un changement structurel (barrel
  de feature, config Vite, Svelte, TypeScript, Prettier ou ESLint) commité sans
  mise à jour de `CLAUDE.md`, `AGENTS.md`, `docs/` ou `.claude/rules/`. Simple
  avertissement, bloquant avec `DOC_SYNC_STRICT=1`.
- **commit-msg** : commitlint vérifie le format Conventional Commits.

Ces hooks ne remplacent pas la matrice de validation.
