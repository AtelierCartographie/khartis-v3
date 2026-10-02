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

## Quoi tester

La suite est volontairement réduite. Les bugs de Khartis viennent surtout de
combinaisons d'interactions, du rendu WebGL, du worker DuckDB WASM et de la
restauration IndexedDB : un test jsdom bardé de mocks n'en prouve aucun, et il
doit être réécrit à chaque refactorisation.

Un test a sa place quand il garde :

- une règle cartographique ou statistique : bornes de classes et arrondis,
  affectation des couleurs, qualification des jointures, détection de CRS et
  reprojection, score des suggestions, valeurs de légende, taille des
  symboles, placement des étiquettes ;
- une frontière d'import : dialecte et en-têtes CSV, séparateur décimal,
  fichiers malformés, validation GPS, détection de format, archives ;
- du SQL, une macro ou un lecteur, exécutés sur le vrai moteur dans
  `tests/duckdb/` ;
- le contrat de compatibilité : migrations de schéma, import et export `.kh`,
  restauration de l'état persistant ;
- un algorithme pur non trivial, avec ses cas limites ;
- un garde-fou de livraison : script de déploiement, politique de cache PWA,
  règles de confidentialité ;
- un bug dont la cause était une erreur de logique non évidente, exprimé en
  entrée et sortie attendue.

Ne pas écrire de test pour : le câblage entre modules internes simulés
(`toHaveBeenCalled` sur des `vi.mock` du dépôt), le rendu jsdom d'un composant
(balisage, classes, libellés, props transmises, clic qui appelle un callback),
des assertions sur le texte du code source, des constantes ou des accesseurs,
une simulation de WebGL, de Deck.gl, de MapLibre, du service worker ou
d'IndexedDB. Ces points se vérifient dans le navigateur.

Écrire le test avant le code n'a d'intérêt que si le résultat attendu peut
s'énoncer d'avance : règle métier, frontière de parsing, résultat SQL,
migration, bug reproduit. Pour l'interface, la mise en page et le rendu, on
code, on vérifie en vrai, et on n'ajoute un test que s'il répond aux critères
ci-dessus. Quand un composant porte une règle qui mérite un test, extraire la
règle dans une fonction pure et tester la fonction.

## Projets Vitest

Deux projets sont définis dans `vite.config.ts` :

| Projet   | Environnement                  | Fichiers                                         | Commande                                 |
| -------- | ------------------------------ | ------------------------------------------------ | ---------------------------------------- |
| `client` | Node, jsdom sur demande        | `src/**/*.svelte.{test,spec}.ts`, à côté du code | `pnpm test:unit`                         |
| `server` | Node, un processus par fichier | `tests/pipeline/**`, `tests/duckdb/**`           | `pnpm test:pipeline`, `pnpm test:duckdb` |

- **client** tourne sous Node. Un fichier qui a besoin d'un DOM commence par
  `// @vitest-environment jsdom` : créer jsdom pour chaque fichier coûtait
  plus que les tests eux-mêmes. Le projet simule `@duckdb/duckdb-wasm` et
  `$lib/features/duckdb` ; utiliser `vi.hoisted()` pour les mocks à déclarer
  avant les imports.
- **server** s'exécute en `pool: 'forks'`, fichiers en parallèle.
  `vitest-global-setup-server.ts` installe l'extension `spatial` une fois
  avant le lancement. Les tests qui ont besoin d'un vrai DuckDB ouvrent leur
  propre instance en mémoire avec `@duckdb/node-api`, via
  `tests/pipeline/duckdb-node-helper`.

Pour itérer :

```sh
pnpm exec vitest --project client
pnpm exec vitest run --project client src/chemin/vers/le-test.svelte.test.ts
pnpm exec vitest run --project server tests/pipeline/nom-du-test.test.ts
```

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

La validation est décrite une seule fois, dans `validate.yml`, et appelée par
les deux workflows. Elle lance cinq contrôles en parallèle :

| Contrôle     | Commande                                         |
| ------------ | ------------------------------------------------ |
| Lint         | compilation Paraglide, `pnpm lint`               |
| Type check   | `pnpm check`                                     |
| Unit tests   | `pnpm test:unit`                                 |
| Engine tests | `pnpm test:pipeline`, `pnpm test:duckdb`         |
| Build        | `pnpm build`, sans précompression Brotli et gzip |

- `pr-validation.yml` l'appelle sur les pull requests non brouillons vers
  `staging` et `main`, et sur les files de fusion. Son job `Quality Checks` est
  le contrôle exigé par les règles de branche : ne pas le renommer.
- `release.yml` l'appelle à chaque push sur `staging` ou `main`, puis lance
  `semantic-release` : prérelease `vX.Y.Z-pprd.N` depuis `staging`, release
  stable `vX.Y.Z` depuis `main`.

**Un arbre n'est validé qu'une fois.** Une pull request, le push qui la
fusionne, la pull request de promotion vers `main` et le push sur `main`
portent en général le même arbre git. Chaque contrôle réussi dépose un artefact
`validated-tree-<sha de l'arbre>-<contrôle>` (conservé 30 jours) ; un run qui
les trouve tous les cinq saute les contrôles. Dès que l'arbre diffère, par
exemple quand `staging` a avancé entre la validation et la fusion, la
validation complète repart. Un artefact venu d'un fork n'est jamais pris en
compte.

Le build de la CI ne sert qu'à prouver que l'application se construit :
`KHARTIS_SKIP_PRECOMPRESS=true` y désactive la précompression. Le build
déployé est refait par `scripts/deploy-local.mjs`, avec la précompression.

Les contrôles ne récupèrent pas tout le dépôt : les géométries des fonds
(`static/basemaps/**/*.parquet`) ne sont lues par aucun d'eux, et les jeux
`tests-datasets/shp` et `tests-datasets/gpkg` ne le sont que par les tests
moteur. Un test qui aurait besoin d'un de ces fichiers échouerait en CI sur un
fichier manquant : adapter alors les motifs `SPARSE_*` de `validate.yml`.

## Hooks git

Husky installe deux hooks :

- **pre-commit** : `lint-staged` (Prettier et ESLint sur les fichiers indexés),
  puis `scripts/check-doc-sync.sh`, qui signale un changement structurel (barrel
  de feature, config Vite, Svelte, TypeScript, Prettier ou ESLint) commité sans
  mise à jour de `AGENTS.md`, `docs/` ou `.claude/rules/`. Simple
  avertissement, bloquant avec `DOC_SYNC_STRICT=1`.
- **commit-msg** : commitlint vérifie le format Conventional Commits.

Ces hooks ne remplacent pas la matrice de validation.
