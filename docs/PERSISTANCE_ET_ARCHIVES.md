# Persistance, reprise et archives

Khartis enregistre les projets dans le navigateur (IndexedDB) et les exporte en
archives `.kh`. Cette page décrit ce qui est conservé, comment un projet est
restauré, et les limites connues. Le contrat de version est dans
[Compatibilité du format projet](PROJECT_FORMAT_COMPATIBILITY.md).

## Ce qui est conservé, ce qui est recréé

| Élément                           | Où                                 | Durée de vie                   |
| --------------------------------- | ---------------------------------- | ------------------------------ |
| Snapshot du projet                | IndexedDB, `project.json` du `.kh` | durable                        |
| Fichiers source et fonds importés | IndexedDB, `assets/` du `.kh`      | durable, en assets binaires    |
| Tables, macros et caches DuckDB   | mémoire                            | session ; recréés à la reprise |
| Historique annuler/rétablir       | mémoire                            | session                        |
| Liste des projets, dernier ouvert | IndexedDB                          | durable                        |

Le snapshot ne contient pas les octets des sources, mais il ne se limite pas à
des métadonnées : il porte aussi statistiques, transformations, jointures,
corrections, visualisations et mise en page.

## IndexedDB

Base `KhartisDB`, version 3 :

| Store                  | Contenu                                          |
| ---------------------- | ------------------------------------------------ |
| `projects`             | snapshot sérialisé                               |
| `metadata`             | métadonnées applicatives et de projet            |
| `project_assets`       | description d'un asset : MIME, taille, découpage |
| `project_asset_chunks` | octets, par blocs de 8 Mio                       |
| `project_asset_refs`   | liens projet → asset, pour le nettoyage          |

L'ouverture gère les blocages, les changements de version et un timeout de
10 s. Une migration unique reprend les anciennes clés `localforage` ; en cas de
doublon, IndexedDB l'emporte.

## Enregistrement

L'autosave passe par `persistenceRegistry`, avec un debounce de 750 ms : les
changements sont regroupés, une mutation survenue pendant un enregistrement
n'est pas perdue, et l'autosave est suspendu pendant une restauration. Le
layout force aussi un enregistrement sur `visibilitychange` (onglet masqué),
`pagehide` et `beforeunload`.

Un enregistrement vérifie d'abord la taille estimée du snapshot, puis prépare
les assets. Il utilise une révision optimiste : si deux onglets écrivent le même
projet, le second reçoit une `ProjectSaveConflictError` au lieu d'écraser la
révision la plus récente.

Il n'y a pas de transaction unique pour tout un projet : chaque bloc d'asset,
les métadonnées de l'asset, le snapshot, les références et les métadonnées de
projet sont écrits dans des transactions distinctes.

## Quotas et tailles

| Règle                             | Valeur              |
| --------------------------------- | ------------------- |
| CSV, TSV, GeoJSON, KML, KMZ, GPX  | 150 Mio par fichier |
| Shapefile, GeoPackage, GeoParquet | 200 Mio par fichier |
| ZIP générique                     | 100 Mio par fichier |
| Total d'un import                 | 200 Mio             |
| Fichiers par import               | 20                  |
| Snapshot sérialisé                | 150 Mio             |
| Projets                           | 50                  |

Avant d'écrire un asset, Khartis consulte `navigator.storage.estimate()` et
exige la taille de l'asset plus une marge de max(20 %, 8 Mio). Sans estimation
disponible, l'écriture est tentée et l'erreur de quota du navigateur reste
possible. En production, la PWA demande le stockage persistant
(`navigator.storage.persist()`), sans garantie que le navigateur l'accorde.

Ces seuils sont des garde-fous : ils ne garantissent pas qu'un gros projet
pourra être importé, enregistré et rouvert sur tous les navigateurs.

## Reprise d'un projet

```text
lecture IndexedDB
  → vérification et migration du schéma
  → désérialisation du snapshot et des assets
  → remise à zéro de DuckDB et des stores transitoires
  → reconstruction des fonds importés depuis leurs assets
  → réimport séquentiel des sources (le fichier sélectionné d'abord)
  → restauration des visualisations, jointures, filtres, facettes et mise en page
```

Les sources sont réimportées une par une pour limiter la mémoire. Des gardes
empêchent un projet qui n'est plus courant de terminer sa restauration. La
reprise du dernier projet a un timeout de 5 minutes ; si elle échoue, le projet
est mis en quarantaine pour la session (`sessionStorage`) afin d'éviter une
boucle au démarrage.

Conséquence : toute évolution d'import, de transformation ou de table est aussi
une évolution de la reprise. Un projet rouvert doit reconstruire le même état,
pas seulement relire son JSON.

## Archive `.kh`

Archive ZIP, conteneur version 2 :

```text
manifest.json      version du conteneur, date, projet, liste des assets
project.json       snapshot et version de schéma
assets/<assetId>   octets de chaque asset
```

