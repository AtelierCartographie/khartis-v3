# Guide développeur — Khartis v3

> Guide d'intégration pour les développeurs rejoignant le projet Khartis v3.

**Voir aussi** : [ARCHITECTURE.md](./ARCHITECTURE.md) — [PIPELINE_DONNEES.md](./PIPELINE_DONNEES.md) — [DUCKDB.md](./DUCKDB.md) — [MAP.md](./MAP.md) — [CARTOGRAPHIE.md](./CARTOGRAPHIE.md) — [GESTION_ETAT.md](./GESTION_ETAT.md) — [REFERENCE.md](./REFERENCE.md)

---

## L'écosystème géospatial — concepts fondamentaux

### Coordonnées géographiques et systèmes de référence

Une position sur Terre s'exprime avec deux valeurs : **longitude** (axe est-ouest, -180 à +180) et **latitude** (axe nord-sud, -90 à +90). La convention dans les APIs géo est `[lon, lat]` — longitude en premier.

```
Paris : lon = 2.35, lat = 48.86  →  [2.35, 48.86]
```

Le système de référence standard du web est **WGS 84 / EPSG:4326** : utilisé par le GPS, les fichiers GeoJSON et la quasi-totalité des données géographiques brutes. Dans les métadonnées des fonds de carte Khartis, `proj_source: "EPSG:4326"` indique que les coordonnées sources sont en degrés lon/lat WGS 84.

Un **code EPSG** est l'identifiant numérique d'un système de référence de coordonnées (par exemple EPSG:2154 = Lambert-93, système officiel français).

---

### Projections cartographiques

Une projection est une transformation mathématique `(lon, lat) → (x, y)` qui convertit les coordonnées sphériques en coordonnées planes. Chaque projection préserve certaines propriétés au détriment d'autres (surfaces, angles, distances).

```
Mercator         : lon/lat → x/y en mètres (déforme les surfaces aux pôles)
Robinson         : compromis surface/forme
Lambert-93       : optimisée pour la France (EPSG:2154)
Natural Earth 2  : esthétique, planisphères
```

Dans Khartis, les projections sont résolues par deux librairies :

- **d3-geo** — projections intégrées (Robinson, Natural Earth, Mercator, etc.), interface `GeoProjection`.
- **proj4.js** — projections exotiques via chaîne PROJ.4 (`"+proj=lcc +lat_1=49 +lon_0=3..."`).

**`proj4d3(proj4string)`** (`map/utils/proj4d3.ts`) crée un objet `GeoProjection` compatible d3-geo à partir d'une chaîne PROJ.4. Ce pont est nécessaire car `geoarrow-deck-stream` attend une interface d3-geo.

Les noms PROJ.4 sans équivalent dans proj4.js (par exemple `natearth2`) sont mappés manuellement vers des constructeurs d3-geo dans `D3_GEO_PROJECTION_MAP` (`geoarrow-stream-bridge.ts`).

---

### Formats d'encodage des géométries

**WKT (Well-Known Text)** — représentation texte normalisée (ISO/OGC) :

```
POINT(2.35 48.86)
LINESTRING(0 0, 1 1, 2 0)
POLYGON((0 0, 1 0, 1 1, 0 1, 0 0))
MULTIPOLYGON(...)
```

**WKB (Well-Known Binary)** — version binaire de WKT. Compact, opaque. Format interne de DuckDB spatial (`ST_Read()`, `ST_AsWKB()`). Non manipulé directement dans Khartis — DuckDB le convertit en GeoArrow lors de l'export Parquet.

**GeoJSON** — format JSON standard du web cartographique, avec objets Feature imbriqués. Simple à déboguer, coûteux en mémoire et lent à parser au-delà de quelques milliers d'entités. Utilisé dans Khartis pour les datasets GeoJSON importés par l'utilisateur.

**GeoArrow** — extension d'Apache Arrow pour les géométries. Les coordonnées sont stockées dans des `TypedArray` continus (un `Float64Array` par dimension) plutôt que dans des objets JS imbriqués. Ce format permet un upload GPU direct sans parsing côté CPU.

```
GeoJSON  : N features → N objets Feature JS → parsing JS, beaucoup d'allocations
GeoArrow : N features → Float64Array continu → un seul buffer, upload GPU direct
```

