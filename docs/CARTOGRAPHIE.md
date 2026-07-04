# Cartographie thématique

> Concepts cartographiques et leur implémentation dans Khartis v3 : sémiotique, discrétisation, couleurs, projections, jointures et formats de géométrie.

**Voir aussi** : [ARCHITECTURE.md](ARCHITECTURE.md) · [MAP.md](MAP.md) · [DUCKDB.md](DUCKDB.md) · [VISUALISATIONS.md](VISUALISATIONS.md) · [FONDS_DE_CARTE.md](FONDS_DE_CARTE.md)

---

## Formats de géométrie

Comprendre les formats de géométrie est indispensable pour naviguer dans le code de rendu.

**GeoArrow** est le format pivot de Khartis. Les coordonnées sont stockées dans des `TypedArray` continus (un `Float64Array` par dimension), ce qui permet un upload GPU direct sans parsing côté CPU. Tous les fonds du catalogue sont en **GeoParquet** (Parquet + colonne GeoArrow).

**WKB (Well-Known Binary)** est le format interne de DuckDB Spatial (`ST_Read()`). DuckDB le retourne dans les Arrow tables sous une colonne `BLOB`. `geoarrow-deck-stream` le convertit en GeoArrow lors du parsing.

**GeoJSON** est le format d'export et de fallback. Il n'est jamais utilisé comme chemin de rendu principal car sa sérialisation/désérialisation JavaScript est coûteuse.

L'extension Arrow de la colonne géométrique (`geoarrow.polygon`, `geoarrow.multipolygon`, etc.) est lue par `extractGeometryInfo()` depuis les métadonnées du schéma Arrow pour choisir le bon parseur.

---

## `featureId` — liaison vertex / données

Quand `geoarrow-deck-stream` parse une Arrow table en buffers binaires, chaque vertex reçoit un `featureId` — l'index de la ligne Arrow d'origine. Ce champ est un `Uint32Array` parallèle au tableau de positions.

```typescript
// polyData.featureIds[i] = index de la ligne Arrow pour le vertex i
new SolidPolygonLayer({
  ...createSolidPolygonLayerProps(polyData),
  getFillColor: createPolygonFillColorAttribute(polyData, (featureId) => {
    const value = valueColumn.get(featureId); // accès O(1) dans Arrow
    return colorScale(value); // → [r, g, b, a]
  })
});
```

Sans `featureId`, il est impossible de retrouver à quelle entité appartient un vertex après projection ou découpage géométrique multipart.

---

## `modelMatrix` — mode orthographique

En mode orthographique, Deck.gl utilise une `OrthographicView` (coordonnées pixel). Les géométries projetées par `geoarrow-deck-stream` sont en coordonnées de projection (ex. `[0..960] × [0..600]`). La `modelMatrix` (Matrix4) centre et met à l'échelle cette sortie dans le viewport Deck.gl.

`projectionStore` (`map/stores/projection.store.svelte.ts`) recalcule cette matrice via `get_model_matrix_from_bbox(bbox, canvasSize)` à chaque changement de bbox ou de taille de canvas.

---

## Filtrage des Arrow tables

Deux niveaux de filtre JavaScript sur les Arrow tables en mémoire (pas via DuckDB SQL, pour éviter un aller-retour à chaque interaction) :

- `filterArrowTableByDataFilters(table, vizFilters, primitiveType)` — conditions de visualisation (`>=`, `<=`, `=`, `contains`, `between`, etc.) et filtre par type de primitive.
- `filterArrowTableByTableFilters(table, tableFilters)` — sélection de lignes de la data table (cumulable avec le premier).

Un troisième niveau GPU (`DataFilterExtension`) gère le filtre temporel côté Deck.gl. Voir [MAP.md](MAP.md).

---

## Détecteur sémiotique

**Fichier** : `commons/utils/semio-detector.utils.ts`

Chaque colonne est classée selon son **type sémiotique** (semioType) à partir des statistiques DuckDB. Ce classement guide la suggestion de visualisation.

| SemioType | Signification            | Détection                                        | Usage cartographique    |
| --------- | ------------------------ | ------------------------------------------------ | ----------------------- |
| `QTA`     | Quantitatif absolu       | Entiers élevés, grande étendue, mots pop/surface | Symboles proportionnels |
| `QTR`     | Quantitatif ratio        | Floats, plage 0–100, mots ratio/percent          | Choroplèthe             |
| `QL`      | Qualitatif               | Faible unicité, répétitions, texte               | Catégoriel              |
| `QLO`     | Qualitatif ordonné       | Mots-clés rang, intervalles ordonnés             | Catégoriel ordonné      |
| `geoid`   | Identifiant géographique | Haute unicité, mots id/code                      | Jointure                |
| `geolat`  | Latitude                 | Valeurs ±90, mots lat/latitude                   | Géolocalisation         |
| `geolon`  | Longitude                | Valeurs ±180, mots lon/longitude                 | Géolocalisation         |

