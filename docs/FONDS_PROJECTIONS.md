# Fonds de carte et projections

Ce document décrit les fonds de référence, leurs attributs, les jointures
géographiques et le choix de projection. Il complète le document sur le rendu
cartographique sans répéter son cycle WebGL.

## Modèle cartographique

Khartis distingue trois objets qui peuvent être liés, mais ne sont pas
interchangeables :

| Objet                     | Rôle métier                                                  | Rôle technique                                          |
| ------------------------- | ------------------------------------------------------------ | ------------------------------------------------------- |
| Jeu de données thématique | Porte la mesure, les catégories ou les entités à représenter | Table DuckDB et résultat Arrow                          |
| Fond de référence         | Donne les géométries, limites ou repères géographiques       | GeoParquet catalogue ou jeu importé                     |
| Projection                | Définit le passage des coordonnées à l'espace de la carte    | d3 et geoarrow-deck-stream, ou MapLibre selon le moteur |

Un fond peut être purement visuel, servir de support à une jointure, ou fournir
la géométrie d'une visualisation. Une jointure ne transforme pas
nécessairement le fond et le jeu métier en une seule table, le rendu peut rester
split pour éviter de dupliquer les géométries.

## Sources de vérité

| Responsabilité                             | Source principale                                               |
| ------------------------------------------ | --------------------------------------------------------------- |
| Métadonnées et chargement des fonds        | src/lib/features/map/services/basemap.service.svelte.ts         |
| Lecture GeoParquet et métadonnées GeoArrow | src/lib/features/map/services/read-geojson-arrow.service.ts     |
| Recherche et sélection de catalogue        | src/lib/features/map/services/basemap-catalog.service.svelte.ts |
| Import d'un fond personnalisé              | src/lib/features/map/services/basemap-import.service.ts         |
| Chargement et cadrage du fond de référence | src/lib/features/map/hooks/use-map-reference-basemap.svelte.ts  |
| Styles MapLibre et OSM                     | src/lib/features/map/hooks/use-map-basemap.svelte.ts            |
| Projections et bridge binaire              | src/lib/features/map/utils/geoarrow-stream-bridge.utils.ts      |

Les métadonnées publiques du catalogue se trouvent sous static/basemaps. Ne
figez pas dans la documentation un nombre de fonds, de variantes ou de
familles : le catalogue est une donnée versionnée.

## Catalogue : affichage rapide et capacité analytique

Un fond catalogue possède généralement une géométrie GeoParquet et des
attributs descriptifs. Deux parcours sont possibles selon le besoin.

    Affichage primaire
      GeoParquet -> parquet-wasm -> Arrow avec GeoArrow -> Deck.gl

    Analyse, jointure ou densité
      GeoParquet -> DuckDB -> table de fond -> requête ou jointure -> Arrow

Le premier parcours est volontairement direct pour éviter un chargement DuckDB
inutile lors du dessin. Le second est tout aussi légitime lorsque la géométrie
ou ses attributs doivent participer au traitement. Il est donc incorrect de
dire qu'un fond catalogue ne passe jamais par DuckDB.

basemapService met en cache les fonds chargés. useMapReferenceBasemap protège
les chargements asynchrones par un identifiant de requête afin qu'une réponse
ancienne ne remplace pas le fond demandé plus récemment. Il décide aussi si le
changement de fond doit recadrer la carte ou respecter une vue manipulée par
l'utilisateur.

## Fonds personnalisés

Un fond importé suit le pipeline de données de l'application et devient une
ressource DuckDB avant son exposition en Arrow. Cette règle couvre les formats
gérés par DuckDB, notamment les données tabulaires, GeoParquet et les fichiers
géographiques.

Les exceptions documentées doivent rester explicites :

- GPX utilise son processeur dédié.
- Un JSON qui n'est pas lisible comme GeoJSON peut suivre le lecteur tabulaire.
- GeoPackage possède un secours navigateur fondé sur SQLite WASM, WKB et proj4
  lorsque le parcours DuckDB ne suffit pas.
- Un Shapefile requiert ses fichiers compagnons, un fichier .shp isolé ne
  constitue pas un fond valide.

Ces exceptions n'autorisent pas l'ajout d'un parseur JavaScript pour un format
dangereux ou déjà pris en charge par DuckDB.

## Attributs et jointures

Les attributs du catalogue peuvent être chargés dans DuckDB sans charger sa
géométrie pour le dessin. Cette séparation permet de choisir une couche de
référence légère, puis de matérialiser la géométrie seulement si une opération
géographique le requiert.

Lors d'une jointure, vérifier :

1. l'identifiant géographique et son niveau administratif ;
2. les types, la normalisation et les valeurs sans correspondance ;
3. le CRS de la géométrie de sortie ;
4. le contrat de rendu attendu : table directe ou rendu split.

### Ce que coûte un fond de plus au catalogue

