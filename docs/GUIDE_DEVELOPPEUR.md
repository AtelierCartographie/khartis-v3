# Guide Developpeur -- Khartis v3

> Guide d'integration pour les developpeurs rejoignant le projet Khartis v3.

## L'ecosysteme geospatial — concepts fondamentaux

---

### Coordonnees geographiques et systemes de reference

Une position sur Terre s'exprime avec deux valeurs : **longitude** (axe est-ouest, -180 a +180) et **latitude** (axe nord-sud, -90 a +90). La convention dans les APIs geo est `[lon, lat]` — longitude en premier.

```
Paris : lon=2.35, lat=48.86  ->  [2.35, 48.86]
```

Le systeme de reference standard du web est **WGS 84 / EPSG:4326** : utilise par le GPS, les fichiers GeoJSON et la quasi-totalite des donnees geographiques brutes. Dans les metadonnees des fonds de carte Khartis, `proj_source: "EPSG:4326"` indique que les coordonnees sources sont en degres lon/lat WGS 84.

Un **code EPSG** est l'identifiant numerique d'un systeme de reference de coordonnees (ex. EPSG:2154 = Lambert-93, systeme officiel francais).

---

### Projections cartographiques

Une projection est une transformation mathematique `(lon, lat) -> (x, y)` qui convertit les coordonnees spheriques en coordonnees planes. Chaque projection preserve certaines proprietes au detriment d'autres (surfaces, angles, distances).

```
Mercator    : lon/lat -> x/y en metres (deforme les surfaces aux poles)
Robinson    : compromis surface/forme
Lambert-93  : optimisee pour la France (EPSG:2154)
Natural Earth 2 : esthetique, planispheres
```

Dans Khartis, les projections sont resolues par deux librairies :

- **d3-geo** — projections integrees (Robinson, Natural Earth, Mercator, etc.), interface `GeoProjection`
- **proj4.js** — projections exotiques via chaine PROJ.4 (`"+proj=lcc +lat_1=49 +lon_0=3..."`)

**`proj4d3(proj4string)`** (`map/utils/proj4d3.ts`) cree un objet `GeoProjection` compatible d3-geo a partir d'une chaine PROJ.4. Ce pont est necessaire car `geoarrow-deck-stream` attend une interface d3-geo.

Les noms PROJ.4 sans equivalent dans proj4.js (ex. `natearth2`) sont mappes manuellement vers des constructeurs d3-geo dans `D3_GEO_PROJECTION_MAP` (`geoarrow-stream-bridge.ts`).

---

### Formats d'encodage des geometries

**WKT (Well-Known Text)** — representation texte normalisee (ISO/OGC) :

```
POINT(2.35 48.86)
LINESTRING(0 0, 1 1, 2 0)
POLYGON((0 0, 1 0, 1 1, 0 1, 0 0))
MULTIPOLYGON(...)
```

**WKB (Well-Known Binary)** — version binaire de WKT. Compact, opaque. Format interne de DuckDB spatial (`ST_Read()`, `ST_AsWKB()`). Non manipule directement dans Khartis — DuckDB le convertit en GeoArrow lors de l'export Parquet.

**GeoJSON** — format JSON standard du web cartographique, avec objets Feature imbriques. Simple a debogguer, couteux en memoire et lent a parser au-dela de quelques milliers d'entites. Utilise dans Khartis pour les datasets GeoJSON importes par l'utilisateur.

**GeoArrow** — extension d'Apache Arrow pour les geometries. Les coordonnees sont stockees dans des `TypedArray` continus (un `Float64Array` par dimension) plutot que dans des objets JS imbriques. Ce format permet un upload GPU direct sans parsing cote CPU.

```
GeoJSON  : N features -> N objets Feature JS -> parsing JS, beaucoup d'allocations
GeoArrow : N features -> Float64Array continu -> un seul buffer, upload GPU direct
```

Tous les fonds de carte du catalogue Khartis sont au format **GeoParquet** (Parquet + colonne GeoArrow). L'extension Arrow de la colonne geometrique (`geoarrow.polygon`, `geoarrow.multipolygon`, etc.) est lue par `extractGeometryInfo()` depuis les metadonnees du schema Arrow.

