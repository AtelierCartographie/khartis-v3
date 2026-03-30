# Visualisations et rendu

> Configuration des cartes thématiques et pipeline de rendu GPU.

**Voir aussi** : [Fonds de carte](FONDS_DE_CARTE.md) | [Architecture](ARCHITECTURE.md) | [Pipeline de données](PIPELINE_DONNEES.md)

---

## Types de visualisation

| Type | Valeur enum | Usage | Prérequis |
| --- | --- | --- | --- |
| **Choroplèthe** | `choropleth` | Régions colorées selon une valeur | Géométrie + variable numérique |
| **Symboles proportionnels** | `proportional` | Marqueurs dimensionnés | Géométrie + variable numérique |
| **Catégorielle** | `categorical` | Catégories distinctes | Géométrie + variable catégorielle |
| **Bivariée** | `bivariate` | Croisement de 2 variables | Géométrie + 2 variables numériques |

---

## Deux modes de rendu

Khartis utilise deux modes de rendu distincts selon la présence d'un fond de carte OSM :

### Mode orthographique (par défaut)

Deck.gl opère **en mode standalone** avec une `OrthographicView`. Le fond de carte vectoriel (terre, frontières, etc.) est rendu par Deck.gl lui-même sous forme de couches binaires GeoArrow. C'est le mode principal pour les cartes thématiques avec projections personnalisées.

```
Deck.gl standalone (OrthographicView)
├── Couches fond de carte background  (SolidPolygonLayer, PathLayer)
├── Couches thématiques               (SolidPolygonLayer, PathLayer, ScatterplotLayer)
└── Couches fond de carte foreground  (PathLayer, TextLayer, ScatterplotLayer)
```

**Détecté par :** `!deckOverlay && deckInstance` dans `use-map-layers.svelte.ts`

### Mode MapLibre interleaved (fond OSM)

Deck.gl s'attache à MapLibre via `MapboxOverlay` de `@deck.gl/mapbox`. Le fond de carte est fourni par des tuiles vectorielles (OpenStreetMap, Carte Facile, etc.). Les couches Deck.gl sont **intercalées** dans le style MapLibre — les couches thématiques sont insérées juste avant le premier `symbol` layer MapLibre pour que les étiquettes texte restent au-dessus.

```
MapLibre GL (gestion tuiles + fond tuilé)
└── MapboxOverlay (Deck.gl intercalé)
    └── Couches thématiques uniquement   (pas de basemap Deck.gl)
```

**Détecté par :** `deckOverlay` non null dans `use-map-layers.svelte.ts`

> En mode MapLibre, les couches de fond de carte Deck.gl ne sont **pas** créées (`shouldShowBasemapLayers = false`). MapLibre gère le fond. La couche OSM raster est ajoutée/retirée dynamiquement via `useMapBasemap.syncOSMRasterLayer()`.

---

## Stack de couches Deck.gl complet

L'ordre exact du tableau `layers[]` envoyé à Deck.gl (mode orthographique) :

```
[0]  basemap-mers            SolidPolygonLayer   fond marin
[1]  basemap-meta-land       SolidPolygonLayer   polygone terrestre (depuis metadata)
[2]  basemap-terre           SolidPolygonLayer   + PathLayer ombrage/contour
[3]  basemap-relief          PathLayer           ombrage terrain (hachures)
[4]  basemap-lacs            SolidPolygonLayer   polygones lacustres
     ──────── couches thématiques ────────
[N]  polygon-layer-{vizId}   SolidPolygonLayer   choroplèthe / catégorielle (polygones)
[N]  line-layer-{vizId}      PathLayer           choroplèthe / catégorielle (lignes)
[N]  point-layer-{vizId}     ScatterplotLayer    symboles proportionnels / points
[N]  label-layer-{vizId}     TextLayer           étiquettes de valeurs
[N]  text-layer-{vizId}      TextLayer           textes libres
     ──────── foreground fond de carte ────────
[M]  basemap-frontieres      PathLayer           frontières administratives
[M]  basemap-meta-limit      PathLayer           limites issues des métadonnées
[M]  basemap-equateur        PathLayer / GeoJsonLayer
[M]  basemap-meta-geo-lines  PathLayer           équateur, tropiques, cercles polaires
[M]  basemap-meridiens       GeoJsonLayer        méridiens et parallèles
[M]  basemap-meta-graticule  PathLayer           graticule issu des métadonnées
[M]  basemap-villes          ScatterplotLayer + TextLayer  villes
[M]  basemap-meta-centroid   ScatterplotLayer    centroïdes issus des métadonnées
```

