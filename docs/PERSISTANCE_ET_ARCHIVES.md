# Persistance, reprise et archives

Khartis conserve les projets dans le navigateur et permet leur sauvegarde sous forme d'archive `.kh`. Ce document distingue les garanties observées dans le code des limites que les contributeurs ne doivent pas masquer.

Voir aussi : [IMPORT_DUCKDB.md](IMPORT_DUCKDB.md) et [PROJECT_FORMAT_COMPATIBILITY.md](PROJECT_FORMAT_COMPATIBILITY.md).

## Ce qui est durable, ce qui est recréé

| Élément                         | Durée de vie                      | Contrat actuel                                                       |
| ------------------------------- | --------------------------------- | -------------------------------------------------------------------- |
| Tables, macros et caches DuckDB | Session                           | Éphémères. Recréés à la reprise du projet.                           |
| Snapshot de projet              | IndexedDB et `project.json`       | Configuration, état métier et références d'assets.                   |
| Fichiers source                 | IndexedDB et `assets/` dans `.kh` | Persistés comme assets binaires référencés.                          |
| Historique undo/redo            | Mémoire                           | Limité et non destiné à la restauration après rechargement.          |
| Métadonnées de navigation       | IndexedDB                         | Liste de projets, dernier projet ouvert et informations de stockage. |

Le snapshot n'est pas seulement un ensemble de métadonnées légères. Il ne contient pas les octets binaires des sources, mais peut contenir des données analysées ou préparées, des statistiques, transformations, jointures, corrections et réglages de visualisation. Ne pas qualifier ce contrat de « metadata-only ».

## IndexedDB

La base `KhartisDB` est à la version 3. Les object stores sont :

| Store                  | Contenu                                                            |
| ---------------------- | ------------------------------------------------------------------ |
| `projects`             | Snapshot sérialisé du projet.                                      |
| `metadata`             | Métadonnées applicatives et du projet.                             |
| `project_assets`       | Métadonnées d'un asset : MIME, taille, nombre et taille de chunks. |
| `project_asset_chunks` | Octets binaires, découpés par blocs de 8 Mio.                      |
| `project_asset_refs`   | Références projet vers asset pour le cycle de vie et le nettoyage. |

L'ouverture de la base protège contre les blocages, les changements de version et les ouvertures qui dépassent son timeout. Une migration unique depuis les anciennes clés `localforage` est également prévue ; IndexedDB reste prioritaire quand les deux sources existent.

## Écriture locale et concurrence

L'auto-sauvegarde passe par un registre de persistance débouncé à 750 ms. Il coalesce les changements, préserve une mutation intervenue pendant une sauvegarde et peut être suspendu pendant une restauration.

Avant d'écrire le projet, le code prépare les sources pour leur stockage et vérifie la taille du snapshot. La sauvegarde utilise une révision optimiste : deux onglets qui écrivent un même projet ne doivent pas écraser silencieusement une révision devenue obsolète ; une erreur de conflit est remontée à l'appelant.

Les assets sont écrits chunk par chunk, puis leurs métadonnées sont écrites dans une transaction distincte. Le snapshot, les références d'assets et les métadonnées de projet sont également sauvegardés par étapes. C'est une limite importante : il n'existe pas de transaction IndexedDB unique couvrant l'intégralité d'un projet.

## Quotas et tailles

Les seuils applicatifs actuels sont des garde-fous, pas une réserve de stockage garantie :

| Règle                             | Valeur actuelle     |
| --------------------------------- | ------------------- |
| CSV, TSV, GeoJSON, KML, KMZ, GPX  | 150 Mio par fichier |
| Shapefile, GeoPackage, GeoParquet | 200 Mio par fichier |
| ZIP générique                     | 100 Mio par fichier |
| Total d'un import                 | 200 Mio             |
| Nombre de fichiers importés       | 20                  |
| Snapshot de projet sérialisé      | 150 Mio             |
| Paramètre de stockage applicatif  | 500 Mio             |

Au moment d'ajouter un asset, Khartis consulte `navigator.storage.estimate()` si disponible. Il exige la taille de l'asset plus une marge de sécurité égale au maximum de 20 % de l'asset ou 8 Mio. Si l'estimation n'est pas disponible, elle échoue ou n'indique pas de quota, l'écriture est tentée et l'erreur navigateur reste possible.

Le navigateur contrôle le quota réel. La PWA demande le stockage persistant lorsque l'API est disponible, mais le code traite cette demande comme une opération qui peut ne pas aboutir. Les limites de fichier, du snapshot JSON et du navigateur ne mesurent pas la même chose.

## Reprise d'un projet

La restauration suit cette séquence :

```text
lecture IndexedDB
  -> vérification et migration de schéma
  -> désérialisation du snapshot et des assets
  -> remise à zéro du runtime DuckDB et des stores transitoires
  -> réimport séquentiel des sources
  -> restauration des visualisations, jointures, filtres, facettes et mise en page
```