La phase fuzzy de la jointure est linéaire en **noms distincts** du catalogue, pas en nombre de fonds : les valeurs normalisées sont dédupliquées avant d'être comparées. Ajouter une résolution, un millésime ou un découpage régional d'un territoire déjà couvert n'ajoute donc **aucun** nom distinct et ne coûte rien à la jointure. Seul un nouveau territoire apporte des noms nouveaux, et d'autant plus qu'il descend fin : un niveau communal en apporte à peu près son propre effectif.

L'ordre de grandeur à retenir : le seuil du budget fuzzy se resserre proportionnellement aux noms distincts, donc une croissance du catalogue concentrée sur des niveaux communaux de nouveaux pays réduit d'autant le nombre de valeurs qui reçoivent des suggestions automatiquement. Voir la phase fuzzy dans `IMPORT_DUCKDB.md`.

Le rendu split conserve la géométrie de fond et les attributs du jeu de données
dans des tables Arrow distinctes, liées par featureId. Il réduit les copies de
géométrie tout en conservant le picking et les infobulles sur la ligne métier.

Les jointures, classifications, recherches et densités sont des opérations
DuckDB. Après une mutation de table, les caches de métadonnées, de jointures ou
de résultats Arrow concernés doivent être invalidés par les mécanismes de
l'orchestrateur.

## CRS et projections

Trois notions doivent rester séparées dans le code et la documentation :

| Notion              | Question à résoudre                                               |
| ------------------- | ----------------------------------------------------------------- |
| CRS source          | Dans quelles coordonnées arrive le fichier ou le GeoParquet ?     |
| Projection de rendu | Comment les géométries sont-elles transformées pour cette carte ? |
| Moteur de carte     | Le rendu utilise-t-il Deck orthographique ou MapLibre intercalé ? |

Les données utilisées par MapLibre sont préparées dans le CRS compatible avec
son rendu tuilé. En mode Deck orthographique, les transformations d3 sont
appliquées par geoarrow-deck-stream aux buffers GeoArrow. Une reprojection ne
doit pas dégrader le chemin binaire en une conversion générale vers GeoJSON.

La projection résolue dépend de la configuration de la visualisation, du fond
de référence et des projections composites. Les projections composites
définissent plusieurs zones de dessin, par exemple une zone principale et des
encarts. Elles impliquent une mise en page, un cadrage et un ordre de couches
stables pour que chaque contexte conserve ses géométries et ses labels.

Les projections non identitaires peuvent exiger un masque ou un contour de
sphère. Ces couches de contexte font partie de la carte et doivent être
vérifiées avec les couches thématiques, pas uniquement avec un fond vide.

## Styles, ordre et simplification

Un fond peut être rendu :

- comme géométrie de référence Deck ;
- comme style tuilé MapLibre, avec les couches Deck intercalées ;
- comme raster OSM ;
- en variante simplifiée adaptée à l'échelle ou à la projection.

Les couches de fond sont placées derrière ou devant les couches thématiques
selon leur rôle. La configuration de style, l'ordre effectif et les libellés
MapLibre doivent rester synchronisés par useMapBasemap et useMapLayers.

La simplification doit être choisie comme une variante de la donnée catalogue
ou une opération géographique maîtrisée. Elle doit préserver les identifiants
utiles aux jointures et être vérifiée sur les contours, les îles, les encarts
et les limites administratives. Ne pas simplifier une géométrie uniquement pour
masquer un problème de projection ou de mémoire.

## Ajouter ou modifier un fond

Avant d'ajouter un fond catalogue :

1. définir ses métadonnées, son niveau géographique, son CRS et ses variantes ;
2. vérifier que le GeoParquet expose une géométrie lisible et que les
   métadonnées GeoArrow sont disponibles après lecture ;
3. définir séparément les attributs nécessaires aux jointures ;
4. tester l'affichage direct depuis parquet-wasm ;
5. tester la matérialisation DuckDB si le fond peut être joint, analysé ou
   densifié ;
6. tester les modes Deck et MapLibre concernés, le cadrage, la projection et la
   simplification.

Pour un fond importé, partir du pipeline existant plutôt que d'ajouter une voie
spécifique au composant de carte. Vérifier les messages d'erreur, les fichiers
compagnons, la réouverture du projet et l'export de l'archive.

## Diagnostic ciblé

| Symptôme                                      | Vérifications prioritaires                                                            |
| --------------------------------------------- | ------------------------------------------------------------------------------------- |
| Fond catalogue absent                         | URL de géométrie, lecture parquet-wasm, métadonnées GeoArrow, requête active et cache |
| Jointure sans résultat                        | Clés géographiques, normalisation, niveau administratif et table DuckDB matérialisée  |
| Fond correct mais couche thématique déplacée  | CRS source, projection résolue, moteur choisi et cadrage                              |
| Style tuilé instable                          | État du style MapLibre, synchronisation des couches intercalées et ordre              |
| Ralentissement après changement de projection | Variante simplifiée, identité des tables/projections, Worker de parse et caches       |

Les tests du service de fonds, du bridge GeoArrow, des projections, des
jointures et des formats GeoParquet ou GeoPackage doivent accompagner toute
évolution de ce modèle.