---

### Bounding box (bbox)

Une bbox est le rectangle englobant minimal d'une geometrie ou d'un dataset. Format standard GeoJSON : `[minLon, minLat, maxLon, maxLat]`.

```ts
// France metropolitaine
const bbox: [number, number, number, number] = [-5.14, 41.33, 9.56, 51.09];
//                                               minLon  minLat maxLon maxLat
```

Usages dans Khartis :

- **`useMapBounds`** — calcule la bbox depuis une Arrow table ou un GeoJSON et appelle `fitBounds()` pour centrer la vue
- **`projectionStore`** — recoit la bbox via `setReferenceBbox()` pour calculer la `modelMatrix` (viewport orthographique)
- **Selection de projection** — la bbox du dataset est comparee aux emprises des projections du catalogue pour scorer leur adequation
- **`getMainlandBboxForBasemap()`** — extrait la bbox de la partie continentale d'un fond composite (France metropolitaine sans DOM-TOM) pour le centrage initial

---

### Fond de carte (basemap)

Un fond de carte est un ensemble de geometries de reference (contours de pays, regions, communes) servant de support spatial aux donnees thematiques. Dans Khartis, **donnees et geometries sont separees** :

```
Fond de carte = geometries (GeoParquet, col GeoArrow) + attributs (Parquet format long)
Donnees user  = CSV / Excel avec valeurs par entite

Jointure DuckDB : identifiant fond <-> identifiant donnees -> Arrow table combinee
```

