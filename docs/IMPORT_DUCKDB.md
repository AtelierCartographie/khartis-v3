# Import, DuckDB et Arrow

Ce document décrit le chemin des données depuis une source utilisateur jusqu'aux tables DuckDB et aux tables Arrow utilisées par le rendu. Il s'adresse aux développeurs qui ajoutent un format, une transformation ou une opération cartographique.

Voir aussi : [PERSISTANCE_ET_ARCHIVES.md](PERSISTANCE_ET_ARCHIVES.md), [PROJECT_FORMAT_COMPATIBILITY.md](PROJECT_FORMAT_COMPATIBILITY.md), [RENDU_CARTOGRAPHIQUE.md](RENDU_CARTOGRAPHIQUE.md) et [FONDS_PROJECTIONS.md](FONDS_PROJECTIONS.md).

## Contrat d'architecture

```text
fichier, URL ou texte
  -> validation et détection
  -> import ou processeur spécialisé
  -> table DuckDB temporaire
  -> analyse, jointure, filtres et transformations
  -> Arrow avec métadonnées GeoArrow
  -> rendu Deck.gl ou export
```

DuckDB WASM est une base analytique en mémoire exécutée dans un Web Worker. Ses tables et ses caches ne sont pas la persistance du projet : la reprise recrée les tables à partir des assets et du snapshot projet. Le contrat de reprise est documenté dans [PERSISTANCE_ET_ARCHIVES.md](PERSISTANCE_ET_ARCHIVES.md).

Le point d'entrée applicatif est `duckDBOrchestrator`. La façade `Duck` est réservée aux modules DuckDB, au pipeline et à l'orchestrateur. Un composant ou un store métier ne doit pas instancier `AsyncDuckDB` directement.

## Démarrage du moteur

Au démarrage, `+layout.svelte` initialise les services de données, puis `duckDBOrchestrator.initialize()` appelle `initDuckDB()` :

1. le moteur sélectionne le bundle WASM compatible (`eh` ou `mvp`) et crée un Worker DuckDB ;
2. la connexion est ouverte avec `maximumThreads: 1` ;
3. les limites mémoire, le répertoire temporaire et le cache DuckDB sont configurés ;
4. les macros SQL de classification, analyse, jointure, recherche, simplification et densité sont chargées ;
5. l'extension `spatial` est préchargée et HTTPFS est chargé à la demande.

Les timeouts d'instanciation et d'initialisation sont de 180 secondes. La limite mémoire est calculée à partir de `navigator.deviceMemory`, avec un plafond de 3 Gio et un repli à 2 Gio. Le répertoire temporaire DuckDB est limité à 5 Gio.

L'extension spatiale peut échouer à se charger : une alerte est alors affichée, mais l'application ne prétend pas que les opérations spatiales restent disponibles. Les extensions sont résolues depuis `/duckdb-extensions`, empaqueté avec l'application.

## Entrées d'import et formats

Khartis a deux chemins complémentaires :

| Chemin                                | Responsabilité                         | Usage                                                      |
| ------------------------------------- | -------------------------------------- | ---------------------------------------------------------- |
| `dataPipeline.processFile()`          | Pipeline générique                     | Fichier local, lecture DuckDB directe et exception GPX.    |
| `dataPipeline.processRemoteFile(url)` | Téléchargement puis pipeline générique | Source distante, avec une URL comme unique paramètre.      |
| `duckDBOrchestrator.processFile()`    | Orchestration applicative              | Sélection d'une stratégie dans le registre de processeurs. |

Le registre actuel couvre CSV, GeoJSON, Shapefile, GeoPackage, GeoParquet et GPX. Ce n'est pas le même mécanisme que l'ancien symbole `RAW_FILE_PROCESSOR_TYPES`, qui n'existe plus dans le code. Ne pas le réintroduire dans une documentation ou une extension.

| Famille                     | Comportement actuel                                                                                        |
| --------------------------- | ---------------------------------------------------------------------------------------------------------- |
| CSV, TSV et texte tabulaire | Détection du séparateur, de l'en-tête et des nombres avant lecture DuckDB.                                 |
| GeoJSON                     | Lecture géospatiale ; un fichier `.json` non reconnu comme GeoJSON peut suivre le chemin tabulaire.        |
| Shapefile                   | Les companions `.shx` et `.dbf` sont requis ; une archive ZIP est le moyen usuel de les transporter.       |
| GeoPackage                  | Lecture géospatiale DuckDB, avec un fallback navigateur pour certains fichiers non lus par le build WASM.  |
| Parquet et GeoParquet       | Lecture Parquet puis normalisation spatiale quand les métadonnées `geo` sont présentes.                    |
| GPX                         | Processeur spécialisé.                                                                                     |
| KML, KMZ et ZIP             | Chemin géospatial ou archive selon la détection ; une archive ZIP peut contenir plusieurs jeux de données. |

Le validateur de l'interface vérifie notamment les extensions, tailles, groupes Shapefile et URLs HTTP(S). Le processeur distant reste une API interne plus basse : appelé directement, il télécharge la réponse entière avec un timeout, sans faire appliquer lui-même toutes les règles d'interface. Toute nouvelle entrée réseau doit donc définir ses propres limites et validations.

## Table DuckDB et analyse

L'import produit une table nommée et un `DuckDBDataset` lié au fichier source. Les opérations métier travaillent ensuite sur cette table : analyse de colonnes, détection géographique, jointure, filtres, géolocalisation GPS, calculs de colonnes, transformations et classifications.