Tous les fonds de carte du catalogue Khartis sont au format **GeoParquet** (Parquet + colonne GeoArrow). L'extension Arrow de la colonne géométrique (`geoarrow.polygon`, `geoarrow.multipolygon`, etc.) est lue par `extractGeometryInfo()` depuis les métadonnées du schéma Arrow.

---

### Bounding box (bbox)

Une bbox est le rectangle englobant minimal d'une géométrie ou d'un dataset. Format standard GeoJSON : `[minLon, minLat, maxLon, maxLat]`.

```ts
// France métropolitaine
const bbox: [number, number, number, number] = [-5.14, 41.33, 9.56, 51.09];
//                                               minLon  minLat maxLon maxLat
```

Usages dans Khartis :

- **`useMapBounds`** — calcule la bbox depuis une Arrow table ou un GeoJSON et appelle `fitBounds()` pour centrer la vue.
- **`projectionStore`** — reçoit la bbox via `setReferenceBbox()` pour calculer la `modelMatrix` (viewport orthographique).
- **Sélection de projection** — la bbox du dataset est comparée aux emprises des projections du catalogue pour scorer leur adéquation.
- **`getMainlandBboxForBasemap()`** — extrait la bbox de la partie continentale d'un fond composite (France métropolitaine sans DOM-TOM) pour le centrage initial.

---

### Fond de carte (basemap)

Un fond de carte est un ensemble de géométries de référence (contours de pays, régions, communes) servant de support spatial aux données thématiques. Dans Khartis, **données et géométries sont séparées** :

```
Fond de carte = géométries (GeoParquet, colonne GeoArrow) + attributs (Parquet format long)
Données user  = CSV / Excel avec valeurs par entité

Jointure DuckDB : identifiant fond ↔ identifiant données → Arrow table combinée
```

Les **attributs** sont au format long (une ligne par variante d'identifiant : nom, code ISO, code INSEE...) pour permettre un matching flou insensible à la casse, aux accents et aux abréviations. Voir [FONDS_DE_CARTE.md](./FONDS_DE_CARTE.md) pour le détail du format.

**`basemapService`** (`map/services/basemap.service.svelte.ts`) orchestre le chargement :

1. `loadMetadata()` — lit `all-basemaps-metadata.json` (catalogue global).
2. `loadBasemap(id)` — fetch le GeoParquet principal du fond sélectionné, le parse en Arrow table et le met en cache.
3. `ensureCurrentLayersLoaded()` — charge à la demande les couches annexes visibles (limites, graticules, lignes géographiques).
4. `ensureAttributesLoaded()` — enregistre `all-basemaps-attributes.parquet` dans DuckDB uniquement quand une jointure en a besoin.

---

### WebGL

WebGL est une API de rendu graphique du navigateur qui donne accès au GPU via JavaScript. Les données sont uploadées une fois dans la mémoire GPU sous forme de buffers binaires (`Float32Array`, `Uint8Array`), puis des programmes GPU (shaders) les transforment en pixels à chaque frame — sans repasser par le CPU.

```
CPU                                    GPU
-------------------------------------  ------------------------------------
Float64Array positions  → upload  →    vertex shader    : [x,y] → pixel
Uint8Array colors       → upload  →    fragment shader  : couleur / pixel
                          draw()  →    60 fps, 100 000 polygones simultanés
```

Khartis cible **WebGL2** (`DECK_DEVICE_TYPE = 'webgl'`). Chaque instance Deck.gl et MapLibre crée son propre contexte WebGL2. Les navigateurs limitent les contextes actifs simultanément à 8–16 — contrainte directe sur le nombre de facettes utilisables.

---

### Deck.gl

Deck.gl est une librairie de visualisation de données géospatiales construite sur WebGL (et WebGPU). Elle fournit une abstraction de haut niveau : des `Layer` configurés via des props et des fonctions accesseurs, sans écrire de shaders directement.

```ts
new SolidPolygonLayer({
  id: 'countries', // ID stable — critique pour le diff interne Deck.gl
  data: binaryPolygonData, // BinaryPolygonData (Float64Array continu)
  getFillColor: [220, 220, 220, 255], // constante — pas d'accessor, pas d'updateTrigger
  pickable: true // active le hover/click GPU-side
});
```

Deck.gl compare les props par référence à chaque appel `setProps()`. Un ID stable évite le re-upload GPU complet. Un accesseur constant (`[r,g,b,a]`) est plus performant qu'une fonction car Deck.gl n'a pas besoin d'itérer les features.

**Deux modes d'intégration dans Khartis** (détail dans [MAP.md](./MAP.md)) :

- **`Deck` standalone** (`OrthographicView`) — mode par défaut, Deck.gl contrôle le rendu complet (fond de carte + données).
- **`MapboxOverlay`** (`@deck.gl/mapbox`) — mode OSM, Deck.gl s'intercale dans le pipeline WebGL de MapLibre.

`useMapInit` (`map/hooks/use-map-init.svelte.ts`) initialise l'un ou l'autre mode et expose `switchToOrthographicMode()` / `switchToMapLibreMode()` pour basculer dynamiquement.

---

### MapLibre GL

MapLibre GL est un moteur de rendu de cartes tuilées (fork open-source de Mapbox GL JS). Il gère le chargement et le rendu des **tuiles vectorielles** (OpenStreetMap, WMTS, etc.) avec WebGL.

Dans Khartis, MapLibre est utilisé **uniquement en mode OSM** pour afficher les fonds de carte tuilés. En mode orthographique (fond de carte du catalogue), MapLibre n'est pas instancié — Deck.gl gère l'intégralité du rendu.

`useMapBasemap` (`map/hooks/use-map-basemap.svelte.ts`) synchronise le style MapLibre, la couche raster OSM, la visibilité des étiquettes et la projection (`mercator` / `globe`). `map.setStyle()` est une opération coûteuse (teardown + rebuild complet) — un garde de déduplication par clé de style évite les appels redondants.

---

### Apache Arrow

Apache Arrow est un format de données columnar en mémoire : les valeurs d'une même colonne sont stockées dans un `TypedArray` contigu plutôt que dans des objets row-oriented.

```
Row-oriented (tableau d'objets)             Column-oriented (Arrow)
[                                           col "pays" : ["France", "Allemagne", "Italie"]
  { pays: "France",    pib: 2800 },         col "pib"  : Float64Array([2800, 4260, 2100])
  { pays: "Allemagne", pib: 4260 },
  { pays: "Italie",    pib: 2100 }
]
```

Arrow est le format pivot entre DuckDB (traitement SQL) et Deck.gl (rendu GPU). DuckDB retourne ses résultats en **Arrow IPC** (sérialisation binaire inter-process), désérialisée via `tableFromIPC()` d'`apache-arrow`.

---

### DuckDB WASM

DuckDB est un moteur SQL analytique OLAP compilé en WebAssembly, s'exécutant entièrement dans le navigateur. Il lit directement des fichiers Parquet, CSV, GeoJSON (via l'extension `spatial`) et retourne les résultats en Arrow IPC.

