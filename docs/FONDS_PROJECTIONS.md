# Fonds de carte et projections

Fonds de référence, fonds importés, jointures géographiques et projections. Le
cycle de vie WebGL est décrit dans
[Rendu cartographique](RENDU_CARTOGRAPHIQUE.md).

## Trois objets distincts

| Objet                     | Rôle cartographique                            | Rôle technique                             |
| ------------------------- | ---------------------------------------------- | ------------------------------------------ |
| Jeu de données thématique | porte la mesure, les catégories ou les entités | table DuckDB, puis Arrow                   |
| Fond de référence         | fournit géométries, limites et repères         | GeoParquet du catalogue ou fichier importé |
| Projection                | passe des coordonnées à l'espace de la carte   | d3 via geoarrow-deck-stream, ou MapLibre   |

Un fond peut être purement visuel, servir de support à une jointure ou fournir
la géométrie d'une visualisation. Une jointure ne fusionne pas forcément fond et
données en une seule table : le rendu split évite de dupliquer les géométries.

## Points d'entrée

Chemins relatifs à `src/lib/features/`.

| Responsabilité                              | Fichier                                                                                                                            |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Métadonnées, chargement et cache des fonds  | `map/services/basemap.service.svelte.ts`                                                                                           |
| Lecture GeoParquet et métadonnées GeoArrow  | `map/services/read-geojson-arrow.service.ts`                                                                                       |
| Recherche dans le catalogue                 | `map/services/basemap-catalog.service.svelte.ts`                                                                                   |
| Import d'un fond                            | `map/services/basemap-import.service.ts`                                                                                           |
| Chargement et cadrage du fond de référence  | `map/hooks/use-map-reference-basemap.svelte.ts`                                                                                    |
| Styles MapLibre et OSM                      | `map/hooks/use-map-basemap.svelte.ts`                                                                                              |
| Couches annexes dérivées                    | `duckdb/operations/derived-geometry.ts`                                                                                            |
| Construction et orientation des projections | `commons/utils/projection.utils.ts`, `map/utils/khartis-projection-factories.utils.ts`, `map/utils/user-projection-build.utils.ts` |
| Application aux buffers binaires            | `map/utils/geoarrow-stream-bridge.utils.ts`                                                                                        |

Le catalogue est une donnée versionnée sous `static/basemaps/` : la
documentation ne fige ni nombre de fonds ni liste de variantes.

## Fonds du catalogue

Un fond du catalogue a une géométrie GeoParquet et des attributs descriptifs.
Deux parcours coexistent :

```text
Affichage                     GeoParquet → parquet-wasm → Arrow/GeoArrow → Deck.gl
Jointure, analyse ou densité  GeoParquet → DuckDB → table de fond → requête → Arrow
```

L'affichage évite DuckDB pour dessiner vite. Les attributs peuvent être chargés
dans DuckDB sans la géométrie ; celle-ci n'y est matérialisée que si une
opération géographique l'exige.

`basemapService` met en cache les fonds chargés. `useMapReferenceBasemap`
associe chaque chargement à un identifiant de requête, pour qu'une réponse
tardive n'écrase pas un fond demandé ensuite, et ne recadre pas une vue que
l'utilisateur a déplacée.

## Fonds importés

`processBasemapImport` a son propre chemin de lecture, distinct du pipeline des
jeux de données :

- Shapefile zippé ; un `.shp` isolé est refusé ;
- Parquet et GeoParquet par `read_parquet` ;
- GeoPackage et autres formats géographiques par `ST_Read`, avec un repli
  navigateur (SQLite WASM, WKB, proj4) pour les GeoPackages que le build WASM ne
  lit pas.

