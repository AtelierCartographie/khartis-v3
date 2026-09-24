# Import, DuckDB et Arrow

Le chemin d'une donnée, de la source utilisateur jusqu'à la table Arrow
consommée par le rendu. À lire avant d'ajouter un format, une transformation ou
une opération de données.

```text
fichier, URL ou texte collé
  → validation et détection
  → lecture DuckDB (ou processeur spécialisé)
  → table DuckDB
  → analyse, jointure, filtres, transformations
  → Arrow avec métadonnées GeoArrow
  → rendu Deck.gl ou export
```

DuckDB WASM est une base analytique en mémoire, exécutée dans un Web Worker.
Ses tables ne sont pas la persistance : à la réouverture, elles sont recréées à
partir des fichiers source ([Persistance et archives](PERSISTANCE_ET_ARCHIVES.md)).

## Démarrage du moteur

`duckDBOrchestrator.initialize()` appelle `initDuckDB()`, qui mutualise
l'initialisation entre tous les appelants :

1. sélection du bundle WASM (`eh` ou `mvp`) et création du Worker ;
2. connexion avec `maximumThreads: 1`, limite mémoire, répertoire temporaire
   (5 Go) et cache d'objets ;
3. chargement de l'extension `spatial` et préchauffage des CRS ;
4. chargement des macros SQL : classification, analyse, jointure, recherche,
   simplification, densité.

| Réglage                                      | Valeur                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------ |
| Timeouts d'instanciation et d'initialisation | 180 s                                                                    |
| Limite mémoire                               | `navigator.deviceMemory` × 0,5 Gio, plafonnée à 3 Gio ; 2 Gio si inconnu |

Les extensions sont servies depuis `/duckdb-extensions`, où `pnpm install` les
dépose. Si `spatial` ne se charge pas, un avertissement est affiché et les
opérations spatiales ne sont pas disponibles. En cas d'échec, le Worker est
terminé pour qu'une nouvelle tentative reparte de zéro.

## Points d'entrée

| API                                                        | Usage                                                 |
| ---------------------------------------------------------- | ----------------------------------------------------- |
| `dataPipeline.processUploadedFile()`                       | parcours principal : création de projet et reprise    |
| `dataPipeline.processFile()`                               | lecture DuckDB directe d'un fichier local             |
| `dataPipeline.processPastedData()`                         | texte tabulaire collé                                 |
| `dataPipeline.processZipFile()` / `processRemoteZipFile()` | archives ZIP, locales ou distantes                    |
| `dataPipeline.processRemoteFile(url)`                      | téléchargement d'une URL puis pipeline générique      |
| `duckDBOrchestrator.processFile()`                         | choix d'une stratégie dans le registre de processeurs |

`duckDBOrchestrator` est le point d'entrée des opérations de données.
`Duck.query()` est la façade SQL bas niveau : une mutation faite par ce biais
doit invalider elle-même les caches concernés (voir plus bas).

## Formats

Le registre de processeurs couvre CSV, GeoJSON, Shapefile, GeoPackage,
GeoParquet et GPX. Les autres formats passent par la lecture géospatiale
générique (`ST_Read`).

| Format                | Comportement                                                                                          |
| --------------------- | ----------------------------------------------------------------------------------------------------- |
| CSV, TSV, texte collé | détection du séparateur, de l'en-tête et du format numérique avant `read_csv`                         |
| GeoJSON               | lecture géospatiale ; un `.json` qui n'est pas du GeoJSON est lu comme tableau                        |
| Shapefile             | `.shx` et `.dbf` obligatoires, en pratique transportés dans un ZIP                                    |
| GeoPackage            | lecture DuckDB, avec un repli navigateur (SQLite WASM) pour les fichiers que le build WASM ne lit pas |
| Parquet, GeoParquet   | `read_parquet`, normalisation spatiale si les métadonnées `geo` sont présentes                        |
| GPX                   | processeur dédié                                                                                      |
| KML, KMZ              | lecture géospatiale générique, sans processeur enregistré                                             |
| ZIP                   | un ou plusieurs jeux de données par archive                                                           |

Le validateur de l'interface contrôle extensions, tailles, groupes Shapefile et
schéma d'URL (`http`/`https`). Appelé directement, le processeur distant
télécharge la réponse entière avec un timeout, sans ces contrôles : toute
nouvelle entrée réseau définit ses propres limites.

## Tables et identifiant de ligne

Un import produit une table nommée et un `DuckDBDataset`. Analyse de colonnes,
détection géographique, jointure, filtres, géolocalisation GPS, calculs et
classifications travaillent ensuite sur cette table.

Toute opération qui reconstruit une table conserve la colonne `__id` : elle
relie lignes, corrections, filtres et interactions de rendu.

Les macros SQL portent la logique métier (classification, normalisation et
similarité de jointure, simplification, densité). On les appelle par le service
qui porte leur contrat, jamais directement depuis un composant.

## Arrow et GeoArrow

Une table spatiale est exportée de DuckDB en Arrow, puis annotée :