Dans Khartis, DuckDB est le **seul moteur de traitement de données** : imports, jointures, agrégations, calculs de seuils de classification — tout passe par SQL.

```
DuckDB("SELECT * FROM read_parquet('data.parquet')")  →  Arrow IPC bytes
tableFromIPC(bytes)                                   →  ArrowTable en mémoire
geoarrow-deck-stream (parsePolygonsToSolid)           →  BinaryPolygonData
Deck.gl SolidPolygonLayer                             →  upload GPU → rendu
```

**`duckDBOrchestrator`** (`duckdb/orchestrator/`) est la façade qui expose les opérations de haut niveau : `arrowOps` (lecture/écriture Arrow), `joinOps` (jointure fond / données), `columnOps`, `searchOps`, etc. Ne doit jamais être appelé avant `initialize()`.

**Macros SQL** (`duckdb/macros/`) — enregistrées une seule fois à l'initialisation :

- `normalize_text()` — normalisation pour le matching flou (accents, casse, ponctuation).
- `get_similarity()` — score Jaro-Winkler pour la jointure approximative.
- `kmeans()`, `quantile()`, `q6()`, `equi_width()`, `nested_means()`, `headtail2()` — méthodes de classification utilisées par l'interface.
- 8 macros de simplification (voir [DUCKDB.md](./DUCKDB.md)).

---

### `featureId` — lien vertex / données

Quand `geoarrow-deck-stream` parse une Arrow table en buffers binaires (`BinaryPolygonData`, `BinaryPathData`, `BinaryPointData`), chaque vertex reçoit un `featureId` — l'index de la ligne Arrow d'origine. Ce champ est un `Uint32Array` parallèle au tableau de positions.