Le résultat est une table DuckDB `custom_basemap_*`. Sa géométrie n'est pas
encore persistée (voir
[Persistance et archives](PERSISTANCE_ET_ARCHIVES.md#limites-connues)). Un jeu
de données importé qui porte sa propre géométrie peut aussi servir de fond de
référence : il occupe alors le slot de référence s'il est libre.

### Couches annexes dérivées

Un fond polygonal importé n'apporte qu'une couverture. Pour qu'il se style
comme un fond du catalogue, `rebuildDerivedGeometryTables()` en dérive trois
tables sœurs :

| Table           | Macro                | Contenu                                         |
| --------------- | -------------------- | ----------------------------------------------- |
| `…__land`       | `extract_land`       | territoire dissous                              |
| `…__outerlines` | `extract_outerlines` | contour extérieur, calculé à partir de `__land` |
| `…__innerlines` | `extract_innerlines` | limites internes partagées                      |

La dérivation est relancée après une simplification. Un fond linéaire ne reçoit
qu'une table de points représentatifs.

- **Elle n'est jamais destructrice** : la table source reste intacte.
- **GEOS WASM est plus strict que le natif** et refuse de dissoudre certaines
  couvertures. `createDerivedTable()` réessaie une fois avec un re-nodage
  (`noding_factor`, fraction du périmètre moyen, valable en degrés comme en
  mètres). Si cela échoue encore, la table est créée **vide** : la couche
  disparaît sans casser le fond. `ST_MakeValid` ne corrige pas ce cas, qui est
  un problème de nodage.

## Jointures

Lors d'une jointure, vérifier :

1. l'identifiant géographique et son niveau administratif ;
2. les types, la normalisation et les valeurs sans correspondance ;
3. le CRS de la géométrie produite ;
4. le contrat de rendu attendu : table directe ou split.

En rendu split, la géométrie du fond et les attributs du jeu de données restent
dans des tables Arrow distinctes, reliées par `featureIdColumn` : moins de
copies de géométrie, et picking et infobulles toujours rattachés à la ligne du
jeu de données.

Jointures, classifications, recherches et densités sont des opérations DuckDB ;
après une mutation, les caches concernés sont invalidés par l'orchestrateur
([Import et DuckDB](IMPORT_DUCKDB.md#caches-et-mutations)).

### Coût d'un fond de plus au catalogue

La phase fuzzy compare les valeurs non appariées aux **noms distincts** des
fonds candidats (dédupliqués après normalisation). Les candidats sont les fonds
qui ont déjà des correspondances exactes, ou tout le catalogue à défaut.
Ajouter une résolution, un millésime ou un découpage d'un territoire déjà
couvert n'ajoute donc aucun nom. Un nouveau territoire en ajoute, d'autant plus
qu'il est fin : un niveau communal en apporte à peu près son nombre de communes.
Comme le budget est fixé en paires (`MAX_FUZZY_AUTO_PAIRS`), plus de noms
distincts signifie moins de valeurs suggérées automatiquement ; le reste l'est à
la demande ([Import et DuckDB](IMPORT_DUCKDB.md#phase-fuzzy-de-la-jointure)).

## CRS et projections

Trois notions à ne pas confondre :

| Notion              | Question                                                          |
| ------------------- | ----------------------------------------------------------------- |
| CRS source          | dans quelles coordonnées arrive le fichier ?                      |
| Projection de rendu | comment les géométries sont-elles transformées pour cette carte ? |
| Moteur de carte     | Deck.gl orthographique ou MapLibre intercalé ?                    |

En mode orthographique, geoarrow-deck-stream applique la projection d3
directement aux buffers GeoArrow ; en mode MapLibre, les données sont préparées
pour son rendu tuilé. Une reprojection ne dégrade jamais le chemin binaire en
conversion GeoJSON.

La projection résolue dépend de la visualisation, du fond de référence et des
projections composites. Une projection composite définit plusieurs zones de
dessin (territoire principal, encarts) avec leur propre cadrage et ordre de
couches. Les projections non identitaires peuvent ajouter un masque ou un
contour de sphère, à vérifier avec les couches thématiques, pas seulement sur
un fond vide.

### Orientation intrinsèque

Beaucoup de projections d3 portent leur propre orientation : Bertin 1953 est
centrée sur les terres habitées, Air Ocean sur son icosaèdre, la Mollweide
interrompue sur la coupure atlantique. Le rendu applique
`rotate([-longitude, -latitude, gamma])` à partir des réglages de
l'utilisateur ; des réglages à zéro ramèneraient donc la projection à lon/lat 0.

`resolveProjectionDefaultOrientation()` lit le `rotate()` par défaut de chaque
projection et le met en cache. Un code de projection saisi à la main part de
`[0, 0]`. Une entrée du catalogue qui a besoin d'un autre cadrage que celui de
d3 déclare son `rotate` dans le catalogue, pas dans le rendu — par exemple le
planisphère carré (Peirce quinconcial).

## Styles, ordre et simplification

Un fond peut être rendu comme géométrie de référence Deck.gl, comme style tuilé
MapLibre avec couches Deck.gl intercalées, ou comme raster OSM. Les couches de
fond se placent derrière ou devant les couches thématiques selon leur rôle ;
`useMapBasemap` et `useMapLayers` synchronisent style, ordre effectif et
libellés MapLibre.

Une simplification est une variante de la donnée ou une opération géographique
maîtrisée. Elle préserve les identifiants de jointure et se vérifie sur les
contours, îles, encarts et limites administratives. Elle ne sert pas à masquer
un problème de projection ou de mémoire.

## Ajouter un fond au catalogue

1. Définir métadonnées, niveau géographique, CRS et variantes.
2. Vérifier que le GeoParquet expose une géométrie lisible et des métadonnées
   GeoArrow après lecture.
3. Définir séparément les attributs utiles aux jointures.
4. Tester l'affichage direct par parquet-wasm, puis la matérialisation DuckDB
   si le fond peut être joint, analysé ou densifié.
5. Tester les modes Deck.gl et MapLibre concernés, le cadrage, la projection et
   la simplification.

## Diagnostic

| Symptôme                                      | Vérifier                                                                     |
| --------------------------------------------- | ---------------------------------------------------------------------------- |
| Fond du catalogue absent                      | URL de géométrie, lecture parquet-wasm, métadonnées GeoArrow, requête active |
| Jointure sans résultat                        | clés, normalisation, niveau administratif, table DuckDB matérialisée         |
| Couche thématique décalée par rapport au fond | CRS source, projection résolue, moteur, cadrage                              |
| Style tuilé instable                          | état du style MapLibre, synchronisation et ordre des couches intercalées     |
| Fond importé absent après rechargement        | limite connue de persistance des fonds importés                              |
| Lenteur après changement de projection        | variante simplifiée, identité des tables et projections, worker de parse     |