Chaque détecteur produit un score (0–6.5). La colonne prend le semioType du score le plus élevé. Les noms de colonnes contenant des mots-clés d'identifiant (`id`, `fid`, `gid`, `oid`, `pk`, `code`, `iso`, `objectid`, `object_id`, `rowid`) sont classés comme `geoid` et exclus du ranking de suggestion.

---

## Les 4 types de visualisation

| Type           | Variable     | Géométries        | Layer Deck.gl                                          |
| -------------- | ------------ | ----------------- | ------------------------------------------------------ |
| `CHOROPLETH`   | QTR (ratio)  | Polygones, lignes | `SolidPolygonLayer` / `PathLayer` — couleur par classe |
| `PROPORTIONAL` | QTA (absolu) | Points, polygones | `ScatterplotLayer` — taille proportionnelle            |
| `CATEGORICAL`  | QL / QLO     | Toute             | Geometry layer — couleur par catégorie                 |
| `BIVARIATE`    | QTA + QL/QTR | Points, polygones | `ScatterplotLayer` — taille + couleur                  |

**Choroplèthe** : entités colorées selon un ratio. Les couleurs des catégories doivent être résolues depuis les labels complets de classification (pas depuis le preview limité `dataset.data`) pour éviter des catégories manquantes après import URL ou restauration de projet.

**Proportionnel** : la taille des symboles est proportionnelle à une valeur absolue. Sur polygones, les symboles sont rendus sur les centroïdes. L'échelle (linéaire, sqrt, log) est bornée entre `minSize` et `maxSize`.

**Catégoriel** : couleurs distinctes par catégorie. Pas de classement ordre.

**Bivarié** : combinaison taille + couleur pour deux variables. Le preset `symbols_proportional_double` (`proportionalType = DOUBLE`) rend deux séries de symboles proportionnels superposées.

---

## Discrétisation (classification)

**Fichier** : `commons/services/classification.service.ts` + `duckdb/macros/breaks.ts`

Les seuils sont calculés via des **macros SQL DuckDB** — pas de chargement des valeurs en JavaScript. Si une macro échoue, `calculateBreaks()` retourne `null` (pas de fallback local).

| Méthode          | Macro DuckDB     | Principe                                                 |
| ---------------- | ---------------- | -------------------------------------------------------- |
| `KMEANS`         | `kmeans()`       | Seuils naturels — distributions clumpées                 |
| `QUANTILES`      | `quantile()`     | Effectifs égaux par classe                               |
| `EQUAL_INTERVAL` | `equi_width()`   | Intervalles de même amplitude                            |
| `Q6`             | `q6()`           | 6 classes fixes (5e, 27.5e, 50e, 72.5e, 95e percentiles) |
| `NESTED_MEANS`   | `nested_means()` | Moyennes emboîtées récursives                            |
| `HEAD_TAIL`      | `headtail2()`    | Head/tail breaks — distributions à forte queue           |
| `MANUAL`         | (aucune)         | Bornes saisies manuellement                              |

**Pipeline** : `calculateBreaks()` → min/max via DuckDB → macro → `round_thresholds()` (arrondi lisible) → COUNT par classe (un seul `CASE WHEN`) → `BreaksResult { breaks[], counts[], min, max }`.