Les sources sont retraitées une par une pour limiter la mémoire et éviter les courses asynchrones. Des gardes de cycle de vie empêchent un projet qui n'est plus courant de terminer sa restauration. En cas d'échec du dernier projet, la reprise est mise en quarantaine afin d'éviter une boucle de démarrage.

Cela implique qu'une évolution d'import, de transformation ou de table doit être pensée aussi comme une évolution de reprise : un projet exporté ou enregistré doit reconstruire le même état utile, pas seulement réafficher son JSON.

## Archive `.kh`

Le format actuel est une archive ZIP version 2 :

```text
manifest.json
project.json
assets/<assetId>
```

`manifest.json` décrit la version du conteneur, la date d'export, le projet et les assets. `project.json` porte le snapshot et sa version de schéma. Les octets d'un asset sont placés sous `assets/<assetId>`.

Lors d'un export, les sources sans asset sont préparées sur une copie du projet afin de ne pas muter le projet en mémoire. Cette préparation peut écrire les assets manquants dans IndexedDB. Les entrées JSON sont configurées avec compression ; les assets sont ajoutés au niveau 0. L'export `.kh` n'appelle pas `saveCurrentProject()` : il ne doit pas être décrit comme un flush explicite de l'IndexedDB.

Lors d'un import, Khartis valide d'abord la structure, la version d'archive et le schéma de `project.json`. Les assets sont ensuite restaurés, le projet est désérialisé puis sauvegardé localement. Les versions incompatibles sont rejetées avant la restauration des assets.

### Limites vérifiées de l'import

L'import ne constitue pas une transaction globale : si une erreur survient après la persistance de certains assets, le code ne fait pas de rollback explicite de tous les assets déjà écrits. Les références et le nettoyage d'orphelins participent au cycle de vie normal, sans garantir la récupération de chaque interruption.

Le lecteur charge l'archive entière et appelle `unzipSync()`. Il ne vérifie pas actuellement de plafond propre à `.kh` sur le nombre d'entrées, la taille décompressée, la cohérence entre `assetCount` et `assets`, le hash, le MIME ou la taille déclarée d'un payload. Ne pas présenter le format comme une archive intègre, atomique ou durcie contre toutes les archives malveillantes.

## Fonds personnalisés : faits et lacune à vérifier

Faits prouvés par le code :

- la sérialisation tente de conserver les métadonnées des fonds personnalisés et la table `custom_basemap_attributes` lorsque cette table existe ;
- l'export `.kh` collecte les `assetRef` des fichiers source du projet ;
- le service d'import de fond crée une table DuckDB temporaire nommée `custom_basemap_*` ;
- le chargement d'un fond personnalisé recherche cette table DuckDB à partir de `metadata.file`.

Le chemin inspecté ne montre ni asset de géométrie associé au fond personnalisé, ni sérialisation de sa table de géométrie. Cela constitue une lacune de persistance **non confirmée par un test de reprise complet** : il est plausible que la géométrie d'un fond personnalisé ne soit plus disponible après rechargement ou import d'archive. La documentation ne doit ni garantir cette persistance, ni transformer cette déduction statique en défaut avéré avant un test d'intégration dédié.

## Compatibilité et évolution

La baseline publique est l'archive `.kh` v2 avec le schéma de projet `3.9.0`. Toute évolution de conteneur, de snapshot ou de sémantique durable doit suivre [PROJECT_FORMAT_COMPATIBILITY.md](PROJECT_FORMAT_COMPATIBILITY.md) et ajouter les migrations et fixtures nécessaires.

La restauration locale et l'import `.kh` partagent le même contrat de schéma. Une migration qui passe seulement dans un test de JSON isolé ne suffit pas : elle doit préserver la reprise des assets et le replay des sources.

## Tests vivants

Les principaux tests sont :

- `tests/pipeline/project-archive.test.ts` ;
- `tests/pipeline/project-schema-compatibility.test.ts` ;
- `src/lib/features/project-management/services/asset-store.service.svelte.test.ts` ;
- `src/lib/features/project-management/services/database-access.service.svelte.test.ts` ;
- `src/lib/features/project-management/services/persistence.service.svelte.test.ts` ;
- `tests/pipeline/persistence-registry.test.ts` ;
- `src/lib/features/commons/stores/project/project-lifecycle.svelte.test.ts`.

Les tests actuels couvrent les versions incompatibles, les chunks, les conflits de sauvegarde, les erreurs de quota et les principaux parcours de restauration. Ils ne démontrent pas encore la résistance à une archive très volumineuse ou malveillante, le rollback après échec tardif, l'intégrité cryptographique des assets ni la persistance de géométrie d'un fond personnalisé.