Les **attributs** sont au format long (une ligne par variante d'identifiant : nom, code ISO, code INSEE...) pour permettre un matching flou insensible a la casse, aux accents et aux abreviations. Voir `FONDS_DE_CARTE.md` pour le detail du format.

**`basemapService`** (`map/services/basemap.service.svelte.ts`) orchestre le chargement :

1. `loadMetadata()` — lit `all-basemaps-metadata.json` (catalogue global)
2. `loadAttributesIntoDuckDB()` — enregistre `all-basemaps-attributes.parquet` dans DuckDB
3. `loadBasemap(id)` — fetch les fichiers GeoParquet du fond selectionne, les parse en Arrow tables et les met en cache

---

### WebGL

WebGL est une API de rendu graphique du navigateur qui donne acces au GPU via JavaScript. Les donnees sont uploadees une fois dans la memoire GPU sous forme de buffers binaires (`Float32Array`, `Uint8Array`), puis des programmes GPU (shaders) les transforment en pixels a chaque frame — sans repasser par le CPU.

```
CPU                                    GPU
-------------------------------------  ------------------------------------
Float64Array positions  -> upload  ->  vertex shader  : [x,y] -> pixel
Uint8Array colors       -> upload  ->  fragment shader : couleur / pixel
                           draw()  ->  60 fps, 100k polygones simultanes
```

Khartis cible **WebGL2** (`DECK_DEVICE_TYPE = 'webgl'`). Chaque instance Deck.gl et MapLibre cree son propre contexte WebGL2. Les navigateurs limitent les contextes actifs simultanement a 8-16 — contrainte directe sur le nombre de facettes utilisables.

---

### Deck.gl

Deck.gl est une librairie de visualisation de donnees geospatiales construite sur WebGL (et WebGPU). Elle fournit une abstraction de haut niveau : des `Layer` configures via des props et des fonctions accessors, sans ecrire de shaders directement.

```ts
new SolidPolygonLayer({
  id: 'countries', // ID stable — critique pour le diff interne Deck.gl
  data: binaryPolygonData, // BinaryPolygonData (Float64Array continu)
  getFillColor: [220, 220, 220, 255], // constante — pas d'accessor, pas d'updateTrigger
  pickable: true // active le hover/click GPU-side
});
```

Deck.gl compare les props par reference a chaque appel `setProps()`. Un ID stable evite le re-upload GPU complet. Un accesseur constant (`[r,g,b,a]`) est plus performant qu'une fonction car Deck.gl n'a pas besoin d'iterer les features.

**Deux modes d'integration dans Khartis** (detail dans `MAP.md`) :

- **`Deck` standalone** (`OrthographicView`) — mode par defaut, Deck.gl controle le rendu complet (fond de carte + donnees)
- **`MapboxOverlay`** (`@deck.gl/mapbox`) — mode OSM, Deck.gl s'intercale dans le pipeline WebGL de MapLibre

`useMapInit` (`map/hooks/use-map-init.svelte.ts`) initialise l'un ou l'autre mode et expose `switchToOrthographicMode()` / `switchToMapLibreMode()` pour basculer dynamiquement.

---

### MapLibre GL

MapLibre GL est un moteur de rendu de cartes tuilees (fork open-source de Mapbox GL JS). Il gere le chargement et le rendu des **tuiles vectorielles** (OpenStreetMap, WMTS, etc.) avec WebGL.

Dans Khartis, MapLibre est utilise **uniquement en mode OSM** pour afficher les fonds de carte tuiles. En mode orthographique (fond de carte du catalogue), MapLibre n'est pas instancie — Deck.gl gere l'integralite du rendu.

`useMapBasemap` (`map/hooks/use-map-basemap.svelte.ts`) synchronise le style MapLibre, la couche raster OSM, la visibilite des etiquettes et la projection (`mercator` / `globe`). `map.setStyle()` est une operation couteuse (teardown + rebuild complet) — un guard de deduplication par cle de style evite les appels redondants.

---

### Apache Arrow

Apache Arrow est un format de donnees columnar en memoire : les valeurs d'une meme colonne sont stockees dans un `TypedArray` contigu plutot que dans des objets row-oriented.

```
Row-oriented (tableau d'objets)       Column-oriented (Arrow)
[                                     col "pays" : ["France", "Allemagne", "Italie"]
  { pays:"France",    pib:2800 },     col "pib"  : Float64Array([2800, 4260, 2100])
  { pays:"Allemagne", pib:4260 },
  { pays:"Italie",    pib:2100 }
]
```

Arrow est le format pivot entre DuckDB (traitement SQL) et Deck.gl (rendu GPU). DuckDB retourne ses resultats en **Arrow IPC** (serialisation binaire inter-process), deserialise via `tableFromIPC()` d'`apache-arrow`.

---

### DuckDB WASM

DuckDB est un moteur SQL analytique OLAP compile en WebAssembly, s'executant entierement dans le navigateur. Il lit directement des fichiers Parquet, CSV, GeoJSON (via l'extension `spatial`) et retourne les resultats en Arrow IPC.

Dans Khartis, DuckDB est le **seul moteur de traitement de donnees** : imports, jointures, agregations, calculs de seuils de classification — tout passe par SQL.

```
DuckDB("SELECT * FROM read_parquet('data.parquet')")  ->  Arrow IPC bytes
tableFromIPC(bytes)                                   ->  ArrowTable en memoire
geoarrow-deck-stream (parsePolygonsToSolid)           ->  BinaryPolygonData
Deck.gl SolidPolygonLayer                             ->  upload GPU -> rendu
```

**`duckDBOrchestrator`** (`duckdb/orchestrator/`) est la facade qui expose les operations de haut niveau : `arrowOps` (lecture/ecriture Arrow), `joinOps` (jointure fond / donnees), `columnOps`, `searchOps`, etc. Ne doit jamais etre appele avant `initialize()`.

**Macros SQL** (`duckdb/macros/`) — enregistrees une seule fois a l'initialisation :

- `normalize_text()` — normalisation pour le matching flou (accents, casse, ponctuation)
- `get_similarity()` — score Jaro-Winkler pour la jointure approximative
- `quantile()`, `q6()`, `equi_width()`, `nested_means()` — methodes de classification

---

### `featureId` — lien vertex / donnees

Quand `geoarrow-deck-stream` parse une Arrow table en buffers binaires (`BinaryPolygonData`, `BinaryPathData`, `BinaryPointData`), chaque vertex recoit un `featureId` — l'index de la ligne Arrow d'origine. Ce champ est un `Uint32Array` parallele au tableau de positions.