```ts
// polyData.featureIds[i] = index ligne Arrow du vertex i
new SolidPolygonLayer({
  ...createSolidPolygonLayerProps(polyData),
  getFillColor: createPolygonFillColorAttribute(polyData, (featureId) => {
    const value = valueColumn.get(featureId); // accès O(1) dans Arrow
    return colorScale(value); // → [r, g, b, a]
  })
});
```

Sans `featureId`, il est impossible de retrouver à quelle entité appartient un vertex après projection ou découpage géométrique.

---

### `GeometryInfo` — détection du format Arrow

`extractGeometryInfo(table)` (`map/io/`) analyse les métadonnées du schéma Arrow pour identifier le format de la colonne géométrique :

```ts
interface GeometryInfo {
  type: string; // 'POLYGON', 'MULTIPOLYGON', 'POINT', 'LINESTRING'...
  encoding: string | null; // 'geoarrow.polygon', 'WKB', 'GEOJSON'...
  geoColumn: string; // nom de la colonne géométrique
  isNativeGeoArrow: boolean;
  isWkbEncoded: boolean;
  isGeoJsonEncoded: boolean;
}
```

Selon ces flags, `createDeckLayers()` choisit le parseur approprié (`parseSolidPolygons` pour GeoArrow natif, `arrowTableToGeoJSON` puis `createGeoJsonLayers` pour WKB/GeoJSON).

---

### `modelMatrix` — viewport orthographique

En mode orthographique, Deck.gl utilise une `OrthographicView` (coordonnées pixel, pas géographiques). Les géométries projetées par `geoarrow-deck-stream` sont en coordonnées de projection (par exemple `[0..960] × [0..600]` pour Natural Earth 2). La `modelMatrix` (Matrix4) appliquée à toutes les couches centre et met à l'échelle cette sortie dans le viewport Deck.gl.

`projectionStore` (`map/stores/projection.store.svelte.ts`) calcule cette matrice via `get_model_matrix_from_bbox(bbox, canvasSize)` à chaque changement de bbox de référence ou de taille de canvas. Elle est transmise à chaque couche via `LayerContext.modelMatrix`.

---

### Filtrage des données Arrow — deux niveaux

**`filterArrowTableByDataFilters(table, vizFilters, primitiveType)`** — filtre par les conditions de visualisation (`>=`, `<=`, `=`, `contains`, `between`, etc.) et par type de primitive (afficher uniquement les polygones, les lignes, etc.).

**`filterArrowTableByTableFilters(table, tableFilters)`** — filtre par la sélection de lignes de la data table. Ces filtres sont cumulables avec les premiers.

Ces deux opérations se font **côté JavaScript sur la Arrow table en mémoire** (pas via DuckDB SQL) pour éviter un aller-retour DuckDB à chaque interaction. Le `DataFilterExtension` de Deck.gl prend en charge un troisième niveau de filtrage côté GPU (filtre par année, voir [MAP.md](./MAP.md)).

---

## Prérequis et installation

- **Node.js ≥ 22**
- **pnpm** via Corepack (jamais npm)
- Git et un navigateur moderne (Chrome, Firefox, Safari, Edge)

```bash
corepack enable pnpm
git clone https://github.com/AtelierCartographie/khartis-v3.git
cd khartis-v3
cp .env.sample .env    # sample public, sans secrets
pnpm install           # télécharge aussi les extensions DuckDB
pnpm dev               # serveur de dev sur http://localhost:5176
```

Le `.env` local doit être en place avant de lancer le serveur. Le sample committé (`.env.sample`) reprend uniquement des valeurs non confidentielles. Par défaut, `BASE_PATH` pointe vers le chemin PPRD pour faciliter les tests de chemins déployés ; définissez `BASE_PATH=` dans votre `.env` pour servir l'application à la racine en local.

---

## Commandes essentielles

| Commande                      | Description                                         |
| ----------------------------- | --------------------------------------------------- |
| `pnpm dev`                    | Serveur de développement (port 5176)                |
| `pnpm build`                  | Build de production (adaptateur statique SvelteKit) |
| `pnpm check`                  | Vérification TypeScript + Svelte                    |
| `pnpm lint`                   | Prettier + ESLint                                   |
| `vitest run --project client` | Tests unitaires (composants, stores, utils)         |

> `pnpm test:unit` démarre le mode watch — utilisez `vitest run --project client` pour un passage unique en CI ou en agent. Ajoutez `--reporter=agent` pour minimiser la sortie.

---

## CI / CD

**GitHub Actions** (`.github/workflows/pr-validation.yml`) tourne sur chaque PR vers `staging` ou `main` :

