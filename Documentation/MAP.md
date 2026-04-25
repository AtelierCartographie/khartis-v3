# Rendu carte

> Architecture duale MapLibre / Deck.gl : pipeline de rendu, caches WeakMap, projections et couches.

**Voir aussi** : [ARCHITECTURE.md](ARCHITECTURE.md) · [DUCKDB.md](DUCKDB.md) · [CARTOGRAPHIE.md](CARTOGRAPHIE.md) · [FONDS_DE_CARTE.md](FONDS_DE_CARTE.md)

---

## Deux modes de rendu

| Mode                     | Moteur                                  | Projection                       | Usage                                                |
| ------------------------ | --------------------------------------- | -------------------------------- | ---------------------------------------------------- |
| **Orthographique**       | Deck.gl standalone (`OrthographicView`) | d3-geo via geoarrow-deck-stream  | Fonds de carte du catalogue, projections thématiques |
| **MapLibre interleaved** | `MapboxOverlay({ interleaved: true })`  | Web Mercator ou Globe (MapLibre) | Fond OSM en tuiles vectorielles                      |

Le mode actif dépend du fond de carte sélectionné. Passer d'un mode à l'autre reconstruit l'overlay et les couches Deck.gl.

---

## Pipeline de rendu

```
DuckDB (Arrow table)
    └─ getArrowTable()             ← cache WeakMap (même référence si unchanged)
        └─ filterArrowTableByDataFilters()     ← filtres de visualisation (JS)
            └─ filterArrowTableByTableFilters() ← sélection de lignes (JS)
                └─ createDeckLayers(table, ctx)
                    ├─ ctx.yearFilter → DataFilterExtension (GPU-side)
                    └─ MapboxOverlay.setProps({ layers })  → GPU
```

Les deux niveaux de filtre JavaScript se font sur la Arrow table en mémoire pour éviter un aller-retour DuckDB à chaque interaction. Le `DataFilterExtension` gère un troisième niveau directement sur le GPU pour le filtre temporel (années).

---

## Caches WeakMap

Les caches utilisent les **références** JavaScript comme clés. Une même Arrow table retourne toujours le même buffer GeoArrow si elle n'a pas changé. C'est ce qui permet ~60 fps même sur de grandes géométries.

### `geoarrow-stream-bridge.ts` — 8 caches de conversion binaire

```typescript
// Parsing identité (lon/lat pur, mode MapLibre)
const solidPolygonCache = new WeakMap<ArrowTable, BinaryPolygonData>();
const pathCache = new WeakMap<ArrowTable, BinaryPathData>();
const pointCache = new WeakMap<ArrowTable, BinaryPointData>();

// Parsing avec projection (clé composée : table → ProjectionLike → résultat)
const projSolidPolygonCache = new WeakMap<
  ArrowTable,
  Map<ProjectionLike, BinaryPolygonData>
>();
const projPathCache = new WeakMap<
  ArrowTable,
  Map<ProjectionLike, BinaryPathData>
>();
const projPointCache = new WeakMap<
  ArrowTable,
  Map<ProjectionLike, BinaryPointData>
>();

// Normalisation du nom de colonne géométrique (DuckDB "geom" → "geometry")
const normalizedTableCache = new WeakMap<ArrowTable, ArrowTable>();

// Bbox projetée par fond (clé composite : metadata + dimensions + bbox source)
const projectedBboxCache = new WeakMap<BasemapMetadata, Map<string, BBox>>();
```

### `arrow-filter.utils.ts` — 3 caches de filtre

```typescript
const yearFilterCache = new WeakMap<ArrowTable, Map<string, ArrowTable>>();
const dataFilterCache = new WeakMap<ArrowTable, Map<string, ArrowTable>>();
const tableFilterCache = new WeakMap<ArrowTable, Map<string, ArrowTable>>();
```

