# Glossaire technique

> Termes du code et de l'architecture Khartis v3 — orienté développeur. Pas de définitions cartographiques grand public : ce document explique les abstractions techniques, les formats et les patterns utilisés dans la base de code.

**Voir aussi** : [ARCHITECTURE.md](ARCHITECTURE.md) · [CARTOGRAPHIE.md](CARTOGRAPHIE.md) · [MAP.md](MAP.md) · [DUCKDB.md](DUCKDB.md)

---

## A

**Apache Arrow**
Format de données en colonnes en mémoire (zero-copy). Dans Khartis, c'est le format pivot entre DuckDB (traitement SQL) et Deck.gl (rendu GPU). DuckDB retourne des `ArrowTable` (tables avec colonnes typées), `geoarrow-deck-stream` convertit ces tables en buffers binaires pour Deck.gl. La bibliothèque légère `@uwdata/flechette` est utilisée côté DuckDB WASM (pas `apache-arrow`) — leurs types ne sont pas interchangeables.

**Arrow IPC (Inter-Process Communication)**
Protocole de sérialisation Arrow pour transfert entre processus ou workers. DuckDB WASM retourne les résultats en Arrow IPC streams (tableaux d'`Uint8Array`). `insertArrowFromIPCStream()` ingère directement ces streams dans une autre instance DuckDB sans désérialisation.

---

## B

**basemap**
Fond de carte. Deux types dans Khartis : (1) fonds catalogue (GeoParquet prépréparés, 29 fonds), (2) fonds personnalisés (importés à l'exécution via DuckDB `ST_Read()`). Les fonds catalogue ne passent jamais par DuckDB à l'exécution — leur pipeline est GeoParquet → parquet-wasm → Arrow IPC → `geoarrow-deck-stream`.

**BreaksResult**
Type retourné par `calculateBreaks()` : `{ breaks: number[], counts: number[], min: number, max: number }`. `breaks` sont les seuils de discrétisation (N+1 valeurs pour N classes). `counts` est le nombre d'entités par classe. Jamais modifié directement — produit par les macros DuckDB.

---

## C

**CacheFirst**
Stratégie de cache Workbox : sert depuis le cache si disponible, sinon télécharge et met en cache. Utilisée pour toutes les ressources de Khartis (GeoParquet, WASM, tuiles) car tout le contenu est statique.

**createToolStore**
Factory utilitaire dans `commons/utils/store.utils.svelte.ts` pour les outils de la barre latérale (`step-toolbar`). Crée un store avec état `isActive`, méthodes `activate()` / `deactivate()`, et support de persistance optionnel.

---

## D

**DataFilterExtension**
Extension Deck.gl qui déporte le filtre de visibilité sur le GPU. Dans Khartis, utilisée pour le filtre temporel (années) : chaque point/polygone reçoit sa valeur d'année dans un `Float32Array` parallèle, et un `filterRange: [year, year]` masque les entités hors plage sans recréer la Arrow table.

**DatasetResult**
Contrat de l'interface de sortie du pipeline d'import. Contient `tableName`, `columns`, `rowCount`, `geometry`, `metadata`, `analysis`, `bounds`, `joinedBasemap`. Toute modification de ce type nécessite une mise à jour des tests dans `tests/pipeline/`.

**Duck** (façade)
API bas niveau de DuckDB WASM dans Khartis. Expose `query()`, `read_tabular()`, `read_geofile()`, `analyse()`, `invalidateTableCache()`, etc. Réservée au code de pipeline et d'orchestration — le code applicatif passe par `duckDBOrchestrator`.

**duckDBOrchestrator**
Point d'entrée unique pour toutes les opérations DuckDB depuis le code applicatif. Gère le cache WeakMap des Arrow tables, l'état réactif Svelte 5, et délègue aux sous-modules (`arrow-ops`, `join-ops`, `column-ops`, `filter-ops`).

---

## E

**EnrichedColumn**
Colonne d'un dataset enrichie avec les métadonnées DuckDB et le type sémiotique (`semioType`). Contient : `name`, `type` (ColumnType), `semioType`, `score`, `stats` (min, max, nullCount, uniqueCount).

---

## F

**featureId**
Index de la ligne Arrow d'origine assigné à chaque vertex lors du parsing par `geoarrow-deck-stream`. Stocké dans un `Uint32Array` parallèle au tableau de positions. Permet de retrouver l'entité source après projection ou découpage multipart. Sans ce mapping, un polygone multipart serait impossible à associer à sa ligne de données.

**Flechette** (`@uwdata/flechette`)
Bibliothèque Arrow légère retournée par DuckDB WASM. Ses types (`Table`, `Column`, `Batch`) diffèrent de `apache-arrow`. Les résultats de macros DuckDB (listes `LIST<DOUBLE>`) doivent être extraits via `toIterableValues()` — ne jamais tester `Array.isArray()` seul car une `Float64Array.subarray()` retournerait `false`.

---

## G

**GeoArrow**
Extension du format Apache Arrow pour les géométries. Les coordonnées sont stockées dans des `TypedArray` continus (un `Float64Array` par dimension X/Y), permettant un upload GPU direct sans parsing. Extension de colonne Arrow : `geoarrow.polygon`, `geoarrow.multipolygon`, `geoarrow.point`, etc.

**GeoParquet**
Format Apache Parquet avec une colonne géométrique encodée en GeoArrow ou WKB. Tous les fonds du catalogue Khartis sont en GeoParquet avec `GEOMETRY_ENCODING=GEOARROW`. DuckDB 1.3+ supporte nativement `read_parquet()` sur ces fichiers.

**geoarrow-deck-stream**
Bibliothèque qui parse les Arrow tables en buffers binaires Deck.gl (GeoArrow ou WKB → `BinaryPolygonData`, `BinaryPathData`, `BinaryPointData`). C'est elle qui crée les `featureIds`. Les 6 WeakMap de cache dans `geoarrow-stream-bridge.ts` mémoïsent ses résultats.

---

## I

**IndexedDB**
Base de données intégrée au navigateur. Khartis utilise 5 object stores : `projects` (snapshot metadata-only), `metadata` (liste + dernier projet), `project_assets` (métadonnées d'assets), `project_asset_chunks` (chunks binaires 8 Mo max), `project_asset_refs` (cycle de vie). Les données ne quittent jamais le navigateur.

---

## M

**modelMatrix**
Matrix4 Deck.gl qui centre et met à l'échelle les géométries projetées dans le viewport `OrthographicView` de Deck.gl. Recalculée par `projectionStore` via `get_model_matrix_from_bbox(bbox, canvasSize)` à chaque changement de bbox ou de taille de canvas. Les coordonnées projetées sont produites par `geoarrow-deck-stream` selon les dimensions passées à `buildProjectionForBasemap()`, qui correspondent au viewport réel.

**MultiShapeLayer**
Layer Deck.gl custom de Khartis pour les symboles non-circulaires ou catégoriels. Remplace `ScatterplotLayer` quand `CategoryShapeMode` est `DIFFERENT` ou `ORDERED`. Prend un attribut binaire `getShape` (index dans le cycle de formes).

---

## O

**ok-palette** (`@ateliercartographie/ok-palette`)
Bibliothèque de génération de palettes en espace perceptuellement uniforme Oklch. Toutes les rampes de couleurs de Khartis (séquentielles, divergentes, qualitatives) passent par `sequential()`, `divergentSequential()` ou `categorical()` puis `resolvePalette({ format: 'webgl' })`. Ne jamais générer de rampes manuellement.

**OrthographicView**
Vue Deck.gl en coordonnées pixel (pas géographiques). Utilisée pour les fonds catalogue en mode hors-OSM. Les couches reçoivent les géométries en coordonnées de projection via `geoarrow-deck-stream`, et la `modelMatrix` les recale dans le viewport.

---

## P

**Paraglide JS 2**
Système d'internationalisation compile-time. Chaque clé dans `messages/en.json` et `messages/fr.json` devient une fonction TypeScript typée dans `src/lib/paraglide/messages.js`. Zéro overhead runtime, tree-shaking automatique des messages inutilisés. Ne jamais éditer les fichiers générés dans `src/lib/paraglide/`.

**persistenceRegistry**
Registre dans lequel chaque store s'enregistre en fournissant des callbacks `serialize` et `deserialize`. Le sérialiseur de projet ne lit pas les stores un par un — il itère sur le registre et produit 4 blocs stables : `basemapSettings`, `visualizationSettings`, `layoutSettings`, `uiSettings`.

**proj4d3**
Fonction dans `map/utils/proj4d3.ts` qui crée un objet `GeoProjection` compatible d3-geo à partir d'une chaîne PROJ.4. Nécessaire car `geoarrow-deck-stream` attend une interface d3-geo, mais certaines projections (ex. `natearth2`) n'ont pas d'équivalent dans proj4.js — elles sont mappées manuellement vers des constructeurs d3-geo dans `D3_GEO_PROJECTION_MAP`.

**ProjectionLike**
Type de référence d'objet projection. Doit rester **stable** (même instance JavaScript) tant que l'utilisateur ne change pas de projection. Si une nouvelle instance est créée à chaque render, les caches WeakMap (`projSolidPolygonCache`, `projPathCache`, `projPointCache`) sont toujours vides.

---

## R

**Runes (Svelte 5)**
Primitives réactives de Svelte 5 : `$state` (état local), `$derived` (valeur calculée), `$effect` (effet de bord), `$props` (props d'un composant), `$bindable` (binding bidirectionnel). Remplacent complètement les stores `writable()` / `readable()`, les déclarations réactives `$:`, et `export let`. Ne pas mélanger les patterns Svelte 4 et Svelte 5.

---

## S

**SavePriority**
Enum de priorité de persistance : `DEBOUNCED` (5 s de délai, défaut) vs `IMMEDIATE` (bypass immédiat). Utilisé pour `persistenceRegistry.save(priority)`. Les opérations critiques (ajout de fichier, création de projet, export explicite) utilisent `IMMEDIATE`.

**SemioType**
Type sémiotique d'une colonne, calculé par `semio-detector.utils.ts`. 7 valeurs : `QTA` (quantitatif absolu), `QTR` (quantitatif ratio), `QL` (qualitatif), `QLO` (qualitatif ordonné), `geoid`, `geolat`, `geolon`. Guide les suggestions de visualisation et le choix de palette.

**SolidPolygonLayer**
Layer Deck.gl pour le rendu de polygones remplis. Utilisé pour les choroplèthes et les fonds de carte catalogue. Accepte des données binaires GeoArrow via `createSolidPolygonLayerProps(data)` de `geoarrow-deck-stream`.

---

## T

**toIterableValues**
Helper dans `commons/services/classification.service.ts` qui extrait un itérable depuis le résultat d'une macro DuckDB. Gère `Array`, `TypedArray` (dont `Float64Array.subarray()` qui n'est pas un `Array`), et tout objet exposant `Symbol.iterator`. Obligatoire pour extraire les `LIST<DOUBLE>` retournés par les macros de classification.

---

## V

**VisualizationConfig**
Objet de configuration d'une visualisation active. Contient `type` (VisualizationType), `mapping` (colonnes liées), `style`, `classification` (BreaksResult + méthode), et les objets primitives (`symbol`, `polygon`, `line`, `text`). Le dual-write (primitive + miroir legacy) est obligatoire — toujours passer par `visualizationStore.updatePrimitiveClassification()`.

---

## W

**WKB (Well-Known Binary)**
Format binaire interne de DuckDB Spatial (`ST_Read()`). DuckDB le retourne dans les Arrow tables comme une colonne `BLOB`. `geoarrow-deck-stream` le convertit en GeoArrow lors du parsing. WKB n'est jamais le format de rendu principal — GeoArrow est préféré quand les fonds le supportent.

**WeakMap (caches)**
Technique de mémoïsation où la clé est une référence JavaScript d'objet. Si la référence change (nouvelle Arrow table), le cache est implicitement invalidé. Khartis utilise 9 WeakMap : 6 dans `geoarrow-stream-bridge.ts` (conversion GeoArrow par projection) et 3 dans `arrow-filter.utils.ts` (filtres par table). Retourner la même référence d'Arrow table est la condition sine qua non pour que ~60 fps soit atteignable sur grandes géométries.

**Workbox**
Bibliothèque Google pour la gestion des service workers. Intégrée via `vite-plugin-pwa`. Configure les stratégies de cache (CacheFirst pour Khartis), les règles de précache, et le cycle de mise à jour.