- Lint + type check
- Tests pipeline + DuckDB (server-side, fiables en CI)
- Build de production

---

## Déploiement

Khartis est déployé manuellement sur un serveur FTP. Processus avant chaque déploiement :

```bash
# 1. S'assurer que la CI est verte (Quality Checks sur GitHub)

# 2. Valider l'UX manuellement dans un navigateur (import, viz, export)

# 3. Builder
pnpm build

# 4. Déployer build/ sur le FTP
```

Le dossier `build/` contient le site statique complet (HTML, JS, assets, fonds de carte).

---

## Règles d'or

1. **TypeScript strict** — jamais `any`, utiliser `unknown` et narrower.
2. **Svelte 5 Runes** — `$state`, `$derived`, `$effect`. Pas de `writable()`, `$:` ou `export let` (Svelte 4).
3. **Carbon Design System** pour toute l'UI — jamais de `<input>` ou `<button>` natifs.
4. **Carbon × Svelte 5** — `carbon-components-svelte@0.96.3` est en Svelte 4, plusieurs events dispatchent de façon parasite. Utiliser `on:input` (pas `on:change`) sur `<Slider>`, `on:change` (pas `on:check`) sur `<Checkbox>`, et une garde de valeur sur `<RadioButtonGroup on:change>`. Règles complètes dans [`.claude/rules/carbon-svelte5.md`](../.claude/rules/carbon-svelte5.md).
5. **Paraglide i18n** pour tout texte visible — `m.key()` depuis `$lib/paraglide/messages`.
6. **Logger** (`$lib/features/commons/utils/logger`) — jamais `console.log`.
7. **DuckDB-first** pour le traitement de données — `Duck.read_csv()`, `ST_Read()`, pas de parsers JS.
8. **Conventional Commits** — `feat:`, `fix:`, `refactor:`, `perf:`, `test:`, `docs:`, `chore:`.
9. **Fichiers Svelte en kebab-case** — `mon-composant.svelte`, jamais `MonComposant.svelte`.
10. **Pas de magic strings** — constantes, enums ou type literals.
11. **Client-only** — les données utilisateur ne quittent jamais le navigateur.

---

## Structure du projet

```
src/
├── routes/                    # SPA : layout unique + page unique
│   ├── +layout.svelte         # Init DuckDB, Carbon ARIA, zoom/pan
│   └── +page.svelte           # Charge la carte en lazy
└── lib/
    ├── features/              # Architecture par fonctionnalité
    ├── paraglide/             # Messages i18n générés (en, fr)
    └── types/                 # Types TypeScript partagés
```

### Les 10 features

| Feature               | Rôle                                                                                                                                           |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `commons/`            | Stores globaux, services partagés, composants Carbon, utilitaires                                                                              |
| `create-project/`     | Modale de création de projet (import, exemples, ouverture)                                                                                     |
| `data-pipeline/`      | Import de fichiers : parsers, validateurs, processeurs                                                                                         |
| `duckdb/`             | Moteur DuckDB WASM : singleton `Duck`, opérations, macros SQL                                                                                  |
| `header/`             | Barre de navigation supérieure (export, sauvegarde)                                                                                            |
| `main-toolbar/`       | Sidebar gauche : onglets Données, Visualisations, Style                                                                                        |
| `map/`                | Carte Deck.gl + MapLibre : hooks, layer factories, projections                                                                                 |
| `project-management/` | Persistance `.kh`, sérialisation metadata-only, asset store IndexedDB, import/export                                                           |
| `side-nav/`           | Menu latéral (langue, projets récents)                                                                                                         |
| `step-toolbar/`       | Panneau droit : 10 outils (search, layers, projections, legend, annotations, color-blindness, facets, format, geo-indications, simplification) |

### Structure type d'une feature

```
features/mon-outil/
├── mon-outil.store.svelte.ts   # Store avec $state réactif
├── mon-outil.svelte            # Composant d'entrée
├── mon-outil.types.ts          # Types publics
├── components/                 # Sous-composants
├── hooks/                      # Hooks Svelte (use-*.svelte.ts)
└── services/                   # Logique métier
```

---

## Patterns clés

### Pattern de store (`createToolStore`)

Les tool stores utilisent la factory `createToolStore` qui gère l'état réactif, les actions et la persistance automatique.

> **Note** : `facets` n'utilise pas `createToolStore` — il utilise un `$state` direct avec un pattern distinct (gestion de `generatedVisualizationIds` plus complexe).

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
  // Actions personnalisées (optionnel)
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