- la métadonnée de schéma `geo` décrit la colonne géométrique, son encodage et
  son CRS ;
- l'encodage normal est `geoarrow.wkb`, avec un repli GeoJSON textuel ;
- le CRS est conservé s'il est connu, WGS 84 sinon ;
- la `bbox` `[-180, -90, 180, 90]` est une valeur fixe, pas l'emprise réelle du
  jeu de données.

Une reprojection de données tente `ST_Transform` dans DuckDB, puis `proj4` si
les deux CRS sont pris en charge. Elle est distincte de la projection de rendu
([Fonds et projections](FONDS_PROJECTIONS.md)).

## Caches et mutations

| Niveau                 | Contenu                                                        | Invalidation                                         |
| ---------------------- | -------------------------------------------------------------- | ---------------------------------------------------- |
| Métadonnées DuckDB     | description, nombre de lignes, analyse de colonnes             | `markTableMutated()` et mutateurs de l'orchestrateur |
| Table Arrow du dataset | référence Arrow conservée dans l'état du dataset               | recréation ou mutation de la table ou de ses filtres |
| Jointure               | tables Arrow jointes, cache de similarité, gradings (LRU de 4) | mutation, correction de jointure                     |
| Rendu                  | caches indexés par identité de table et de projection          | nouvelle référence Arrow ou nouvelle projection      |

Toute mutation passe par l'orchestrateur ou invalide explicitement ces caches.

Le grading de jointure (joint / à vérifier / non unique / non reconnu) est
matérialisé dans des tables dérivées, **clés sur le cache de similarité** qui
les a produites : invalider ce cache fait tomber les gradings. Des appels
concurrents partagent un même calcul.

Après une DDL qui ajoute des colonnes, une lecture Arrow en streaming peut
renvoyer ces colonnes à `NULL`. Jointures, GPS et lecture directe se font donc
sans streaming (`skipStreaming`) ; ne pas « optimiser » ce choix sans test de schéma
et de rendu.

## Phase fuzzy de la jointure

Les valeurs sans correspondance exacte sont comparées en Jaro-Winkler aux noms
distincts des fonds candidats : le coût est le produit des deux. Il est borné
par un budget en paires (`MAX_FUZZY_AUTO_PAIRS`) plutôt que par un nombre de
candidats, ce qui garde une durée stable quand le catalogue grandit.
`FUZZY_PAIRS_PER_MS` estime la durée affichée ; ce n'est qu'un ordre de
grandeur.

- Le **classement des fonds** est toujours calculé, sur un échantillon borné
  (`MAX_FUZZY_RANKING_SAMPLE`) : Khartis désigne le bon fond même quand aucune
  valeur n'est écrite exactement.
- Les **suggestions par valeur** sont tout-ou-rien : au-delà du budget, elles
  sont proposées à la demande, avec l'estimation de durée.
- Cette passe à la demande **ne s'annule pas** : DuckDB WASM est mono-thread et
  `cancelPendingQuery` ne rejette qu'à la fin du calcul. Ne pas proposer de
  bouton Annuler sur ce chemin.

## Limites

| Limite             | Valeur                                                                       |
| ------------------ | ---------------------------------------------------------------------------- |
| Taille par fichier | voir [Persistance et archives](PERSISTANCE_ET_ARCHIVES.md#quotas-et-tailles) |
| Lignes importées   | avertissement à 250 000, maximum 1 000 000 (`IMPORT_ROW_LIMITS`)             |
| Parquet            | volume estimé avant lecture (`assertParquetVolumeBeforeRead`)                |
| ZIP de données     | 500 Mio décompressés au total                                                |

Le plafond ZIP est vérifié avant décompression, mais sur les tailles
**déclarées** par l'archive, après lecture du fichier entier en mémoire. Une
archive non fiable reste potentiellement coûteuse.

Les expressions SQL saisies dans les opérations de colonnes sont validées par
une frontière dédiée ; ce n'est pas une permission d'exécuter du SQL libre
depuis un composant.

## Ajouter un format

1. Choisir le chemin : lecteur DuckDB générique, processeur enregistré, ou
   repli navigateur justifié (comme celui du GeoPackage).
2. Ajouter détection, limites de taille et validation de contenu à l'entrée.
3. Produire une table avec son nom, `__id` et les métadonnées attendues par
   `DuckDBDataset`.
4. Pour un format spatial, normaliser géométrie et CRS, puis vérifier le
   contrat GeoArrow.
5. Invalider les caches après toute mutation.
6. S'assurer que le fichier source est conservé comme asset, sans quoi ni la
   reprise ni l'export `.kh` ne fonctionnent.
7. Tester lecture, erreurs, reprise et rendu, avec un jeu de données dans
   `tests-datasets/`.

## Tests de référence

- `tests/pipeline/remote-processor.test.ts`, `tests/pipeline/validators.test.ts`
- `tests/duckdb/`
- `src/lib/features/duckdb/duck.svelte.test.ts`
- `src/lib/features/duckdb/orchestrator/orchestrator-joined-arrow-cache.svelte.test.ts`