```ts
// polyData.featureIds[i] = index ligne Arrow du vertex i
new SolidPolygonLayer({
  ...createSolidPolygonLayerProps(polyData),
  getFillColor: createPolygonFillColorAttribute(polyData, (featureId) => {
    const value = valueColumn.get(featureId); // acces O(1) dans Arrow
    return colorScale(value); // -> [r, g, b, a]
  })
});
```

Sans `featureId`, il est impossible de retrouver a quelle entite appartient un vertex apres projection ou decoupage geometrique.

---

### `GeometryInfo` — detection du format Arrow

`extractGeometryInfo(table)` (`map/io/`) analyse les metadonnees du schema Arrow pour identifier le format de la colonne geometrique :

```ts
interface GeometryInfo {
  type: string; // 'POLYGON', 'MULTIPOLYGON', 'POINT', 'LINESTRING'...
  encoding: string | null; // 'geoarrow.polygon', 'WKB', 'GEOJSON'...
  geoColumn: string; // nom de la colonne geometrique
  isNativeGeoArrow: boolean;
  isWkbEncoded: boolean;
  isGeoJsonEncoded: boolean;
}
```

Selon ces flags, `createDeckLayers()` choisit le parser approprie (`parseSolidPolygons` pour GeoArrow natif, `arrowTableToGeoJSON` puis `createGeoJsonLayers` pour WKB/GeoJSON).

---

### `modelMatrix` — viewport orthographique

En mode orthographique, Deck.gl utilise une `OrthographicView` (coordonnees pixel, pas geographiques). Les geometries projetees par `geoarrow-deck-stream` sont en coordonnees de projection (ex. `[0..960] x [0..600]` pour Natural Earth 2). La `modelMatrix` (Matrix4) appliquee a toutes les couches centre et met a l'echelle cette sortie dans le viewport Deck.gl.

`projectionStore` (`map/stores/projection.store.svelte.ts`) calcule cette matrice via `get_model_matrix_from_bbox(bbox, canvasSize)` a chaque changement de bbox de reference ou de taille de canvas. Elle est transmise a chaque couche via `LayerContext.modelMatrix`.

---

### Filtrage des donnees Arrow — deux niveaux

**`filterArrowTableByDataFilters(table, vizFilters, primitiveType)`** — filtre par les conditions de visualisation (`>=`, `<=`, `=`, `contains`, `between`, etc.) et par type de primitive (afficher uniquement les polygones, les lignes, etc.).

**`filterArrowTableByTableFilters(table, tableFilters)`** — filtre par la selection de lignes de la data table. Ces filtres sont cumulables avec les premiers.

Ces deux operations se font **cote JavaScript sur la Arrow table en memoire** (pas via DuckDB SQL) pour eviter un aller-retour DuckDB a chaque interaction. Le `DataFilterExtension` de Deck.gl prend en charge un troisieme niveau de filtrage cote GPU (filtre par annee, voir `MAP.md`).

---

## Prerequisites et installation

- **Node.js >= 22**
- **pnpm** via Corepack (jamais npm)
- Git et un navigateur moderne (Chrome, Firefox, Safari, Edge)

```bash
corepack enable pnpm
git clone https://github.com/AtelierCartographie/khartis-v3.git
cd khartis-v3
pnpm install          # telecharge aussi les extensions DuckDB
pnpm dev              # serveur de dev sur http://localhost:5176
```

## Commandes essentielles

| Commande             | Description                                                |
| -------------------- | ---------------------------------------------------------- |
| `pnpm dev`           | Serveur de developpement (port 5176)                       |
| `pnpm build`         | Build de production (adaptateur statique SvelteKit)        |
| `pnpm check`         | Verification TypeScript + Svelte                           |
| `pnpm lint`          | Prettier + ESLint                                          |
| `pnpm test`          | Suite serveur CI (pipeline + DuckDB)                       |
| `pnpm test:unit`     | Tests unitaires Vitest                                     |
| `pnpm test:e2e`      | Tests end-to-end Playwright (local uniquement)             |
| `pnpm test:pipeline` | Tests d'integration DuckDB (ingestion de tous les formats) |
| `pnpm test:duckdb`   | Tests DuckDB server-side                                   |