**Extraction du résultat** : les macros retournent une `LIST<DOUBLE>` via la bibliothèque `@uwdata/flechette`. Utiliser le helper `toIterableValues(raw)` qui gère `Array`, `TypedArray`, et tout itérable. Ne jamais tester `Array.isArray()` seul : une `Float64Array.subarray()` (retour normal d'une `DirectBatch` sans null) retournerait `false` et serait à tort rejetée.

**Cache** : `breaksCache` (Map, 50 entrées max) évite les requêtes redondantes sur simple changement de style.

---

## Génération de couleurs (espace Oklch)

**Fichier** : `commons/services/classification.service.ts` — `generateColorsForBreaks()`

Toutes les couleurs passent par `@ateliercartographie/ok-palette` en espace **Oklch** (perceptuellement uniforme). Ne jamais générer de rampes manuellement.

| Type de palette  | Usage                              | Construction                                   |
| ---------------- | ---------------------------------- | ---------------------------------------------- |
| **Séquentielle** | Choroplèthe (QTR), proportionnel   | `sequential(colorStart, colorEnd, numClasses)` |
| **Divergente**   | Choroplèthe avec valeur de rupture | `divergentSequential(colorA, colorB, steps)`   |
| **Qualitative**  | Catégoriel                         | Palette prédéfinie (set1, set2, pastel, dark)  |

Les couleurs par défaut : séquentielle `#f7fbff` → `#08519c` ; divergente `#b2182b` ↔ `#2166ac`. L'option `contrast` active le mode accessibilité WCAG.

**Motifs hatch accessibles** : 10 formes via `@ateliercartographie/motif.js` + `RotatableFillStyleExtension`. Chaque motif est un atlas texture SVG → texture WebGL → `fillTexture` du `SolidPolygonLayer`. Activé via `patternId` dans `ClassificationConfig`.

---

## Suggestion de visualisation

**Fichier** : `commons/services/viz-suggester.service.ts`

L'algorithme complet — typage sémiologique des colonnes (QTA/QTR/QL/QLO/geoid/geolat/geolon/label), scoring normalisé, patterns, garde-fous de lisibilité et défauts appliqués — est documenté dans [SUGGESTION_VISUALISATION.md](SUGGESTION_VISUALISATION.md).

En résumé : chaque colonne est typée à partir des statistiques DuckDB et de lexiques fr/en, les patterns compatibles `primitive × type` sont scorés (confiance sémio × lisibilité), et les 3 meilleures suggestions sont proposées. La sélection d'une suggestion applique le preset complet du type cible (modes, primitives, style, mapping, classification adaptée à la distribution), puis des overrides spécifiques au pattern.

---

## Projections cartographiques

**Fichiers** : `commons/utils/projection.utils.ts` + `map/utils/proj4d3.ts`

19 projections intégrées via d3-geo + d3-geo-projection. 12 sont nommément référencées par le CDC :

| Nom                   | Usage                                   |
| --------------------- | --------------------------------------- |
| Mercator              | Web, fond OSM                           |
| Robinson              | Monde, usage général                    |
| Winkel Tripel         | Atlas mondial                           |
| Natural Earth         | Projection standard Atlas               |
| Équirectangulaire     | Données brutes, grille régulière        |
| Orthographique        | Globe                                   |
| Albers                | USA, projections thématiques régionales |
| Lambert Conformal     | Zones régionales                        |
| Stéréographique       | Pôles                                   |
| Azimutale Équivalente | Pôles, surfaces proportionnelles        |
| Aitoff                | Atlas elliptique                        |
| Mollweide             | Monde, surfaces proportionnelles        |

7 projections supplémentaires sont disponibles via le catalogue étendu : Gall-Peters, Equal Earth, Bonne, Armadillo, Atlantis, Bertin-1953, Interrupted Mollweide.

Une **catégorie « Nationale »** dans l'outil Projection associe chaque pays/zone à sa projection officielle via son code EPSG. Exemples : Europe → LAEA (EPSG:3035), France → Lambert-93 (EPSG:2154), Royaume-Uni → OSGB36 (EPSG:27700), Irlande → ITM (EPSG:2157), Suisse → Swiss Oblique Mercator (EPSG:2056). Le code complet vit dans `step-toolbar/tools/projections/data.ts` et `national-region-label.ts`.

**`proj4d3(proj4string)`** (`map/utils/proj4d3.ts`) crée un objet `GeoProjection` compatible d3-geo à partir d'une chaîne PROJ.4. Ce pont est nécessaire car `geoarrow-deck-stream` attend une interface d3-geo. Les noms PROJ.4 sans équivalent dans proj4.js (ex. `natearth2`) sont mappés manuellement vers des constructeurs d3-geo dans `D3_GEO_PROJECTION_MAP`.

**Projections composites** (DOM-TOM) : `FRANCE_DOM_TOM` = Lambert-93 principal + 6 encarts ultra-marins. Bounds et layout prédéfinis dans `static/basemaps/projection-presets.json`.

**Suggestion algorithmique** : Khartis suggère une projection selon l'emprise réelle des données (pas l'emprise du fond monde). Pour un dataset exclusivement ponctuel ou GPS, les suggestions sont calculées depuis les coordonnées des points, pas depuis l'emprise du fond.

---

## Jointure assistée

**Fichier** : `duckdb/orchestrator/join-ops.ts`

La jointure associe les données tabulaires (colonne identifiant) aux géométries du fond de carte (attributs normalisés). Quatre catégories de résultat :