**Règle clé** : les couches foreground (frontières, graticules, villes) se rendu **au-dessus** des données thématiques pour que les contours administratifs restent visibles même lorsque des polygones de données les recouvrent.

La séparation background/foreground est gérée par `createBasemapLayers()` qui retourne `{ background, foreground }` — voir `map/layers/basemap-layers.ts:1387`.

---

## Pipeline GeoArrow → GPU

C'est le cœur du rendu haute performance. Le pipeline évite tout passage par GeoJSON JavaScript côté CPU.

### 1. Source : Arrow table avec métadonnées `geo`

Les tables Arrow proviennent de DuckDB (lecture de fichiers Parquet GeoArrow). Le schéma contient une clé `geo` dans ses métadonnées qui identifie la colonne géométrique et son encoding (`geoarrow.polygon`, `geoarrow.multipolygon`, etc.).

```typescript
const geoMetadata = table.schema.metadata?.get('geo');
const geoInfo = extractGeometryInfo(table); // → { type, encoding, column, isNativeGeoArrow }
```

### 2. Parsing : Arrow → buffers binaires

La librairie `geoarrow-deck-stream` convertit les colonnes GeoArrow en buffers binaires typés directement consommables par Deck.gl — sans créer d'objets GeoJSON intermédiaires.

```typescript
import {
  parsePolygonsToSolid, // → BinaryPolygonData
  parseGeometry,        // → BinaryPathData
  parsePoints           // → BinaryPointData
} from 'geoarrow-deck-stream';
```

Le bridge `map/utils/geoarrow-stream-bridge.ts` encapsule ces fonctions avec :
- **Cache WeakMap** pour le parsing identity (identité lon/lat) — la même table Arrow donne le même buffer sans recalcul
- **Parsing avec projection** (sans cache) quand une projection d3-geo est active

```typescript
// Mode identity — résultat mis en cache par table (WeakMap)
export function parseSolidPolygons(table: ArrowTable): BinaryPolygonData
export function parsePaths(table: ArrowTable): BinaryPathData
export function parsePointData(table: ArrowTable): BinaryPointData

// Mode projeté — pas de cache (projection change avec la taille du canvas)
export function parseSolidPolygonsWithProjection(table, projection): BinaryPolygonData
export function parsePathsWithProjection(table, projection): BinaryPathData
export function parsePointDataWithProjection(table, projection): BinaryPointData
```

### 3. Props Deck.gl : `createSolidPolygonLayerProps` etc.

`geoarrow-deck-stream` fournit des factories qui génèrent les props binaires pour chaque type de layer Deck.gl :

```typescript
import {
  createSolidPolygonLayerProps, // pour SolidPolygonLayer
  createPathLayerProps,         // pour PathLayer
  createScatterplotLayerProps   // pour ScatterplotLayer
} from 'geoarrow-deck-stream';

// Exemple : couche de polygones choroplèthes
const polyData = parseSolidPolygons(table);  // BinaryPolygonData
new SolidPolygonLayer({
  id: 'polygon-layer-viz-abc',
  ...createSolidPolygonLayerProps(polyData), // data, getPolygon, etc. en binaire
  getFillColor: withOpacity(fillColor, opacity),
  updateTriggers: { getFillColor: [fillColor, opacity] }
})
```

### 4. `featureIds` : liaison données → géométrie

Le champ `featureIds` (Uint32Array) dans chaque buffer binaire mappe chaque vertex (ou point) vers son indice de ligne dans la table Arrow d'origine. C'est ce qui permet aux accessors de couleur/taille de retrouver la valeur utilisateur pour chaque entité géographique, même après que la géométrie a été découpée ou reprojetée.

```typescript
// Accessor de couleur choroplèthe binaire
const colorAttr = createPolygonFillColorAttribute(
  polyData,
  (featureId) => {
    const value = valueVector.get(featureId); // lecture directe dans Arrow
    return colorScale(value);                 // → [r, g, b, a]
  }
);
```

---

## Projections et reprojection

### Propagation de la projection

En mode orthographique, la projection du fond de carte se propage automatiquement aux couches thématiques. Les deux types de couches s'affichent ainsi dans le même espace de coordonnées.

