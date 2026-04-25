# Guide développeur — Khartis v3

> Guide d'intégration pour les développeurs rejoignant le projet Khartis v3.

**Voir aussi** : [ARCHITECTURE.md](./ARCHITECTURE.md) — [PIPELINE_DONNEES.md](./PIPELINE_DONNEES.md) — [DUCKDB.md](./DUCKDB.md) — [MAP.md](./MAP.md) — [CARTOGRAPHIE.md](./CARTOGRAPHIE.md) — [GESTION_ETAT.md](./GESTION_ETAT.md) — [REFERENCE.md](./REFERENCE.md)

---

## Concepts géospatiaux spécifiques à Khartis

> Pour les définitions générales (projection, bbox, WKT, GeoJSON, etc.), voir le [Glossaire](GLOSSAIRE.md). Ce qui suit concentre les mécanismes propres au projet.

---

### Projections dans Khartis

Deux bibliothèques résolvent les projections :

- **d3-geo** — projections intégrées (Robinson, Natural Earth, Mercator, etc.), interface `GeoProjection`.
- **proj4.js** — projections exotiques via chaîne PROJ.4.

**`proj4d3(proj4string)`** (`map/utils/proj4d3.ts`) crée un objet `GeoProjection` compatible d3-geo à partir d'une chaîne PROJ.4. Ce pont est nécessaire car `geoarrow-deck-stream` attend une interface d3-geo.

Les noms PROJ.4 sans équivalent dans proj4.js (par exemple `natearth2`) sont mappés manuellement vers des constructeurs d3-geo dans `D3_GEO_PROJECTION_MAP` (`geoarrow-stream-bridge.ts`).

---

### Formats de géométrie

**GeoArrow** est le format pivot : coordonnées stockées dans des `TypedArray` continus (un `Float64Array` par dimension), permettant un upload GPU direct sans parsing côté CPU. Tous les fonds du catalogue sont au format **GeoParquet** (Parquet + colonne GeoArrow).

**WKB** est le format interne de DuckDB spatial (`ST_Read()`). DuckDB le convertit automatiquement en GeoArrow lors de l'export.

L'extension Arrow de la colonne géométrique (`geoarrow.polygon`, `geoarrow.multipolygon`, etc.) est lue par `extractGeometryInfo()` depuis les métadonnées du schéma Arrow pour choisir le parseur approprié.

---

### `featureId` — lien vertex / données

Quand `geoarrow-deck-stream` parse une Arrow table en buffers binaires, chaque vertex reçoit un `featureId` — l'index de la ligne Arrow d'origine. Ce champ est un `Uint32Array` parallèle au tableau de positions.

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

### `modelMatrix` — viewport orthographique

En mode orthographique, Deck.gl utilise une `OrthographicView` (coordonnées pixel). Les géométries projetées par `geoarrow-deck-stream` sont en coordonnées de projection (par exemple `[0..960] × [0..600]`). La `modelMatrix` (Matrix4) centre et met à l'échelle cette sortie dans le viewport Deck.gl.

`projectionStore` (`map/stores/projection.store.svelte.ts`) calcule cette matrice via `get_model_matrix_from_bbox(bbox, canvasSize)` à chaque changement de bbox ou de taille de canvas.

---

### Filtrage des données Arrow — deux niveaux

**`filterArrowTableByDataFilters(table, vizFilters, primitiveType)`** — filtre par les conditions de visualisation (`>=`, `<=`, `=`, `contains`, `between`, etc.) et par type de primitive.

**`filterArrowTableByTableFilters(table, tableFilters)`** — filtre par la sélection de lignes de la data table. Cumulable avec le premier.

Ces deux opérations se font **côté JavaScript sur la Arrow table en mémoire** (pas via DuckDB SQL) pour éviter un aller-retour à chaque interaction. Le `DataFilterExtension` de Deck.gl gère un troisième niveau côté GPU (voir [MAP.md](./MAP.md)).

---

### Fond de carte (basemap)

Dans Khartis, **données et géométries sont séparées** :

```
Fond de carte = géométries (GeoParquet, colonne GeoArrow) + attributs (Parquet format long)
Données user  = CSV avec valeurs par entité

Jointure DuckDB : identifiant fond ↔ identifiant données → Arrow table combinée
```

**`basemapService`** (`map/services/basemap.service.svelte.ts`) orchestre le chargement :

1. `loadMetadata()` — lit `all-basemaps-metadata.json`.
2. `loadBasemap(id)` — fetch le GeoParquet principal, parse en Arrow table et met en cache.
3. `ensureCurrentLayersLoaded()` — charge à la demande les couches annexes visibles.
4. `ensureAttributesLoaded()` — enregistre `all-basemaps-attributes.parquet` dans DuckDB uniquement quand une jointure en a besoin.

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
pnpm dev               # serveur de dev sur http://localhost:5176/cartographie/khartisnewpprd/
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

| Environnement | URL                                                | Usage                                              |
| ------------- | -------------------------------------------------- | -------------------------------------------------- |
| Dev           | http://localhost:5176/cartographie/khartisnewpprd/ | Développement avec hot-reload                      |
| Preview       | http://localhost:4173                              | Build de production (`pnpm build && pnpm preview`) |

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