| Statut           | Signification                        | Score Jaro-Winkler |
| ---------------- | ------------------------------------ | ------------------ |
| ✅ Jointes       | Correspondance exacte ou fuzzy haute | = 1.0              |
| ⚠️ À vérifier    | Score partiel                        | 0.85 – 0.99        |
| 🟠 Non uniques   | Plusieurs correspondances possibles  | —                  |
| ❌ Non reconnues | Aucune correspondance                | < 0.85             |

**Algorithme** :

1. Construction du cache de similarité : cross-join source × attributs fond avec `jaro_winkler_similarity(normalize_text_join(), 0.85)`.
2. `normalize_text_join()` normalise sans lowercase final (préserve la casse pour le matching).
3. Catégories dérivées du cache : exact (=1), partial (0.85–0.99), no_match.

`basemap_attributes.parquet` contient les attributs pré-normalisés (colonne `normalized`) pour éviter de re-normaliser à chaque requête. `invalidateSimilarityCache()` est appelé après toute correction utilisateur.

---

## Données manquantes

**Fichier** : `commons/stores/visualization.store.svelte.ts` — `MissingDataConfig`

Les entités sans valeur dans la colonne de mapping sont rendues avec une représentation distincte configurable :

| Propriété          | Options                                                   |
| ------------------ | --------------------------------------------------------- |
| `enabled` / `show` | Active la représentation et son affichage dans la légende |
| `shape`            | carré, cercle, triangle, croix                            |
| `size`             | en px                                                     |
| `color`            | picker couleur                                            |
| `opacity`          | 0–1                                                       |
| `pattern`          | motif hatch optionnel                                     |
| `label`            | texte affiché dans la légende                             |

La légende inclut automatiquement une entrée "Données manquantes" quand des entités sans valeur sont présentes.

---

## Fonds de carte — vue d'ensemble

Dans Khartis, **données et géométries sont séparées** :

- **Fond de carte** = géométries (GeoParquet colonne GeoArrow) + attributs (Parquet format long).
- **Données utilisateur** = CSV ou fichier géo avec valeurs par entité.
- **Jointure DuckDB** : identifiant fond ↔ identifiant données → Arrow table combinée.

**Catalogue** : 29 fonds (familles géographiques) multi-résolution (low/medium/high quand disponibles). Métadonnées dans `all-basemaps-metadata.json`. Attributs dans `all-basemaps-attributes.parquet` (chargé dans DuckDB uniquement lors d'une jointure).

**Fonds personnalisés** : GeoJSON, Shapefile ou GeoPackage importés à l'exécution. Pipeline d'import : `ST_Read()` → nettoyage géométrie → couches POLYGON/LINE/POINT + CENTROID. Voir [FONDS_DE_CARTE.md](FONDS_DE_CARTE.md) pour le format détaillé.

**Carte Facile (OSM)** : 6 styles MapLibre GL JSON (France/Monde × couleurs/niveaux-de-gris/satellite). Pour les données GPS, le fond OSM est superposé directement sans jointure.

---

## Annotations

**Fichiers** : `map/components/annotation-overlay.svelte` + `step-toolbar/tools/annotations/`

SVG overlay superposé à la carte (non géolocalisé — ancré à la page en coordonnées pixel). 4 types :

| Type      | Contenu                                    |
| --------- | ------------------------------------------ |
| `TEXT`    | Texte libre, police, taille, couleur       |
| `SHAPE`   | Flèche, ligne, cercle, rectangle, triangle |
| `DRAWING` | Tracé Bézier freehand                      |
| `IMAGE`   | Image importée (URL ou upload)             |

Stockées dans `annotations.store.svelte.ts`, incluses dans le snapshot projet et exportées dans le SVG.

---

## Simulation daltonisme

**Fichier** : `step-toolbar/tools/color-blindness/`

Filtre CSS sur le conteneur de la carte. **Simulation seulement — n'affecte pas l'export** :

| Mode (`ColorBlindnessType`) | Déficience simulée        |
| --------------------------- | ------------------------- |
| `PROTANOPIA`                | Insensibilité au rouge    |
| `DEUTERANOPIA`              | Insensibilité au vert     |
| `TRITANOPIA`                | Insensibilité au bleu     |
| `ACHROMATOPSIA`             | Vision en niveaux de gris |

Les palettes qualitatives proposent un filtre `Daltonisme` qui substitue les couleurs par des alternatives sûres, calculées via `COLORBLIND_SAFE_INDICES` dans `palette.constants.ts`.