Les lecteurs et opérations doivent conserver l'identifiant de ligne `__id` quand une transformation reconstruit une table. Cet identifiant relie les lignes, les corrections, les filtres et les interactions de rendu.

Les macros SQL sont chargées une fois par `initDuckDB()`. Elles encapsulent notamment les méthodes de classification, la normalisation textuelle et la similarité des jointures, la simplification et la densité. Les appeler via le service qui porte leur contrat, plutôt que depuis une interface, évite de contourner l'analyse et l'invalidation associées.

## Arrow et GeoArrow

Le résultat privilégié pour les données spatiales est une table Arrow produite depuis DuckDB. Lorsque la table comporte une géométrie DuckDB native, l'orchestrateur ajoute les métadonnées GeoArrow :

- la métadonnée de schéma `geo` décrit la colonne primaire, son encodage et son CRS ;
- l'encodage normal est `geoarrow.wkb` ;
- un encodage GeoJSON textuel sert de repli ;
- le CRS est conservé lorsqu'il est connu, sinon le code utilise WGS 84 comme valeur par défaut dans certains chemins.

Le rectangle `[-180, -90, 180, 90]` ajouté dans certains chemins de repli est synthétique. Il ne doit pas être présenté comme l'emprise calculée du jeu de données.

Une reprojection tente d'abord `ST_Transform` dans DuckDB, puis utilise le fallback `proj4` pour les CRS pris en charge. La projection de rendu et la reprojection des données sont deux mécanismes distincts : documenter ou modifier l'un ne change pas implicitement l'autre.

## Caches, streaming et mutations

Trois niveaux de cache doivent être distingués :

| Niveau                 | Rôle                                                                                     | Invalidation                                                             |
| ---------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Métadonnées DuckDB     | Descriptions, nombre de lignes, analyse et métadonnées de table.                         | `markTableMutated()` et les mutateurs de l'orchestrateur.                |
| Table Arrow du dataset | Référence Arrow conservée dans l'état du dataset.                                        | Recréation ou mutation de la table, des filtres ou du dataset.           |
| Caches de rendu        | Caches faibles indexés par identité de table et de projection, plus des LRU de jointure. | Nouvelle référence Arrow, nouvelle projection ou invalidation explicite. |

Toute mutation de table doit passer par l'orchestrateur ou invalider explicitement les caches associés. Un `Duck.query()` direct ne peut pas informer automatiquement les caches de niveau applicatif.

Le streaming Arrow n'est pas universel : après une DDL qui modifie le schéma, un binding streaming peut retourner des colonnes nouvellement ajoutées comme `NULL`. Les parcours de jointure et d'édition choisissent donc volontairement une lecture non streaming. Ne pas remplacer ce choix par une optimisation locale sans test de schéma et de rendu.

Les résultats Arrow joints sont gardés dans un LRU de quatre entrées. Les mutations et les corrections de jointure doivent invalider la table jointe, le cache de similarité et les caches Arrow dépendants.

## Ajouter ou faire évoluer un format

Avant d'ajouter un format :

1. choisir le chemin approprié : lecteur DuckDB générique, processeur enregistré ou fallback navigateur justifié ;
2. ajouter la détection, les limites de taille et les validations de contenu au niveau d'entrée ;
3. produire une table avec un nom, `__id`, les métadonnées et le statut attendus par `DuckDBDataset` ;
4. normaliser les géométries et le CRS lorsque le format est spatial, puis vérifier le contrat Arrow/GeoArrow ;
5. garantir l'invalidation des caches après toute mutation ;
6. vérifier que le fichier source ou son snapshot préparé pourra être conservé comme asset avant de promettre la reprise ou l'export `.kh` ;
7. ajouter des tests de lecture, d'erreur, de reprise et de rendu représentatif.

Une exception au principe DuckDB-first doit être motivée : par exemple, le fallback GeoPackage navigateur existe parce que certains GeoPackages ne sont pas lisibles par le build DuckDB WASM.

## Limites de ressources et de sécurité

Les limites actuelles sont séparées : taille d'un fichier selon son type, total de l'import, taille du snapshot JSON, quota réel du navigateur et mémoire DuckDB. Elles ne garantissent pas qu'un gros projet pourra être importé, conservé et rouvert sur chaque navigateur.

Le ZIP de données refuse un total décompressé supérieur à 500 Mio, mais la décompression a déjà produit les entrées en mémoire au moment de ce contrôle. Les sources et archives non fiables restent donc à traiter comme potentiellement coûteuses.

Les expressions SQL saisies par l'utilisateur sont validées dans les opérations de colonnes. Cette validation est une frontière dédiée, pas une permission d'exécuter du SQL utilisateur librement depuis un composant.

## Tests vivants

Les tests de pipeline et DuckDB sont la référence pour les formats et leurs erreurs :

- `tests/pipeline/remote-processor.test.ts` ;
- `tests/pipeline/validators.test.ts` ;
- `tests/duckdb/` ;
- `src/lib/features/duckdb/duck.svelte.test.ts` ;
- `src/lib/features/duckdb/orchestrator/orchestrator-joined-arrow-cache.svelte.test.ts`.

Pour une modification de format ou de table, compléter ces tests par un jeu de données représentatif dans `tests-datasets/` et par le test de persistance ou d'archive correspondant.