## CI / CD

**GitHub Actions** (`.github/workflows/pr-validation.yml`) tourne sur chaque PR vers `staging` ou `main` :

- Lint + type check
- Tests pipeline + DuckDB (server-side, fiables en CI)
- Build de production

Les tests E2E ne tournent **pas** en CI -- voir la section Deploiement.

## Deploiement

Khartis est deploye manuellement sur un serveur FTP. Processus avant chaque deploiement :

```bash
# 1. S'assurer que la CI est verte (Quality Checks sur GitHub)

# 2. Valider l'UX dans un vrai navigateur
pnpm test:e2e

# 3. Builder
pnpm build

# 4. Deployer build/ sur le FTP
```

Le dossier `build/` contient le site statique complet (HTML, JS, assets, fonds de carte).

## Regles d'or

1. **TypeScript strict** -- jamais `any`, utiliser `unknown` et narrower
2. **Svelte 5 Runes** -- `$state`, `$derived`, `$effect`. Pas de `writable()`, `$:` ou `export let` (Svelte 4)
3. **Carbon Design System** pour tout le UI -- jamais de `<input>` ou `<button>` natifs
4. **Paraglide i18n** pour tout texte visible -- `m.key()` depuis `$lib/paraglide/messages`
5. **Logger** (`$lib/features/commons/utils/logger`) -- jamais `console.log`
6. **DuckDB-first** pour le traitement de donnees -- `Duck.read_csv()`, `ST_Read()`, pas de parsers JS
7. **Conventional Commits** -- `feat:`, `fix:`, `refactor:`, `perf:`, `test:`, `docs:`, `chore:`
8. **Fichiers Svelte en kebab-case** -- `mon-composant.svelte`, jamais `MonComposant.svelte`
9. **Pas de magic strings** -- constantes, enums ou type literals
10. **Client-only** -- les donnees utilisateur ne quittent jamais le navigateur

## Structure du projet

```
src/
  routes/                    # SPA : layout unique + page unique
    +layout.svelte           # Init DuckDB, Carbon ARIA, zoom/pan
    +page.svelte             # Charge la carte en lazy
  lib/
    features/                # Architecture par fonctionnalite
    paraglide/               # Messages i18n generes (en, fr)
    types/                   # Types TypeScript partages
```

### Les 10 features

| Feature               | Role                                                                                                                                           |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `commons/`            | Stores globaux, services partages, composants Carbon, utilitaires                                                                              |
| `create-project/`     | Modale de creation de projet (import, exemples, ouverture)                                                                                     |
| `data-pipeline/`      | Import de fichiers : parsers, validateurs, processeurs                                                                                         |
| `duckdb/`             | Moteur DuckDB WASM : singleton `Duck`, operations, macros SQL                                                                                  |
| `header/`             | Barre de navigation superieure (export, sauvegarde)                                                                                            |
| `main-toolbar/`       | Sidebar gauche : onglets Donnees, Visualisations, Style                                                                                        |
| `map/`                | Carte Deck.gl + MapLibre : hooks, layer factories, projections                                                                                 |
| `project-management/` | Persistance `.kh`, serialisation, IndexedDB                                                                                                    |
| `side-nav.svelte`     | Menu lateral (langue, projets recents) -- fichier unique, pas une feature directory                                                            |
| `step-toolbar/`       | Panneau droit : 10 outils (search, layers, projections, legend, annotations, color-blindness, facets, format, geo-indications, simplification) |

### Structure type d'une feature

```
features/mon-outil/
  mon-outil.store.svelte.ts   # Store avec $state reactif
  mon-outil.svelte             # Composant d'entree
  mon-outil.types.ts           # Types publics
  components/                  # Sous-composants
  hooks/                       # Hooks Svelte (use-*.svelte.ts)
  services/                    # Logique metier
```

## Patterns cles

### Pattern de store (createToolStore)

