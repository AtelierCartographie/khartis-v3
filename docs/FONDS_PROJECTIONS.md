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
| Lecture GeoParquet et métadonnées GeoArrow  | `map/services/read-geoparquet-arrow.service.ts`                                                                                    |
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
opération géographique l'exige. `loadGeometryIntoDuckDB` construit alors les
géométries directement depuis les listes de coordonnées GeoArrow
(`map/services/catalog-geometry-sql.ts`), sans passer par du WKT, et une seule
fois par fond même quand plusieurs opérations la demandent en même temps.

`basemapService` met en cache les fonds chargés. `useMapReferenceBasemap`
associe chaque chargement à un identifiant de requête, pour qu'une réponse
tardive n'écrase pas un fond demandé ensuite, et ne recadre pas une vue que
l'utilisateur a déplacée.

## Fonds importés

`processBasemapImport` lit le fichier avec le même lecteur que les jeux de
données (`readFileIntoTable` du pipeline) : mêmes formats, même normalisation
GeoParquet, même CRS source, même lecture des GeoPackages par l'extension
`sqlite_scanner`. Un shapefile zippé est décompressé avant lecture ; un `.shp`
isolé est refusé.

Le fond reçoit ensuite ce qui lui est propre : une colonne de géométrie nommée
`geom`, l'identifiant `__feature_id__` de la jointure et la table d'attributs de
jointure. Les couches dérivées (territoire, limites, centroïdes) et la
métadonnée du fond sont produites par le même code que pour un jeu de données
qui porte sa géométrie (`createBasemapFromGeometryTable`). L'import ne simplifie
ni ne modifie la géométrie : la copie `__raw` qui sert à l'outil Simplification
n'est créée qu'à sa première application.