**Export.** Les sources sans asset sont préparées sur une copie du projet, ce
qui peut écrire les assets manquants dans IndexedDB. Les JSON sont compressés,
les assets ajoutés sans compression. L'export n'appelle pas
`saveCurrentProject()`.

**Import.**

1. La taille du fichier est bornée avant lecture.
2. `unzipSync()` ne décompresse que les entrées attendues, avec un plafond sur
   leur nombre et sur les tailles déclarées.
3. La structure, la version du conteneur, le manifest (`assetCount`, chemin
   `assets/<assetId>`) et le schéma de `project.json` sont validés ; une
   version incompatible est rejetée avant toute écriture d'asset.
4. Les assets sont restaurés (un `assetId` déjà présent localement est
   conservé tel quel), puis le projet est désérialisé et enregistré.
5. Si l'identifiant du projet existe déjà localement, le projet importé reçoit
   un nouvel identifiant.

L'import n'est pas transactionnel. En cas d'échec après la restauration des
assets, Khartis supprime au mieux le projet partiel et les assets orphelins
(ceux d'un autre projet sont conservés), puis recharge le projet précédent.
Une fermeture d'onglet en cours d'import n'est pas couverte.

Aucun hash ni contrôle du contenu réel des assets n'est effectué : le format
n'est ni signé, ni durci contre une archive malveillante.

## Limites connues

## Fonds importés

Un fond importé (fichier ou URL) est persisté comme une source : son fichier
d'origine devient un asset, et ses tables DuckDB sont rejouées à la reprise.

- **Asset source.** Après `processBasemapImport()`,
  `persistCustomBasemapSource()` écrit le fichier importé dans les assets et
  l'attache à la métadonnée du fond (`sourceAsset`). La reprise ne dépend donc
  pas du réseau.
- **Snapshot.** `customBasemaps.metadata` porte ce `sourceAsset` ;
  `customBasemaps.attributes` ne garde que les lignes de
  `custom_basemap_attributes` des fonds sérialisés.
- **Références et archive.** `saveProject()` ajoute les `sourceAsset` aux
  références d'assets du projet, et l'export `.kh` les place sous
  `assets/<assetId>`. Supprimer le projet libère aussi ses fonds importés.
- **Replay.** `restoreCustomBasemapTables()` s'exécute après la remise à zéro
  de DuckDB et **avant** le réimport des sources, car la restauration d'une
  jointure a besoin de la table du fond. Il rejoue `processBasemapImport()`
  sous le **même** nom de table (`metadata.file`) : table normalisée, `__id`,
  couches dérivées, centroïdes et attributs de jointure. Une table déjà
  présente n'est pas rejouée. Le fond de référence reconstruit est ensuite
  enregistré auprès de `basemapService` : l'incrément de `registrationVersion`
  fait réessayer la carte, qui l'a souvent demandé trop tôt à l'import d'un
  `.kh`.
- **Échec visible.** Un fond non reconstructible (asset absent ou corrompu,
  erreur DuckDB, projet `3.9.0` antérieur au mécanisme) déclenche un seul
  avertissement qui liste les fonds concernés ; le reste du projet s'ouvre.
- **Portée par projet.** La désérialisation remplace les fonds personnalisés
  du projet précédent, et un nouveau projet repart sans fond personnalisé.

## Limites connues

- **Fond importé abandonné.** L'asset est écrit à l'import du fond, avant la
  sauvegarde : un fond abandonné avant toute sauvegarde laisse un asset sans
  référence. Si l'écriture échoue (quota), l'import du fond échoue.
- **Projets `3.9.0`.** Un fond importé dans un projet `3.9.0` n'a jamais
  conservé ses octets : aucune migration ne peut les recréer.
- **Coût du replay.** Il refait tout le traitement d'import ; son coût à
  l'ouverture est celui de l'import initial.
- **Projet local illisible.** Un projet dont le schéma ne peut pas être migré
  est journalisé et ne s'ouvre pas, sans message d'erreur explicite.

## Tests de référence

- `tests/pipeline/project-archive.test.ts`
- `tests/pipeline/project-schema-compatibility.test.ts`
- `tests/pipeline/custom-basemap-persistence.test.ts`
- `tests/pipeline/persistence-registry.test.ts`
- `src/lib/features/project-management/services/asset-store.service.svelte.test.ts`
- `src/lib/features/project-management/services/database-access.service.svelte.test.ts`
- `src/lib/features/project-management/services/persistence.service.svelte.test.ts`
- `src/lib/features/commons/stores/project/project-lifecycle.svelte.test.ts`

Ils couvrent versions incompatibles, découpage en blocs, conflits
d'enregistrement, quotas, restauration, plafonds d'import `.kh`, validation du
manifest, collision d'identifiant, nettoyage après échec, et l'aller-retour
d'un fond importé (replay, avertissement, isolement entre projets). Le replay
réel dans DuckDB WASM reste vérifié dans le navigateur, pas en CI.