Clé de cache pour `dataFilterCache` / `tableFilterCache` : `column:op:value|...` (triée, indépendante de l'ordre). Les fonctions de filtre retournent la **même référence** si les filtres n'ont pas changé.

### Autres caches

- `layer-factory.ts` → `geoJsonConversionCache` (Arrow → GeoJSON fallback) + `textLabelCache` (labels centroids).
- `bounds.ts` → `boundsCache` (calcul des bounds par Arrow table).

---

## Mémoïsation des projections

La référence `ProjectionLike` doit rester **stable** tant que l'utilisateur ne change pas de fond ou de projection. Si un nouvel objet est créé à chaque render, les caches `projSolidPolygonCache` et consorts sont toujours vides (WeakMap cherche la même référence).

`use-map-layers.svelte.ts` utilise un `basemapProjectionCache` (WeakMap clé `BasemapMetadata` → projection) avec une clé secondaire qui inclut les dimensions du viewport, les paddings et la bbox source. La projection est rebuilt uniquement si l'un de ces paramètres change.

```typescript
// schéma simplifié
const cached = basemapProjectionCache.get(currentMetadata)?.get(cacheKey);
if (cached) return cached;
const projection = buildProjectionForBasemap(currentMetadata, width, height);
// stockage et réutilisation pour tous les appels de ce cycle
```

Les dimensions passées à `buildProjectionForBasemap()` proviennent du viewport réel, pas de constantes hardcodées — la projection est recalculée si le canvas change de taille.

**Priorité de projection** : un choix explicite de l'utilisateur dans l'outil Projection prend le dessus sur la projection par défaut du fond de carte, pour les couches du fond comme pour les couches thématiques. Ce changement doit invalider le cycle de refresh des layers même si la famille de projection (mercator / globe) ne change pas.

---

## Layer factory

`createDeckLayers(table, ctx)` dispatche par type de géométrie :

| Géométrie                        | Fonction                | Layer Deck.gl principal                     |
| -------------------------------- | ----------------------- | ------------------------------------------- |
| `POINT` / `MULTIPOINT`           | `createPointLayers()`   | `ScatterplotLayer` ou `MultiShapeLayer`     |
| `LINESTRING` / `MULTILINESTRING` | `createLineLayers()`    | `PathLayer`                                 |
| `POLYGON` / `MULTIPOLYGON`       | `createPolygonLayers()` | `SolidPolygonLayer` + `PathLayer` (contour) |

Chaque fonction a deux chemins :

1. **GeoArrow natif** : parsing binaire via `geoarrow-deck-stream` + attributs binaires Deck.gl 9.
2. **Fallback GeoJSON** : conversion Arrow → GeoJSON (cachée) → `GeoJsonLayer`.

### Attributs binaires (Deck.gl 9)

```typescript
// Précalcul d'un Uint8Array de couleurs au lieu d'un accesseur fonction
const fillColorBinAttr = pointColorAttr(
  pointData,
  rowAccessor(table, fillColorAccessor)
);
scatterBinaryData.attributes.getFillColor = fillColorBinAttr;
```

Fonctions utilitaires dans `geoarrow-stream-bridge.ts` :

- `pointColorAttr(data, colorLookup)` — RGBA8 par point
- `pointRadiusAttr(data, radiusLookup)` — rayon par point
- `filterValueAttr(data, table, column)` — `Float32Array` pour `DataFilterExtension`
- `pointPositions(data)` — extraction directe des coordonnées

### Chemins pour les couches de points

| Chemin              | Layer                                   | Quand                                                              |
| ------------------- | --------------------------------------- | ------------------------------------------------------------------ |
| Scatter natif       | `ScatterplotLayer`                      | Point/Multipoint GeoArrow, forme CIRCLE, pas de shape catégorielle |
| Scatter multi-forme | `MultiShapeLayer`                       | Même conditions + `useCategoryShape: true`                         |
| GeoJSON icône       | `GeoJsonLayer` (pointType=icon)         | Forme ≠ CIRCLE ou encodage WKB/GeoJSON legacy                      |
| Centroïde           | `MultiShapeLayer` (suffix `-centroids`) | Symboles sur polygones / lignes / multipoints                      |

`ScatterplotLayer` ne peut pas rendre de formes non-circulaires. Utiliser `MultiShapeLayer` dès que `CategoryShapeMode` passe sur `DIFFERENT` ou `ORDERED`.

---

## Identifiants de couche

```typescript
createLayerId(DeckLayerId.POINT_LAYER, datasetId, projectionSuffix);
// → "point-layer-ds_abc123-webmercator"
```

Les IDs doivent rester **stables** entre les renders. Changer un ID force un re-upload GPU complet au lieu d'un prop diff. Ne jamais suffixer selon le mode — la classe de layer change, pas l'ID.

---

## `DataFilterExtension` (filtrage GPU-side)

Pour le filtrage par année sur les données binaires :

```typescript
// La table complète est passée à createDeckLayers (cache GeoArrow préservé)
const filterAttr = filterValueAttr(binaryData, table, yearColumn);
data.attributes.getFilterValue = filterAttr;
// layer.props: filterRange: [yearValue, yearValue]
```

Pour les données GeoJSON (fallback), `getFilterValue` est un accesseur fonction classique.

Le sélecteur d'années côté UI récupère les valeurs distinctes depuis DuckDB dès qu'une `tableName` existe. Un fallback local sur les données en cache est utilisé uniquement en dernier recours, pour éviter une désynchronisation entre le filtre UI et le rendu effectif.

---

## Tooltip et picking

```
hover → mapTooltipStore.showAtHover(x, y, entries, layerId, rowIndex)
clic  → épingle le tooltip à la position fixe du viewer
clic vide → décroche
```

Pour les polygones et lignes binaires, le mapping pick → ligne source s'appuie sur `featureIds` (pas `PickingInfo.index`) car les géométries multipart ont une relation M:1 vertex/entité. Les factories de couches binaires copient explicitement `featureIds` dans `layer.props.data`.

`extractTooltipEntries()` lit depuis Arrow (`table.get(rowIndex)`) ou GeoJSON (`feature.properties`).

---

## Couches de fond de carte

10 couches divisées en deux groupes :

| Groupe       | Couches                                                                       |
| ------------ | ----------------------------------------------------------------------------- |
| `background` | terre, mers, lacs, relief                                                     |
| `foreground` | frontières, rivières, équateur, méridiens, villes (symboles), villes (labels) |

Les villes sont rendues en deux couches distinctes : un layer de symboles (`MultiShapeLayer` ou `ScatterplotLayer`) et un layer de labels texte (`TextLayer` au-dessus). Cela permet de toggler indépendamment les points et leurs étiquettes.

Les sections **Lacs/Rivières** et **Villes** sont désactivées si le fond actif ne fournit pas les données géométriques correspondantes — évite les contrôles qui semblent actifs sans effet visuel.

Pour les GeoArrow natifs, les couches linéaires sont rendues en `PathLayer` binaire pour que les tirets (`PathStyleExtension`) restent fiables. Les sources WKB/GeoJSON utilisent `GeoJsonLayer`.

---

## Overlay SVG (annotations)

L'overlay SVG (`annotation-overlay.svelte`) est superposé à la carte via un `position: absolute` sur le conteneur viewer. Il gère 4 types d'annotations : `TEXT`, `SHAPE` (flèche, cercle, rectangle, triangle), `DRAWING` (Bézier freehand), `IMAGE`. Les annotations sont ancrées à la page (coordonnées pixel), non géolocalisées. Elles sont stockées dans `annotations.store.svelte.ts` et incluses dans l'export SVG.

---

## Collections / Facettes

Chaque facette est une **`ThematicMap` complète** (MapLibre + Deck.gl indépendants). Cela signifie un contexte WebGL2 par facette. Les navigateurs limitent le nombre de contextes WebGL2 simultanés à 8–16 ; Khartis applique une borne `MAX_FACETS = 16` (`step-toolbar/tools/facets/facets.store.svelte.ts`). La synchronisation du viewport entre facettes est gérée par `FacetSyncViewState`.

---

## Nettoyage GPU

```typescript
// Avant map.remove() ou changement de vue
overlay.setProps({ layers: [] }); // libère les buffers VRAM
map.removeControl(overlay);
```

Ne pas oublier ce nettoyage lors d'un changement de mode (orthographique ↔ MapLibre) : les buffers GPU doivent être libérés avant que le nouveau contexte soit créé.

---

## Timings de debounce

| Constante                  | Valeur | Usage                           |
| -------------------------- | ------ | ------------------------------- |
| `LAYER_UPDATE_DEBOUNCE_MS` | 16 ms  | `scheduleLayerUpdate()` via RAF |
| `FITBOUNDS_DEBOUNCE_MS`    | 300 ms | Recalage de vue                 |
| `RESIZE_DEBOUNCE_MS`       | 150 ms | Redimensionnement canvas        |

Le debounce de la recherche (highlight Deck.gl après requête DuckDB) est défini par l'outil Recherche directement (250 ms par défaut, voir `step-toolbar/tools/search/`).

---

## Calcul des bounds

`computeBoundsFromArrow()` (`core/bounds.ts`) tente dans l'ordre :

1. Métadonnée GeoArrow bbox (ignorée si `[-180, -90, 180, 90]` — world bounds DuckDB).
2. Scan de la colonne géométrique primaire (max 10 000 lignes).
3. Découverte automatique d'une colonne de nom géographique (`lat`, `lon`, `geom`, etc.).
4. Brute-force sur toutes les colonnes.

Pour les fichiers projetés avec un CRS non WGS84 (ex. EPSG:2154), les bounds sont conservées dans les coordonnées source. La projection DuckDB vers EPSG:4326 n'est demandée que pour l'affichage sur fond OSM MapLibre.