Les tool stores utilisent la factory `createToolStore` qui gere l'etat reactif, les actions et la persistance automatique. **Note** : `facets` n'utilise pas `createToolStore` -- il utilise un `$state` direct avec un pattern distinct (gestion de `generatedVisualizationIds` plus complexe).

```typescript
// mon-outil.store.svelte.ts
import { createToolStore } from '$lib/features/commons/utils/store.utils.svelte';
import type { MonOutilState } from './mon-outil.types';

const DEFAULT_STATE: MonOutilState = {
  visible: true,
  items: [],
  selectedId: null
};

const { state, actions, getState } = createToolStore<MonOutilState>(
  DEFAULT_STATE,
  // Actions personnalisees (optionnel)
  (state, base) => ({
    addItem(item: Item) {
      state.items.push(item);
    },
    selectItem(id: string) {
      state.selectedId = id;
    }
  }),
  // Persistance automatique (optionnel)
  { key: 'mon-outil' }
);

export {
  state as monOutilState,
  actions as monOutilActions,
  getState as getMonOutilState
};
```

### Pattern de store global (function + $state)

Les stores globaux utilisent le pattern fonction avec getters :

```typescript
// feature.store.svelte.ts
function createFeatureStore() {
  const state = $state({ count: 0, items: [] as string[] });

  return {
    get count() {
      return state.count;
    },
    get items() {
      return state.items;
    },
    increment() {
      state.count += 1;
    },
    addItem(item: string) {
      state.items.push(item);
    }
  };
}

export const featureStore = createFeatureStore();
```

### Ajout d'un outil dans la step-toolbar

1. Creer `src/lib/features/step-toolbar/tools/<nom-outil>/`
2. Ajouter `<nom-outil>.store.svelte.ts` avec `createToolStore`
3. Ajouter `<nom-outil>.svelte` (composants Carbon, texte i18n)
4. Ajouter `<nom-outil>.types.ts`
5. Enregistrer dans la navigation du toolbar
6. Ajouter les cles i18n dans `messages/en.json` et `messages/fr.json`

### Ajout d'un processeur de pipeline

1. Ajouter le `FileType` dans `commons/store/create-project.types.ts`
2. Ajouter l'extension dans `data-pipeline/constants.ts`
3. Mettre a jour `detectFileFormat()` dans `core/format-detector.ts`
4. Creer la strategie dans `data-pipeline/processors/strategies/`
5. Exporter depuis `processors/strategies/index.ts`
6. Enregistrer dans `processors/register-processors.ts`
7. Ajouter des fichiers de test dans `tests-datasets/<format>/`
8. Ajouter les cas de test dans `pipeline-integration.test.ts`

## URLs de developpement

| Environnement | URL                   | Usage                                              |
| ------------- | --------------------- | -------------------------------------------------- |
| Dev           | http://localhost:5176 | Developpement avec hot-reload                      |
| Preview       | http://localhost:4173 | Build de production (`pnpm build && pnpm preview`) |

## Flux de donnees

```
Fichier -> validateFile() -> DuckDB (read_csv / ST_Read)
  -> DatasetResult -> Config visualisation -> Table Arrow
  -> geoarrow-deck-stream (d3-geo) -> Couches Deck.gl -> GPU
```

## Ressources complementaires

| Besoin                 | Document                                   |
| ---------------------- | ------------------------------------------ |
| Architecture detaillee | [ARCHITECTURE.md](ARCHITECTURE.md)         |
| Pipeline (reference)   | [PIPELINE.md](PIPELINE.md)                 |
| Pipeline de donnees    | [PIPELINE_DONNEES.md](PIPELINE_DONNEES.md) |
| DuckDB WASM            | [DUCKDB.md](DUCKDB.md)                     |
| Rendu map              | [MAP.md](MAP.md)                           |
| Cartographie           | [CARTOGRAPHIE.md](CARTOGRAPHIE.md)         |
| Gestion d'etat         | [GESTION_ETAT.md](GESTION_ETAT.md)         |
| Reference des types    | [REFERENCE.md](REFERENCE.md)               |
| Strategie de tests     | [TESTS.md](TESTS.md)                       |