```
basemapService.currentBasemap.metadata.proj_to
        ↓
buildProjectionForBasemap(metadata, 960, 600, projectionPresets)
        ↓  (→ ProjectionLike d3-geo compatible)
customProjection                          ← propagé à toutes les couches
        ↓
resolvePolygonParser(customProjection)    ← injecte la projection dans le parser
```

Ce flux se trouve dans `use-map-layers.svelte.ts:186-203`.

### Types de projection des fonds de carte

Définis dans `BasemapMetadata.proj_to` (voir `FONDS_DE_CARTE.md`) :

| Type | Comportement | Exemple |
|------|-------------|---------|
| `identity` | Lon/lat passthrough — `geoIdentity()` | Fonds personnalisés, mode MapLibre |
| `simple` | Projection unique via `proj4d3(proj4string)` | Natural Earth, Robinson... |
| `composite` | Projection composite avec encarts DOM-TOM via `buildCompositeProjection()` | France métropolitaine + DOM |

Certains noms proj4 non gérés par proj4.js (ex : `natearth2`) sont mappés vers des equivalents d3-geo dans `D3_GEO_PROJECTION_MAP` (`geoarrow-stream-bridge.ts:40`).

### Mode MapLibre : `mapProjectionStore`

En mode OSM, c'est MapLibre qui gère la projection cartographique. `mapProjectionStore.projection` est transmis à `map.setProjection({ type })` (ex: `'mercator'`, `'globe'`). Un `projectionSuffix` est ajouté aux IDs des couches Deck.gl pour forcer leur recréation lors d'un changement de projection (contournement du bug deck.gl #9466).

---

## Factories de couches

### `createDeckLayers(table, ctx)` — Arrow → couches thématiques

Point d'entrée principal pour les datasets Arrow. Inspecte le type géométrique de la table et délègue vers la factory appropriée :

| Géométrie | Factory | Couche Deck.gl |
|-----------|---------|----------------|
| POLYGON / MULTIPOLYGON | `createPolygonLayers()` | `SolidPolygonLayer` + `PathLayer` (contour) |
| LINESTRING / MULTILINESTRING | `createLineLayers()` | `PathLayer` |
| POINT / MULTIPOINT | `createPointLayers()` | `ScatterplotLayer` |

Chaque factory reçoit un `LayerContext` qui transporte toute la configuration de visualisation.

### `createGeoJsonLayers(geojson, ctx)` — GeoJSON → couches thématiques

Utilisé pour les datasets GeoJSON importés (WKB non natif). Crée des `GeoJsonLayer` Deck.gl standard. Moins performant que le path GeoArrow car Deck.gl doit parser le GeoJSON côté CPU.

### `createBasemapLayers(worldBaseTable, ctx, additionalData)` — fond de carte

Crée l'ensemble des couches d'habillage à partir du store `basemapLayersStore`. Retourne `{ background, foreground }`. Uniquement appelé en mode orthographique (`shouldShowBasemapLayers`).

---

## LayerContext — interface de configuration

Toute la configuration d'une visualisation est transmise aux factories via `LayerContext` :

```typescript
interface LayerContext {
  viz: VisualizationConfig | null;   // config complète de la viz (type, classification, palette...)
  datasetId: string;
  fillColor: RGBColor;               // couleur de remplissage de base
  strokeColor: RGBColor;
  fillOpacity: number;
  strokeWidth: number;
  strokeOpacity: number;
  statistics: { min: number; max: number }; // pour les symboles proportionnels
  categoryColorMap: Map<string, RGBColor> | null; // pour les catégorielles
  modelMatrix?: Matrix4 | null;      // mode orthographique uniquement
  projectionSuffix?: string;         // forcer recréation sur changement de projection
  beforeId?: string;                 // id du premier symbol layer MapLibre (mode interleaved)
  customProjection?: ProjectionLike; // projection d3-geo à appliquer
  geometryInfo?: GeometryInfo;
  yearFilter?: { column: string; value: number }; // pour DataFilterExtension
}
```

`buildLayerContextForViz(viz)` dans `thematic-map.svelte` construit ce contexte depuis le `visualizationStore` avant d'appeler `updateLayers()`.

---

## Règles Deck.gl essentielles

### IDs stables

Chaque couche a un ID stable de la forme `{layerType}-{vizId}-{projectionSuffix}`. Un changement d'ID force un re-upload GPU complet de la géométrie — éviter sauf si la structure des données change.

```typescript
// ✓ ID stable — Deck.gl diff les props, pas de re-upload
id: createLayerId(DeckLayerId.POLYGON_LAYER, viz.id, ctx.projectionSuffix)
// → 'polygon-layer-viz-abc123-natural-earth-2'
```

### `updateTriggers`

Deck.gl compare les accessors par référence. Pour signaler qu'un accessor doit être recalculé, lister ses dépendances dans `updateTriggers` :

```typescript
new SolidPolygonLayer({
  getFillColor: (_, { index }) => colorScale(values[index]),
  updateTriggers: {
    getFillColor: [classBreaks, selectedPalette, fillOpacity]
    // Deck.gl recalcule getFillColor si l'une de ces valeurs change
  }
})
```

Pour les **accessors constants** (`getFillColor: [255, 0, 0]`), `updateTriggers` est inutile — Deck.gl détecte le changement par comparaison directe.

### Coût des updates

| Opération | Coût GPU | Quand |
|-----------|---------|-------|
| Redraw (déplacement/zoom) | Très faible | Chaque frame |
| Mise à jour via `updateTriggers` | Faible–moyen | Changement de couleur, seuils |
| Nouvelle prop `data` | Élevé (re-upload binaire) | Changement de dataset ou filtres JS |
| Changement d'ID | Très élevé (reconstruction complète) | Jamais si évitable |

### Extensions singleton

Les extensions Deck.gl sont des objets de configuration stateless. Créer une nouvelle instance par render est du gaspillage — utiliser des singletons :

```typescript
// ✓ Singletons déclarés au niveau module
const DATA_FILTER_EXTENSION = new DataFilterExtension({ filterSize: 1 });
let fillStyleExtensionInstance: RotatableFillStyleExtension | null = null; // lazy singleton
const DASH_EXTENSION = new PathStyleExtension({ dash: true });
```

### DataFilterExtension — filtrage par année (GPU-side)

Pour les datasets temporels, le filtre par année est appliqué côté GPU via `DataFilterExtension`. La table Arrow complète (non filtrée) est passée à `createDeckLayers` pour stabiliser le cache WeakMap — la valeur de filtre est injectée comme attribut binaire `getFilterValue` :

```typescript
// Dans layer-factory.ts
const filterAttr = filterValueAttr(binaryData, table, yearFilter.column);
dataObj.attributes.getFilterValue = filterAttr;

new SolidPolygonLayer({
  extensions: [DATA_FILTER_EXTENSION],
  filterRange: [yearFilter.value, yearFilter.value], // [min, max] exact
  updateTriggers: { getFilterValue: [yearFilter.column, yearFilter.value] }
})
```

### Patterns de remplissage

Les polygones choroplèthes peuvent recevoir un motif de hachures via `RotatableFillStyleExtension` (extension custom, `map/layers/rotatable-fill-style-extension.ts`). Le motif est rendu dans un canvas atlas `fillPatternAtlas`, les coordonnées UV dans `fillPatternMapping`.

---

## Couches de fond de carte Deck.gl (mode orthographique)

9 couches configurables dans `basemapLayersStore`, réparties en deux groupes :

### Background (rendues sous les données)

| ID store | DeckLayerId | Type Deck.gl | Propriétés |
|----------|-------------|-------------|------------|
| `terre` | `BASEMAP_TERRE` | `SolidPolygonLayer` + `PathLayer` | Couleur remplissage, ombre, opacité, contour pointillé |
| `mers` | `BASEMAP_MERS` | `SolidPolygonLayer` | Couleur, opacité |
| `lacs` | `BASEMAP_LACS` | `SolidPolygonLayer` | Couleur, épaisseur, opacité |
| `relief` | `BASEMAP_RELIEF` | `PathLayer` | Représentation (ombrage/hachure), couleur |

### Foreground (rendues au-dessus des données)

| ID store | DeckLayerId | Type Deck.gl | Propriétés |
|----------|-------------|-------------|------------|
| `frontieres` | `BASEMAP_FRONTIERES` | `PathLayer` | Couleur, pointillé, épaisseur, opacité |
| `equateur` | `BASEMAP_EQUATEUR` | `PathLayer` / `GeoJsonLayer` | Couleur, pointillé, épaisseur, opacité |
| `meridiens` | `BASEMAP_MERIDIENS` | `GeoJsonLayer` | Remarquables (TOUS/GREENWICH), pointillé |
| `rivieres` | `BASEMAP_RIVIERES` | `PathLayer` | Couleur, pointillé, épaisseur, opacité |
| `villes` | `BASEMAP_VILLES` | `ScatterplotLayer` + `TextLayer` | Catégorie (capitales/grandes), symbole, taille |

### Couches issues des métadonnées

En plus des couches de la config globale, les **fonds de carte du catalogue** peuvent déclarer des couches supplémentaires dans leurs métadonnées JSON (champ `layers`). Ces couches sont chargées depuis les fichiers Parquet dédiés du fond de carte :

| Type metadata | DeckLayerId | Groupe |
|--------------|-------------|--------|
| `land` | `BASEMAP_META_LAND` | background |
| `limit` | `BASEMAP_META_LIMIT` | foreground |
| `centroid` | `BASEMAP_META_CENTROID` | foreground |
| `graticule` | `BASEMAP_META_GRATICULE` | foreground |
| `geographic-lines` | `BASEMAP_META_GEO_LINES` | foreground |

### Bordures de continents : double-counting

Un pays dessiné comme polygone produit ses bordures deux fois (une par polygone adjacent). En WebGL, les lignes sub-pixel sont anti-aliasées à 1px minimum, résultat : ~2px de trait visible. La couche `terre` plafonne l'épaisseur de contour à `0.5px` et l'opacité à `0.4` pour garder les bordures subtiles (`basemap-layers.ts:166`).

---

## Gestion du style MapLibre

En mode OSM, `useMapBasemap` synchronise :

- **Style de fond** (`syncBasemapStyle`) : appelle `map.setStyle()` (opération lourde — teardown + rebuild complet). Déclenchée uniquement si l'URL du style change. Écoute `style.load` pour savoir quand le style est prêt.
- **Couche raster OSM** (`syncOSMRasterLayer`) : ajoute/retire la source raster `osm-raster-source` et son layer dans MapLibre.
- **Visibilité des étiquettes** (`syncLabelsVisibility`) : itère sur les `symbol` layers du style MapLibre et bascule leur `visibility`.
- **Projection** (`syncProjection`) : appelle `map.setProjection({ type })` — `'mercator'` ou `'globe'`.

> Ne jamais appeler `map.setStyle()` directement sans passer par `useMapBasemap` — cela bypasserait le guard de déduplication.

---

## Couche mondiale de base (`worldBaseTable`)

En mode orthographique, lorsqu'aucun fond de carte du catalogue n'est chargé, une table Arrow mondiale minimale (`worldBaseTable`) sert de fond de repli pour les couches `terre` et `frontieres`. Cette table est chargée une seule fois au démarrage et stockée dans `basemapService`.

---

## Méthodes de classification

| Méthode | Valeur enum | Algorithme | Notes |
| --- | --- | --- | --- |
| **Intervalles égaux** | `equal_interval` | `(max - min) / k` | Simple, régulier |
| **Quantiles** | `quantiles` | Effectifs égaux avec gestion des ex-aequo | Distribution équilibrée |
| **Jenks** | `jenks` | Ruptures naturelles | Fallback vers Quantiles |
| **Écart-type** | `standard_deviation` | `moyenne +/- n * sigma` | Ruptures statistiques |
| **Q6** | `q6` | 6 classes par quantiles | Variante française classique |
| **Moyennes emboîtées** | `nested_means` | Subdivision récursive par la moyenne | Arbre binaire de classes |
| **Head/Tail** | `head_tail` | Partitionnement par la moyenne itérée | Données à distribution longue |
| **Manuel** | `manual` | Seuils définis par l'utilisateur | Contrôle total |

**Par défaut** : 5 classes (recommandé : 3 à 9). Calcul via `classificationService`.

---

## Palettes de couleurs

| Type | Description |
| --- | --- |
| **Séquentielle** | Progression monochrome (clair → foncé) |
| **Divergente** | Deux teintes avec point neutre central |
| **Qualitative** | Couleurs distinctes pour catégories |
| **Bivariée** | Matrice 2D (3×3 ou 4×4) |

**Accessibilité** : filtre signalant les problèmes de contraste WCAG et les combinaisons non accessibles aux daltoniens. Inversion de palette et color picker personnalisé disponibles.

---

## Projections (catalogue)

Le catalogue contient 150+ projections réparties en 5 familles :

- **Cylindriques** : Mercator, Équirectangulaire
- **Pseudo-cylindriques** : Robinson, Natural Earth
- **Coniques** : Albers, Lambert conforme
- **Azimutales** : Orthographique, Stéréographique
- **Discontinues** : Projections interrompues

**Auto-sélection** : les projections sont classées par score d'adéquation à l'emprise du jeu de données et à la distorsion. Support WKT et PROJ.4 pour les projections personnalisées.

---

## Collections (facettes)

Comparaison multi-cartes par variable de regroupement :

- **Échelle commune** : mêmes seuils/couleurs sur toutes les cartes (comparaison)
- **Échelle indépendante** : optimisation par carte (exploration)
- **Grille** : nombre de colonnes configurable
- **Interactions synchronisées** : liaison optionnelle pan/zoom

> Chaque facette instancie un `ThematicMap` complet (MapLibre + Deck.gl). Les navigateurs limitent les contextes WebGL2 à 8–16 actifs simultanément. Au-delà, les plus anciens sont silencieusement détruits. 9 facettes = 9 contextes WebGL.

---

## Simplification géométrique

| Source | Approche |
| --- | --- |
| **Fonds de carte catalogue** | Niveaux de détail pré-simplifiés (LOD multiples) |
| **Géométries importées** | Tolérance ajustable avec aperçu |

Simplification recommandée au-delà de 10 000 sommets. Avertissement en cas de perte excessive de géométrie.

---

## Génération de légendes

| Visualisation | Style de légende |
| --- | --- |
| **Choroplèthe** | Rampe de couleur avec valeurs de seuils |
| **Symboles proportionnels** | Échantillons de taille (min, med, max) |
| **Catégorielle** | Correspondance catégorie → couleur |
| **Bivariée** | Matrice de couleurs 2D avec libellés d'axes |

Régénération automatique à chaque modification de classification, couleur ou données.

---

## Filtres de daltonisme

Simulation par filtres SVG `feColorMatrix` appliqués sur le conteneur de la carte.

| Type | Description |
| --- | --- |
| Protanopie / Deuteranopie / Tritanopie | Dichromates (absence de canal rouge/vert/bleu) |
| Protanomalie / Deuteranomalie / Tritanomalie | Trichromates anomaux (canal réduit) |
| Achromatopsie | Daltonisme complet (niveaux de gris) |
| Achromatomalie | Daltonisme partiel (saturation réduite) |

```ts
import { applyColorBlindnessFilter } from '$lib/features/commons/utils/color-blindness-filters';
import { ColorBlindnessType } from '$lib/features/commons/constants/ui.constants';

applyColorBlindnessFilter(element, ColorBlindnessType.DEUTERANOPIA);
applyColorBlindnessFilter(element, ColorBlindnessType.NONE); // Désactiver
```

---

## Mise en surbrillance

`mapHighlightStore` permet de surligner des lignes sur la carte (résultats de recherche, lignes filtrées). Les lignes surlignées sont à 100 % d'opacité, les autres à 30 %. Le store utilise un `Set<number>` pour des lookups O(1) dans les accessors de couche. Les mises à jour sont déboncées à 800 ms pour éviter de reconstruire les couches à chaque frappe clavier.

---

## Points d'extension

- **Nouveau type de visualisation** : ajouter une valeur à `VisualizationType`, définir les défauts dans le store (`getDefaultStyle`, `getDefaultModes`, `getDefaultMapping`), créer une layer factory dans `map/layers/`, ajouter les règles de suggestion
- **Nouvelle méthode de classification** : ajouter une valeur à `ClassificationMethod`, implémenter la fonction de calcul de seuils dans `classificationService`
- **Nouvelle palette** : définir un objet `ColorPalette` (id, type, couleurs, flag accessibilité)
- **Nouveau type de couche de fond** : ajouter un `DeckLayerId`, un store config dans `basemap-layers.store.svelte`, une factory dans `basemap-layers.ts`, classer en background ou foreground

---

**Voir aussi :** [FONDS_DE_CARTE.md](FONDS_DE_CARTE.md) — [PIPELINE_DONNEES.md](PIPELINE_DONNEES.md) — [ARCHITECTURE.md](ARCHITECTURE.md) — [GESTION_ETAT.md](GESTION_ETAT.md)