Le résultat est une table DuckDB `custom_basemap_*`. Sa géométrie n'est pas
encore persistée (voir
[Persistance et archives](PERSISTANCE_ET_ARCHIVES.md#limites-connues)). Un jeu
de données importé qui porte sa propre géométrie peut aussi servir de fond de
référence : il occupe alors le slot de référence s'il est libre.

### Persistance d'un fond importé

La table `custom_basemap_*` et ses couches dérivées sont éphémères, comme toute
table DuckDB. Ce qui est durable, c'est le fichier importé : il est enregistré
comme asset du projet (`sourceAsset` dans la métadonnée du fond), exporté dans
l'archive `.kh`, puis rejoué par `processBasemapImport()` à l'ouverture du
projet, sous le nom de table enregistré dans `metadata.file`. Ce nom doit rester
stable : jointures, fond de référence, couches et attributs le référencent.

Deux conséquences pour qui modifie l'import :

- **L'import doit rester rejouable.** Il est exécuté à nouveau à chaque
  ouverture, sur les mêmes octets. Toute écriture annexe doit être idempotente
  pour un même nom de table, comme `generateCustomBasemapAttributes()` qui
  remplace les attributs du fond au lieu de les ajouter.
- **L'ordre des `__id` doit rester déterministe.** Une jointure restaurée
  s'appuie sur les identifiants recalculés au replay.

Si le replay échoue, un avertissement nomme le fond au lieu de le faire
disparaître en silence. Le détail du contrat de persistance est dans
[PERSISTANCE_ET_ARCHIVES.md](PERSISTANCE_ET_ARCHIVES.md#fonds-personnalisés-importés).

### Couches annexes dérivées

Un fond polygonal importé n'apporte qu'une couverture. Pour qu'il se style
comme un fond du catalogue, `rebuildDerivedGeometryTables()` en dérive trois
tables sœurs :

| Table           | Macro                | Contenu                                 |
| --------------- | -------------------- | --------------------------------------- |
| `…__land`       | `extract_land`       | territoire dissous                      |
| `…__outerlines` | `extract_outerlines` | contour extérieur : le bord de `__land` |
| `…__innerlines` | `extract_innerlines` | limites internes partagées              |

Sur une couverture valide, `extract_coverage_land` et
`extract_coverage_innerlines` évitent la dissolution. Le contour ne dissout
jamais rien : le territoire est déjà une union valide, son bord suffit. Hors
couverture valide, les limites internes sont les arêtes du nodage de tous les
contours qui ne portent pas un segment du bord du territoire : une jointure
exacte en SQL, sans superposition GEOS entre deux géométries géantes.
Des polygones qui se chevauchent (somme des aires supérieure de plus de 1 % à
celle du territoire) n'ont pas de limites internes : leurs contours se
croisent sans rien séparer, signe d'un fichier qui n'est pas une partition. Les
couvertures réelles imparfaites restent loin du seuil (1,0007 pour les ZEE).

Chaque table dérivée tient une ligne par partie (polygone du territoire, ligne
de contour ou de limite) : une géométrie unique demanderait au tas WASM un bloc
contigu de toute sa taille au moment du stream. L'export SVG rassemble les
parties du territoire en un seul tracé composé, comme il fusionne déjà les
lignes consécutives de même style.

Pour un jeu qui porte sa propre géométrie, la dérivation tourne **en
arrière-plan** (`runTableBuildInBackground`), après 500 ms d'inactivité de la
connexion, puis les `__centroids` par lots : la création du projet ouvre
l'étape Données sans les attendre, et le rendu dessine chaque couche quand sa
table est prête (`waitForTableBuild`). Une requête lancée pendant une étape de
la dérivation attend sa fin, DuckDB WASM ne l'interrompt pas.

La dérivation est relancée après une simplification, qui attend d'abord une
dérivation en cours. Un fond linéaire ne reçoit qu'une table de points
représentatifs.

- **Elle n'est jamais destructrice** : la table source reste intacte.
- **GEOS WASM est plus strict que le natif** et refuse de dissoudre certaines
  couvertures. `createDerivedTable()` réessaie une fois avec un re-nodage
  (`noding_factor`, fraction du périmètre moyen, valable en degrés comme en
  mètres). Si cela échoue encore, la table est créée **vide** : la couche
  disparaît sans casser le fond. `ST_MakeValid` ne corrige pas ce cas, qui est
  un problème de nodage.
- **Un manque de mémoire n'est jamais retenté** et arrête la dérivation : les
  tables restantes sont créées vides. La mémoire WASM ne rétrécit pas, et après
  un second échec de ce type le tas ne sert plus les grosses allocations : le
  territoire déjà calculé ne se streame plus.

## Colonnes géographiques

Une seule détection, `detectGeoColumns()` (`commons/services/geo-detection.service.ts`),
produit `dataset.geoDetection`. Elle tourne sur toute la table, après « Créer »,
au rechargement, à la réinitialisation et pour un fichier d'enrichissement :
création et rechargement donnent donc le même résultat.

- **Proxys universels**, valables même sans fond du catalogue : le typage
  sémiologique reconnaît les identifiants (`geoid` : valeurs uniques, mots `id`,
  `code`, `iso`) et les coordonnées (`geolat`, `geolon` : nom et étendue).
- **Garantie du catalogue** : les valeurs distinctes de chaque colonne texte, ou
  identifiant numérique, sont cherchées dans `basemap_attributes` avec la
  normalisation de la jointure. Au moins 5 valeurs distinctes et une
  correspondance d'au moins 50 % confirment la colonne et donnent les fonds
  concernés (`catalogBasemaps`). Sans l'index (premier usage hors ligne), seuls
  les proxys universels s'appliquent.
- **Colonne principale** (`suggestedPrimaryGeoColumn`) : d'abord une colonne
  confirmée par le catalogue, puis unique, puis typée `geoid`, puis la plus
  sûre.

Les types se limitent à `identifier`, `latitude` et `longitude`. Le niveau
administratif ne se devine pas à partir du nom de la colonne : il se lit dans
les fonds qui partagent les valeurs.

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

Pour un fond importé, la jointure range dans `basemap_id` la **valeur brute**
de la colonne du fond qui a apparié la donnée (un nom, un code), pas son `__id`.
Les colonnes candidates viennent d'une seule règle,
`selectBasemapJoinKeyColumns()` (`duckdb/utils/`) : noms et codes reconnus,
sinon les cinq premières colonnes texte. Le rendu split doit retrouver ces
valeurs dans la géométrie : `getCustomBasemapGeometryProjectColumns()` projette
au moins ces colonnes, et `resolveBestSplitFeatureIdColumn()` essaie toute
colonne texte ou entière. Si une colonne de jointure manque à la géométrie, la
légende se calcule mais aucune entité n'est dessinée.

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

### Fichier déjà projeté

Un fichier géographique importé dans un CRS projeté (Lambert-93, UTM…) garde
ses coordonnées. Sans projection choisie, il est dessiné tel quel ; l'outil
Projection reconnaît alors la suggestion qui porte le même code EPSG, la nomme
comme projection courante et coche sa carte. Choisir cette suggestion revient au
rendu d'origine, sans aucune transformation.

Toute autre projection passe par le WGS84, sans que l'utilisateur le voie : une
projection d3 ne prend que des longitudes et latitudes. Le jeu de données est
relu par `ST_Transform` vers EPSG:4326, et le fond qui en dérive (territoire,
limites, centroïdes) l'est aussi : `basemapService` sert une variante WGS84 du
fond, avec sa propre emprise, tant que la projection ou le moteur tuilé
l'exige. Tant que les tables WGS84 ne sont pas arrivées, la table encore en CRS
source n'est ni dessinée ni mesurée, et une emprise hors longitude et latitude
n'ajuste jamais une projection d3.

### Export en couches SIG pour QGIS

Le format de carte « GeoPackage (QGIS) » (`header/services/qgis/`) écrit la
carte elle-même : les couches de fond dessinées depuis une géométrie (terres,
lacs, limites, rivières) et une couche par figuré de chaque visualisation
active, dans l'ordre de la carte. Le .zip contient le GeoPackage, un projet
QGIS (`.qgs`, chemins relatifs) qui ouvre les couches dans cet ordre et dans le
SCR de la carte, et un mémo de ce qui n'a pas pu être reproduit.

- Le SCR est celui de `resolveMapVectorCrs` : la définition de
  `resolveCurrentProjectionDefinition`, comme pour l'export géoréférencé. Une
  projection sans équivalent PROJ (composite, oblique, globe, propre à d3)
  exporte en WGS84, et la boîte d'export comme le mémo le disent.
- La reprojection passe par `ST_Transform` vers EPSG:4326 puis vers le SCR de
  la carte. Une géométrie en longitude et latitude est d'abord coupée au
  méridien opposé au centre, comme le fait d3 ; sinon PROJ étire les anneaux
  qui le traversent sur toute la carte. Si DuckDB refuse le SCR cible, la
  projection se fait en JavaScript avec la fonction qui géoréférence l'image.
  Une entité qui sort du domaine de la projection est écartée et comptée dans
  le mémo.
- Les symboles et étiquettes sont posés sur les centroïdes que fournit le fond
  du catalogue, comme sur la carte, et à défaut sur le point de
  `ST_MaximumInscribedCircle`. Une visualisation de symboles doubles devient
  deux lignes par entité (rôle A et B), pour que QGIS trie tous les symboles
  par taille comme la carte.
- Les étiquettes reprennent les textes retouchés et les positions déplacées
  (`labelLayoutStore`, même clé d'entité que la carte) dans des attributs
  `khartis_etiquette`, `khartis_decalage_x_mm` et `khartis_decalage_y_mm`
  qui pilotent l'étiquetage QGIS.
- L'ordre des couches est celui du panneau Calques : `mergeLayerOrder` sur les
  lignes du panneau, ordre manuel compris. Une collection de cartes exporte
  ses cartes (pas la visualisation d'origine), dans une liste unique à l'ordre
  de la carte, avec un thème de carte QGIS par carte.
- Une projection composite s'exporte dans le SCR du territoire principal (entrée
  `mainland` du préréglage), les encarts à leur position réelle ; le mémo et la
  boîte d'export le disent. Une chaîne PROJ identique à un code connu est
  déclarée par ce code (`findKnownEpsgForProj4`) : sinon QGIS choisit entre
  équivalents (LAEA Europe lue EPSG:5636 au lieu de 3035). Dans le projet
  QGIS, un code EPSG s'écrit en WKT dont l'autorité racine suffit à QGIS pour
  reconstruire le SCR.
- Les colonnes de dates partent en `DATE` ou `DATETIME` ISO, et les classes de
  dates comparent des dates (`to_date('2020-01-01')`), jamais des
  millisecondes, qui dépendent du fuseau dans QGIS.
- Les territoires joints partent toujours avec leurs données, en couche
  décochée quand la visualisation ne les dessine pas (symboles seuls) ; la
  densité de points part avec les points mêmes de la carte (même graine, même
  cache).
- L'archive contient l'image JPEG de la page, calée quand la carte a un SCR
  (`.aux.xml`, world file) et ajoutée décochée au projet ; le mémo reprend les
  textes de la page et la légende en clair (méthode, classes et couleurs).
- Graticule et équateur : lignes remarquables du catalogue, ou lignes que la
  carte génère (`getGraticuleGeoJSON`), reprojetées comme le reste.
- Les styles sont des QML enregistrés dans la table `layer_styles`, que QGIS
  applique à l'ouverture. Les classes sont des règles qui reprennent
  exactement `getClassIndexForValue` (une valeur égale à une borne tombe dans
  la même classe que sur la carte), les tailles proportionnelles une
  expression sur le domaine de la carte, les tailles des millimètres sur la
  page Khartis. Les trames motif.js deviennent des hachures ou des grilles de
  symboles QGIS de même pas, épaisseur et angle (`qgis-patterns.ts`). Ce qui
  ne se traduit pas (densité, évidement, filets d'étiquettes, certaines
  trames, mise en page) est listé dans le mémo, jamais approché sans le dire.
- Une couche qui échoue (géométrie refusée par GEOS, SCR inaccessible) est
  écartée, nommée dans le mémo et signalée à l'utilisateur ; le reste de la
  carte est exporté.

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
