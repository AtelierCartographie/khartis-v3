# Visualisations et rendu

> Configuration des cartes thematiques et pipeline de rendu GPU. Document technique destine aux developeurs.

**Voir aussi** : [Fonds de carte](./FONDS_DE_CARTE.md) | [Architecture](./ARCHITECTURE.md) | [Pipeline de donnees](./PIPELINE_DONNEES.md)

---

## Types de visualisation

| Type                        | Valeur enum      | Usage                              | Prerequis                        |
| --------------------------- | ---------------- | ---------------------------------- | -------------------------------- |
| **Choroplethe**             | `choropleth`     | Regions colorees selon une valeur  | Geometrie + variable numerique   |
| **Symboles proportionnels** | `proportional`   | Marqueurs dimensionnes              | Geometrie + variable numerique   |
| **Categorielle**            | `categorical`    | Categories distinctes              | Geometrie + variable categorielle |
| **Bivariee**                | `bivariate`      | Croisement de 2 variables           | Geometrie + 2 variables numeriques |

---

## Deux modes de rendu

Khartis utilise deux modes selon la presence d'un fond de carte OSM :

### Mode orthographique (par defaut)

[Deck.gl](https://context7.com/visgl/deck.gl) opère en **standalone** avec une `OrthographicView`. Le fond de carte vectoriel est rendu par Deck.gl lui-meme via GeoArrow binaire. C'est le mode principal pour les projections personalisees.

```
Deck.gl standalone (OrthographicView)
├── Couches fond background  (SolidPolygonLayer, PathLayer)
├── Couches thematiques     (SolidPolygonLayer, PathLayer, ScatterplotLayer)
└── Couches fond foreground (PathLayer, TextLayer, ScatterplotLayer)
```

**Detection** : `!deckOverlay && deckInstance` dans `use-map-layers.svelte.ts`

### Mode MapLibre interleaved (fond OSM)

[Deck.gl](https://context7.com/visgl/deck.gl) s'attache a [MapLibre GL JS](https://context7.com/maplibre/maplibre-gl-js) via `MapboxOverlay` (`@deck.gl/mapbox`). Le fond est des tuiles vectorielles OSM. Les couches thematiques sont **intercalees** dans le style MapLibre (avant le premier `symbol` layer).

```
MapLibre GL (tuiles + fond)
└── MapboxOverlay (Deck.gl intercale)
    └── Couches thematiques uniquement
```

**Detection** : `deckOverlay` non null

> En mode MapLibre, les couches de fond Deck.gl ne sont pas creees (`shouldShowBasemapLayers = false`). MapLibre gere le fond. La couche OSM raster est ajoutee/retiree dynamiquement via `useMapBasemap.syncOSMRasterLayer()`.

---

## Stack de couches Deck.gl

L'ordre dans `layers[]` determine le z-index : **les indices les plus grands sont rendus au-dessus**. En mode orthographique :

```
[0]  basemap-mers              SolidPolygonLayer   fond marin
[1]  basemap-meta-land         SolidPolygonLayer   polygone terrestre
[2]  basemap-terre             SolidPolygonLayer   + PathLayer ombrage/contour
[3]  basemap-relief            PathLayer           ombrage terrain
[4]  basemap-lacs              SolidPolygonLayer   polygones lacustres
     ─────── couches thematiques (N = index de depart, croissent vers M) ───────
[N]  polygon-layer-{vizId}     SolidPolygonLayer   choroplethe / categorielle
[N]  line-layer-{vizId}        PathLayer           choroplethe / categorielle (lignes)
[N]  point-layer-{vizId}       ScatterplotLayer     symboles proportionnels
[N]  label-layer-{vizId}       TextLayer            etiquettes de valeurs
     ─────── foreground (M > N -- rendu au-dessus des donnees) ───────
[M]  basemap-frontieres        PathLayer            frontieres
[M]  basemap-meta-limit        PathLayer            limites metadonnees
[M]  basemap-equateur          PathLayer / GeoJsonLayer
[M]  basemap-meta-geo-lines    PathLayer            equateur, tropiques, cercles
[M]  basemap-meridiens         GeoJsonLayer         meridiens et paralleles
[M]  basemap-meta-graticule    PathLayer            graticule metadonnees
[M]  basemap-villes            ScatterplotLayer + TextLayer
[M]  basemap-meta-centroid     ScatterplotLayer
```

**Regle** : foreground (frontieres, graticules, villes) rendu au-dessus des donnees thematiques car M > N.

La separation background/foreground est geree par `createBasemapLayers()` qui retourne `{ background, foreground }` (`map/layers/basemap-layers.ts`).

---

## Pipeline GeoArrow -> GPU

Le coeur du rendu haute performance. Le pipeline evite tout passage par GeoJSON JavaScript.

### 1. Source : Arrow table avec metadonnees `geo`

Les tables Arrow proviennent de [DuckDB](https://context7.com/apache/arrow) (lecture Parquet GeoArrow). Le schema contient une cle `geo` dans ses metadonnees qui identifie la colonne geometrique et son encoding (`geoarrow.polygon`, `geoarrow.multipolygon`, etc.).

```typescript
const geoInfo = extractGeometryInfo(table);
// -> { type, encoding, geoColumn, isNativeGeoArrow, isWkbEncoded, isGeoJsonEncoded }
```

### 2. Parsing : Arrow -> buffers binaires

[geoarrow-deck-stream](https://github.com/AtelierCartographie/geoarrow-deck-stream) convertit les colonnes GeoArrow en buffers binaires pour [Deck.gl](https://context7.com/visgl/deck.gl) -- sans objets GeoJSON intermediaires.

```typescript
import {
  parsePolygonsToSolid, // -> BinaryPolygonData
  parsePaths,           // -> BinaryPathData
  parsePoints           // -> BinaryPointData
} from 'geoarrow-deck-stream';
```

Le bridge `map/utils/geoarrow-stream-bridge.ts` encapsule ces fonctions avec :

- **Cache WeakMap** pour le parsing identity (pas de reprojection) -- la meme table Arrow donne le meme buffer
- **Parsing avec projection** (sans cache) quand une projection d3-geo est active

### 3. Props Deck.gl : `createSolidPolygonLayerProps`

[geoarrow-deck-stream](https://github.com/AtelierCartographie/geoarrow-deck-stream) fournit des factories qui generent les props binaires pour chaque layer :

```typescript
import {
  createSolidPolygonLayerProps, // pour SolidPolygonLayer
  createPathLayerProps,          // pour PathLayer
  createScatterplotLayerProps    // pour ScatterplotLayer
} from 'geoarrow-deck-stream';

const polyData = parsePolygonsToSolid(table);
new SolidPolygonLayer({
  id: 'polygon-layer-viz-abc',
  ...createSolidPolygonLayerProps(polyData), // data, getPolygon, etc. en binaire
  getFillColor: withOpacity(fillColor, opacity),
  updateTriggers: { getFillColor: [fillColor, opacity] }
});
```

### 4. `featureIds` : liaison donnees -> geometrie

Le champ `featureIds` (`Uint32Array`) dans chaque buffer map chaque vertex vers son indice de ligne dans la table [Arrow](https://context7.com/apache/arrow) d'origine. Permet aux accesseurs de couleur/taille de retrouver la valeur pour chaque entite, meme apres decoupage ou reprojection.

```typescript
const colorAttr = createPolygonFillColorAttribute(polyData, (featureId) => {
  const value = valueVector.get(featureId); // lecture directe dans Arrow
  return colorScale(value); // -> [r, g, b, a]
});
```

---

## Projections

### Propagation (mode orthographique)

```
basemapService.currentBasemap.metadata.proj_to
        |
buildProjectionForBasemap(metadata, 960, 600, projectionPresets)
        |  (GeoProjection d3-geo)
customProjection  ->  toutes les couches thematiques
        |
resolvePolygonParser(customProjection)  // injecte la projection dans le parser
```

Dans `use-map-layers.svelte.ts:186-203`.

### Types de projection des fonds (`BasemapMetadata.proj_to`)

| Type        | Comportement                                   | Exemple                  |
| ----------- | ---------------------------------------------- | ------------------------ |
| `identity`  | Lon/lat passthrough (`geoIdentity()`)           | Fonds personnalises      |
| `simple`    | Projection unique via `proj4d3(proj4string)`   | Natural Earth, Robinson  |
| `composite` | Projection composite avec encarts DOM-TOM      | France metropolitaine + DOM |

Certains noms proj4 non gérés par proj4.js (ex : `natearth2`) sont mappés vers des equivalents d3-geo dans `D3_GEO_PROJECTION_MAP` (`geoarrow-stream-bridge.ts`).

### Mode MapLibre : `mapProjectionStore`

En mode OSM, [MapLibre GL JS](https://context7.com/maplibre/maplibre-gl-js) gere la projection. `mapProjectionStore.projection` est transmis a `map.setProjection({ type })`. Un `projectionSuffix` est ajoute aux IDs des couches Deck.gl pour forcer leur recreation lors d'un changement de projection (contournement du bug deck.gl #9466).

---

## Factories de couches

### `createDeckLayers(table, ctx)` -- Arrow -> couches thematiques

Point d'entree principal. Inspecte le type geometrique de la table et delegue :

| Geometrie                  | Factory                | Couche [Deck.gl](https://context7.com/visgl/deck.gl)        |
| -------------------------- | ---------------------- | ----------------------------------------------------------- |
| POLYGON / MULTIPOLYGON    | `createPolygonLayers()` | `SolidPolygonLayer` + `PathLayer` (contour)                |
| LINESTRING / MULTILINESTRING | `createLineLayers()`  | `PathLayer`                                                  |
| POINT / MULTIPOINT         | `createPointLayers()`  | `ScatterplotLayer`                                           |

### `createGeoJsonLayers(geojson, ctx)` -- GeoJSON -> couches thematiques

Pour datasets GeoJSON importes (WKB non natif). [GeoJsonLayer](https://context7.com/visgl/deck.gl) standard. Moins performant que le path GeoArrow (parsing CPU).

### `createBasemapLayers(worldBaseTable, ctx, additionalData)` -- fond de carte

Cree l'ensemble des couches d'habillage depuis `basemapLayersStore`. Retourne `{ background, foreground }`. Mode orthographique uniquement (`shouldShowBasemapLayers`).

---

## LayerContext -- interface de configuration

Toute la configuration transmise aux factories via `LayerContext` :

```typescript
interface LayerContext {
  viz: VisualizationConfig | null;
  datasetId: string;
  fillColor: RGBColor;
  strokeColor: RGBColor;
  fillOpacity: number;
  strokeWidth: number;
  strokeOpacity: number;
  statistics: { min: number; max: number };
  categoryColorMap: Map<string, RGBColor> | null;
  modelMatrix?: Matrix4 | null;       // mode orthographique
  projectionSuffix?: string;          // force recreation sur changement projection
  beforeId?: string;                 // id du premier symbol layer MapLibre (mode interleaved)
  customProjection?: ProjectionLike;   // projection d3-geo
  geometryInfo?: GeometryInfo;
  yearFilter?: { column: string; value: number }; // DataFilterExtension
}
```

`buildLayerContextForViz(viz)` dans `thematic-map.svelte` construit ce contexte depuis `visualizationStore`.

---

## Regles Deck.gl essentielles

### IDs stables

ID stable = pas de re-upload GPU complet. Forme : `{layerType}-{vizId}-{projectionSuffix}`.

```typescript
// ✓ ID stable -- Deck.gl diff les props
id: createLayerId(DeckLayerId.POLYGON_LAYER, viz.id, ctx.projectionSuffix);
```

### `updateTriggers`

[Deck.gl](https://context7.com/visgl/deck.gl) compare les accesseurs par reference. Pour signaler qu'un accesseur doit etre recalcule :

```typescript
new SolidPolygonLayer({
  getFillColor: (_, { index }) => colorScale(values[index]),
  updateTriggers: {
    getFillColor: [classBreaks, selectedPalette, fillOpacity]
  }
});
```

Pour les **accesseurs constants** (`getFillColor: [255, 0, 0]`), `updateTriggers` est inutile.

### Coût des updates

| Operation                     | Impact GPU                          | Quand                           |
| ----------------------------- | ----------------------------------- | ------------------------------- |
| Redraw (pan/zoom)             | Tres faible                         | Chaque frame                    |
| Update via `updateTriggers`   | Faible-moyen                        | Changement couleur, seuils      |
| Nouvelle prop `data`          | Eleve (re-upload binaire)           | Changement dataset ou filtres JS |
| Changement d'ID               | Tres eleve (reconstruction complete) | Eviter si possible              |

### Extensions singleton

Les extensions Deck.gl sont stateless. Une seule instance par type au niveau module :

```typescript
// ✓ Singletons
const DATA_FILTER_EXTENSION = new DataFilterExtension({ filterSize: 1 });
const DASH_EXTENSION = new PathStyleExtension({ dash: true });
```

### DataFilterExtension -- filtrage par annee (GPU-side)

Pour les datasets temporels, le filtre par annee est applique cote GPU via [DataFilterExtension](https://context7.com/visgl/deck.gl). La table Arrow complete (non filtree) est passee a `createDeckLayers` pour stabiliser le cache WeakMap :

```typescript
const filterAttr = filterValueAttr(binaryData, table, yearFilter.column);
dataObj.attributes.getFilterValue = filterAttr;

new SolidPolygonLayer({
  extensions: [DATA_FILTER_EXTENSION],
  filterRange: [yearFilter.value, yearFilter.value],
  updateTriggers: { getFilterValue: [yearFilter.column, yearFilter.value] }
});
```

---

## Methodes de classification

| Methode                | Valeur enum            | Algorithme                              |
| ---------------------- | ---------------------- | --------------------------------------- |
| **Intervalles egaux**  | `equal_interval`       | `(max - min) / k`                       |
| **Quantiles**          | `quantiles`            | Effectifs egaux, gestion des ex-aequo   |
| **Jenks**              | `jenks`                | Ruptures naturelles (fallback: Quantiles) |
| **Ecart-type**         | `standard_deviation`   | `moyenne +/- n * sigma`                 |
| **Q6**                 | `q6`                   | 6 classes par quantiles                 |
| **Moyennes emboitees** | `nested_means`         | Subdivision recursive par la moyenne     |
| **Head/Tail**          | `head_tail`            | Partitionnement par la moyenne iteree    |
| **Manuel**             | `manual`               | Seuils definis par l'utilisateur        |

Calcul via `classificationService` (8 methodes, DuckDB SQL macros). **Par defaut** : 5 classes.

---

## Collections (facettes)

Chaque facette instancie un `ThematicMap` complet ([Deck.gl](https://context7.com/visgl/deck.gl) + [MapLibre GL JS](https://context7.com/maplibre/maplibre-gl-js)). Les navigateurs limitent les contextes WebGL2 a 8-16 simultanes -- contrainte directe sur le nombre maximum de facettes.

---

## Points d'extension

- **Nouveau type de visualisation** : valeur dans `VisualizationType`, defauts dans `visualizationStore` (`getDefaultStyle`, `getDefaultModes`), factory dans `map/layers/`, regles dans `viz-suggester.service.ts`
- **Nouvelle methode de classification** : valeur dans `ClassificationMethod`, implementation dans `classificationService`
- **Nouvelle palette** : objet `ColorPalette` (id, type, couleurs, flag accessibilite)
- **Nouveau type de couche de fond** : `DeckLayerId` dans `basemap-layers.store.svelte`, factory dans `basemap-layers.ts`

---

**Voir aussi :** [FONDS_DE_CARTE.md](./FONDS_DE_CARTE.md) — [PIPELINE_DONNEES.md](./PIPELINE_DONNEES.md) — [ARCHITECTURE.md](./ARCHITECTURE.md) — [GESTION_ETAT.md](./GESTION_ETAT.md)