### Pattern de store global (`function` + `$state`)

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

1. Créer `src/lib/features/step-toolbar/tools/<nom-outil>/`.
2. Ajouter `<nom-outil>.store.svelte.ts` avec `createToolStore`.
3. Ajouter `<nom-outil>.svelte` (composants Carbon, texte i18n).
4. Ajouter `<nom-outil>.types.ts`.
5. Enregistrer dans la navigation du toolbar.
6. Ajouter les clés i18n dans `messages/en.json` et `messages/fr.json`.

### Ajout d'un processeur de pipeline

1. Ajouter le `FileType` dans `commons/store/create-project.types.ts`.
2. Ajouter l'extension dans `data-pipeline/constants.ts`.
3. Mettre à jour `detectFileFormat()` dans `core/format-detector.ts`.
4. Créer la stratégie dans `data-pipeline/processors/strategies/`.
5. Exporter depuis `processors/strategies/index.ts`.
6. Enregistrer dans `processors/register-processors.ts`.
7. Ajouter les tests unitaires co-localisés dans `src/lib/features/data-pipeline/`.

---

## URLs de développement

| Environnement | URL                   | Usage                                              |
| ------------- | --------------------- | -------------------------------------------------- |
| Dev           | http://localhost:5176 | Développement avec hot-reload                      |
| Preview       | http://localhost:4173 | Build de production (`pnpm build && pnpm preview`) |

---

## Flux de données

```
Fichier → validateFile() → DuckDB (read_csv / ST_Read)
  → DatasetResult → Config visualisation → Table Arrow
  → geoarrow-deck-stream (d3-geo) → Couches Deck.gl → GPU
```

---

## Tests

Deux projets Vitest cohabitent, isolés dans `vite.config.ts` :

| Projet   | Environnement | Emplacement                             | Script               |
| -------- | ------------- | --------------------------------------- | -------------------- |
| `client` | jsdom         | `src/**/*.svelte.test.ts` (co-localisé) | `pnpm test:unit`     |
| `server` | node          | `tests/pipeline/**`                     | `pnpm test:pipeline` |
| `server` | node          | `tests/duckdb/**`                       | `pnpm test:duckdb`   |

`pnpm test:all` enchaîne les trois.

| Convention         | Quand l'utiliser                                      |
| ------------------ | ----------------------------------------------------- |
| `*.svelte.test.ts` | Composants Svelte, stores runes (client, jsdom)       |
| `*.test.ts`        | Services purs, utilitaires, macros SQL (server, node) |

**Mocks serveur** : le fichier `vitest-setup-server.ts` mock globalement `@duckdb/duckdb-wasm` et `$lib/features/duckdb` pour empêcher le chargement du worker WASM en Node (fuite mémoire). Les tests qui ont besoin d'un vrai DuckDB utilisent `@duckdb/node-api` via `tests/pipeline/duckdb-node-helper`.

**Mocks client** : `vitest-setup-client.ts` mock `$lib/features/duckdb` et expose un stub pour `matchMedia`. Utilisez `vi.hoisted()` pour les mocks qui doivent exister avant import.

**Isolation** : le projet `server` utilise `pool: 'forks'` + `fileParallelism: false` — chaque fichier tourne dans un sous-processus Node court qui meurt en fin de fichier.

---

## Ressources complémentaires

| Besoin                  | Document                                     |
| ----------------------- | -------------------------------------------- |
| Architecture détaillée  | [ARCHITECTURE.md](./ARCHITECTURE.md)         |
| Pipeline de données     | [PIPELINE_DONNEES.md](./PIPELINE_DONNEES.md) |
| DuckDB WASM             | [DUCKDB.md](./DUCKDB.md)                     |
| Rendu carte             | [MAP.md](./MAP.md)                           |
| Fonds de carte          | [FONDS_DE_CARTE.md](./FONDS_DE_CARTE.md)     |
| Cartographie thématique | [CARTOGRAPHIE.md](./CARTOGRAPHIE.md)         |
| Visualisations / outils | [VISUALISATIONS.md](./VISUALISATIONS.md)     |
| Gestion d'état          | [GESTION_ETAT.md](./GESTION_ETAT.md)         |
| Référence des types     | [REFERENCE.md](./REFERENCE.md)               |
| PWA / hors-ligne        | [PWA.md](./PWA.md)                           |
