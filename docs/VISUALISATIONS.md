# Visualisations et outils

> Parcours utilisateur en 3 étapes, outils de la barre latérale droite, personnalisation du fond, et export. Ce fichier couvre le **workflow** et le **mapping vers le code** — pour les concepts cartographiques (discrétisation, semioTypes, projections, couleurs), voir [CARTOGRAPHIE.md](CARTOGRAPHIE.md).

**Voir aussi** : [ARCHITECTURE.md](ARCHITECTURE.md) · [CARTOGRAPHIE.md](CARTOGRAPHIE.md) · [MAP.md](MAP.md) · [PIPELINE_DONNEES.md](PIPELINE_DONNEES.md) · [DUCKDB.md](DUCKDB.md) · [LEGENDES.md](LEGENDES.md)

---

## Les 3 étapes du parcours

```
Données  →  Visualisations  →  Habillage
```

Navigation libre entre les 3 étapes via les boutons principaux (gauche). `globalState.activeStep` suit l'étape courante. Chaque étape affiche un ensemble d'outils différent dans la barre latérale droite (`step-toolbar.svelte`).

---

## Étape 1 — Données

### Import de fichier

Trois méthodes d'entrée : fichier local, URL distante, copier-coller de texte tabulaire. Point d'entrée : `dataPipeline.processFile(file)` / `dataPipeline.processRemoteFile(url)` / `dataPipeline.processPastedData(csv)`.

Les formats supportés, la détection automatique CSV, et le routage vers DuckDB sont décrits dans [PIPELINE_DONNEES.md](PIPELINE_DONNEES.md).

### Contrôle du tableau de données

Opérations disponibles sur un dataset chargé via `duckDBOrchestrator` :

| Action                        | Méthode orchestrateur                               |
| ----------------------------- | --------------------------------------------------- |
| Renommer une colonne          | `renameColumn(table, old, new)`                     |
| Changer le type               | `changeColumnType(table, col, sqlType)`             |
| Supprimer une colonne         | `dropColumn(table, col)`                            |
| Supprimer des lignes          | `dropRows(table, rowIds)`                           |
| Colonne calculée              | `addCalculatedColumn(table, name, expression)`      |
| Tester une expression         | `testExpression(table, expression)`                 |
| Ajouter un filtre             | `addFilter(tableName, { column, operator, value })` |
| Supprimer les lignes filtrées | `deleteFilteredRows(tableName)`                     |

10 opérateurs de filtres sont supportés :

| Opérateur    | Sémantique                      |
| ------------ | ------------------------------- |
| `gte`        | `≥`                             |
| `lte`        | `≤`                             |
| `equals`     | `=`                             |
| `not_equals` | `≠`                             |
| `contains`   | `ILIKE` (insensible à la casse) |
| `between`    | encadrement `[a, b]`            |
| `top_asc`    | N plus petites valeurs          |
| `top_desc`   | N plus grandes valeurs          |
| `empty`      | `IS NULL` ou chaîne vide        |
| `not_empty`  | non vide                        |

`validateExpression()` dans `column-ops.ts` bloque les multi-statements, sous-requêtes et appels de fonctions dangereuses avant toute exécution.

### Géolocalisation

Deux modes détectés automatiquement puis sélectionnables manuellement :

- **Entités géographiques** : colonne identifiant (`geoid` semioType) → jointure avec le catalogue. Pipeline : `computeJoinStats()` → `applyJoinCorrections()` → `finalizeJoin()`.
- **Coordonnées GPS** : colonnes lat/lon (`geolat`/`geolon`) → mode OSM. `detectGPSColumns()` résout automatiquement depuis les noms de colonnes et les métadonnées sémiotiques.

### Jointure assistée

`duckDBOrchestrator.computeJoinStats(datasetId, basemap, geoColumn)` calcule les 4 catégories via le cache de similarité Jaro-Winkler :

| Catégorie     | Score         | Couleur UI |
| ------------- | ------------- | ---------- |
| Jointes       | = 1.0 (exact) | Vert       |
| À vérifier    | 0.85 – 0.99   | Jaune      |
| Non uniques   | multiple      | Orange     |
| Non reconnues | < 0.85        | Rouge      |

Corrections saisies dans le tableau → `applyJoinCorrections(datasetId, geoColumn, corrections)` → `invalidateSimilarityCache()`. La finalisation `finalizeJoin()` retourne `{ joinedBasemap, geoColumn, gpsMode, gpsColumns }`.

---

## Étape 2 — Visualisations

### Création d'une visualisation

`visualizationStore` gère la liste des `VisualizationConfig` actives. Chaque config porte : `type`, `mapping` (colonnes), `style`, `classification`, et les primitives (`symbol`, `polygon`, `line`, `text`).

### Suggestion automatique

`vizSuggester.suggestVisualizations(dataset)` retourne jusqu'à 3 suggestions classées par score. L'algorithme est décrit dans [CARTOGRAPHIE.md — Suggestion de visualisation](CARTOGRAPHIE.md). Fichier : `suggestion.service.ts`.

Sélectionner une suggestion (`suggestion-selection.ts`) applique un preset complet : type, modes, primitives, style, mapping initial, classification par défaut.

### Personnalisation par primitive

4 primitives indépendantes : `symbol`, `polygon`, `line`, `text`. Chacune est affichable/masquable/filtrable de façon indépendante. Les panels sont dans `visualization-tab/components/` :

| Primitive | Panel                    | Fichier       |
| --------- | ------------------------ | ------------- |
| Symboles  | `symbols-config.svelte`  | + `symbols/`  |
| Polygones | `polygons-config.svelte` | + `polygons/` |
| Lignes    | `lines-config.svelte`    |               |
| Textes    | `texts-config.svelte`    |               |

**Règle dual-write** : chaque modification doit écrire à la fois sur la primitive (`symbol.classification`) et sur le miroir legacy (`symbolClassification`). Toujours utiliser `visualizationStore.updatePrimitiveClassification(id, primitive, updates)`. Ne jamais mutater directement. Voir `.claude/rules/viz-primitive-state.md`.

### Discrétisation

La modale de discrétisation (`discretization-modal.svelte`) affiche les histogrammes et les seuils. Elle délègue le calcul à `calculateBreaks()` dans `classification.service.ts`, qui appelle les macros DuckDB et retourne un `BreaksResult { breaks[], counts[], min, max }`. Les 7 méthodes et leur macro SQL respective sont dans [CARTOGRAPHIE.md — Discrétisation](CARTOGRAPHIE.md).

### Filtre temporel (années)

`year-filter.svelte` + `year-filter.utils.ts` gèrent le filtre par année. Les valeurs distinctes sont récupérées depuis DuckDB (`SELECT DISTINCT year FROM table`). Le filtre s'applique via `DataFilterExtension` côté GPU — la Arrow table complète est passée à `createDeckLayers()` pour préserver les caches WeakMap. Voir [MAP.md — DataFilterExtension](MAP.md).

---

## Outils de la barre latérale (step-toolbar)

La barre `step-toolbar.svelte` affiche des outils contextuels selon l'étape. Chaque outil est implémenté dans `step-toolbar/tools/` via le pattern `createToolStore()`.

### Recherche

**Dossier** : `step-toolbar/tools/search/`

Recherche textuelle via `duckDBOrchestrator.searchInTable(tableName, query)` qui utilise les macros `search_macros`. Retourne `{ totalRows, matches: [{ row, column, snippet }] }`. Le highlight sur la carte est déclenché après 250 ms de debounce (constante locale dans `search.store.svelte.ts`).

### Calques

**Dossier** : `step-toolbar/tools/layers/`

Chaque visualisation génère un calque avec sous-calques par primitive. Le panneau expose 3 sections ordonnées :

```
Fond de carte au-dessus   ← couches foreground du basemap
Visualisations            ← viz dans l'ordre affiché
Fond de carte en dessous  ← couches background du basemap
```

Le drag-and-drop ne mélange pas ces groupes. Actions disponibles : affichage/masquage, renommage, duplication, suppression, réordonnancement. L'ordre de la liste correspond à l'ordre de rendu GPU (du haut de la liste = rendu par-dessus).

### Projections

**Dossier** : `step-toolbar/tools/projections/` + `visualization-tab/map-projection-selector.svelte`

12 projections intégrées via d3-geo + d3-geo-projection. Suggestions algorithmiques par emprise des données (`map-projection-availability.ts`). Projections composites (France DOM-TOM, Europe DOM-TOM) définies dans `static/basemaps/projection-presets.json`.

`proj4d3(proj4string)` (`map/utils/proj4d3.ts`) crée un objet `GeoProjection` compatible d3-geo à partir d'une chaîne PROJ.4 — bridge nécessaire car `geoarrow-deck-stream` attend une interface d3-geo.

Un choix explicite de projection prend le dessus sur la projection par défaut du fond de carte. Ce changement invalide le cycle de refresh des layers même si la famille ne change pas.

### Simplification

**Fichier** : `step-toolbar/tools/simplification/`

| Type de fond | Comportement                                                                |
| ------------ | --------------------------------------------------------------------------- |
| Catalogue    | 3 niveaux prédéfinis (low/medium/high GeoParquet)                           |
| Importé      | Ratio utilisateur → `simplify_and_clean(table, geom, tolerance)` via DuckDB |
| OSM          | Non disponible (tuiles vectorielles)                                        |

La simplification d'un fond importé crée une nouvelle Arrow table en DuckDB et rafraîchit tous les layers via `duckDBOrchestrator`.

### Facettes (small multiples)

**Dossier** : `step-toolbar/tools/facets/` + `visualization-tab/facets-adapter.svelte.ts`

Chaque facette est une `ThematicMap` complète (MapLibre + Deck.gl indépendants). Chaque facette = un contexte WebGL2. Les navigateurs limitent à 8–16 contextes simultanés ; Khartis applique une borne `MAX_FACETS = 16` (`step-toolbar/tools/facets/facets.store.svelte.ts`). Le viewport partagé est géré par `FacetSyncViewState`.

Options : échelle commune ou indépendante par facette, nombre de colonnes, distribution. `use-facets-variable-selection.svelte.ts` gère la sélection des variables par facette.

### Daltonisme

**Dossier** : `step-toolbar/tools/color-blindness/`

Filtre CSS sur le conteneur de la carte. 4 modes (`ColorBlindnessType`) : `PROTANOPIA`, `DEUTERANOPIA`, `TRITANOPIA`, `ACHROMATOPSIA`. **Simulation uniquement — n'affecte pas l'export.** Les palettes qualitatives proposent un filtre `Daltonisme` qui substitue les couleurs par `COLORBLIND_SAFE_INDICES` dans `palette.constants.ts`.

### Annotations

**Dossier** : `step-toolbar/tools/annotations/` + `map/components/annotation-overlay.svelte`

SVG overlay positionné `position: absolute` sur le conteneur viewer (non géolocalisé). 4 types :

| Type      | Contenu                                    |
| --------- | ------------------------------------------ |
| `TEXT`    | Texte libre, police, taille, couleur       |
| `SHAPE`   | Flèche, ligne, cercle, rectangle, triangle |
| `DRAWING` | Tracé Bézier freehand                      |
| `IMAGE`   | Image importée (URL ou upload)             |

Stockées dans `annotationsStore`. Incluses dans le snapshot projet via `persistenceRegistry` et exportées dans le SVG.

### Format de page

**Dossier** : `step-toolbar/tools/format/`

Sélection du format de page (A4, A3, écran, personnalisé en pixels), marges, couleur de fond de page, grille d'aide à l'alignement avec magnétisme. Les modifications déclenchent une redistribution automatique des éléments d'habillage.

### Indications géographiques

**Dossier** : `step-toolbar/tools/geo-indications/`

Trois types d'indications, chacun configurable séparément :

- **Échelle** : barre scalaire (ligne ou boîte), unité (km/miles), couleur. Calculée depuis la projection active.
- **Orientation** : flèche nord ou rose des vents, taille, couleur.
- **Carte en encart** : globe ou planisphère miniature indiquant la zone représentée. Réutilise les couleurs du fond principal.

### Légende

**Dossier** : `step-toolbar/tools/legend/`

Affichage/masquage par légende, édition du titre, sous-titre, note. Style commun (police, taille, couleur du texte, arrière-plan, opacité) appliqué à toutes les légendes. Voir [LEGENDES.md](LEGENDES.md) pour l'architecture du rendu SVG.

---

## Étape 3 — Habillage

### Format de page

`layoutStore` gère le format actif (A4, A3, écran, personnalisé en pixels) et les marges. `layoutStore.updateLayout(patch)` crée un snapshot undo. Le changement de format recalcule l'échelle de rendu.

### Légendes

`legendStore` synchronise les légendes visibles avec `visualizationStore`. Chaque légende peut avoir un titre, sous-titre, note. Style : police, taille, couleur du texte, arrière-plan. Les légendes sont générées SVG via les générateurs de `commons/components/legend/`. Voir [LEGENDES.md](LEGENDES.md) pour l'architecture SVG.

### Indications géographiques

- **Échelle** : barre scalaire en km ou miles, calculée depuis la projection active.
- **Orientation** : flèche nord ou rose des vents.
- **Carte en encart** : globe ou planisphère miniature indiquant la zone représentée.

### Personnalisation du fond de carte

#### Fonds catalogue

9 couches configurables en deux groupes :

| Groupe       | Couches                                           |
| ------------ | ------------------------------------------------- |
| `background` | Terre, mers, lacs, relief                         |
| `foreground` | Frontières, rivières, équateur, méridiens, villes |

Les sections Lacs/Rivières et Villes sont désactivées si le fond actif ne fournit pas les géométries correspondantes. Chaque couche expose : visible, couleur, opacité, épaisseur.

**Panel** : `visualization-tab/customize-basemap.svelte` + `visualization-tab/components/basemap-layers/`

#### Fonds importés

Personnalisation réduite : couleur de fond, contour (couleur, épaisseur, pointillés, opacité, ombre).

#### OpenStreetMap

6 styles MapLibre GL JSON (France/Monde × couleurs/niveaux-de-gris/satellite). La sélection est gérée par `tiled-basemap-selection.ts` + `osm-basemap-sync.ts`. Calques toggleables : routes, étiquettes. Le changement France ↔ Monde recadre la vue sur l'emprise correspondante. La désactivation du mode OSM recentre sur le fond de référence ou les données courantes.

**Synchronisation** : `osm-basemap-sync.ts` maintient la cohérence entre `mapStyleStore` et l'état MapLibre GL.

---

## Export

| Format        | Contenu                                                        | Service                                                  |
| ------------- | -------------------------------------------------------------- | -------------------------------------------------------- |
| JPG bitmap    | Full HD / 2K / 4K, ratio de page conservé                      | `exportMapToJpg()` (`header/services/export.service.ts`) |
| SVG vectoriel | Calques organisés par viz, annotations et habillage inclus     | `exportMapToSvg()`                                       |
| CSV           | Données tabulaires (colonne géo exclue)                        | `exportData(format='csv')`                               |
| GeoJSON       | Données + géométries jointes                                   | `exportData(format='geojson')`                           |
| `.kh` projet  | Archive autoportante (voir [GESTION_ETAT.md](GESTION_ETAT.md)) | `projectStore.exportProject()`                           |

L'export SVG produit un document structuré par groupes (`khartis-layer-page`, `khartis-layer-visualizations`, `khartis-layer-legend`, `khartis-layer-geo-indications`, `khartis-layer-annotations`). Les couches Deck.gl connues sont sérialisées en primitives SVG éditables (`path`, `circle`, `text`) quand leurs attributs sont disponibles. Les textes d'habillage et d'annotation sont exportés en `<text>` SVG natif à partir du layout DOM calculé, sans `foreignObject`.

Les fonds MapLibre/OSM restent capturés en `<image>` PNG dans le SVG, car le rendu tuilé WebGL ne peut pas être reconstruit fidèlement en primitives SVG locales. Pendant cette capture, les couches Deck.gl sont temporairement masquées puis restaurées afin d'éviter de dupliquer les visualisations raster et vectorielles. Les annotations image restent aussi des `<image>`.

---

## Flux complet de bout en bout

```
Upload fichier
  → dataPipeline.processFile()         (PIPELINE_DONNEES.md)
  → DuckDB: analyse + stats            (DUCKDB.md)
  → datasetsStore.addDataset()
  → semio-detector: semioTypes/scores  (CARTOGRAPHIE.md)
  → vizSuggester.suggest()             (CARTOGRAPHIE.md)
  → VisualizationConfig créée
  → calculateBreaks() [DuckDB macros]  (CARTOGRAPHIE.md)
  → generateColorsForBreaks() [ok-palette]
  → duckDBOrchestrator.getArrowTable() (DUCKDB.md)
  → filterArrowTable()                 (MAP.md)
  → createDeckLayers()                 (MAP.md)
  → MapboxOverlay / OrthographicView   (MAP.md)
  → GPU render
```

---

## Stores impliqués

| Store                           | Rôle                                                       |
| ------------------------------- | ---------------------------------------------------------- |
| `datasetsStore`                 | Datasets chargés + colonnes enrichies                      |
| `visualizationStore`            | Configs viz actives (type, mapping, style, classification) |
| `mapStyleStore`                 | Fond de carte actif + couches visibles                     |
| `annotationsStore`              | Annotations SVG overlay                                    |
| `legendStore`                   | Légendes actives + style                                   |
| `layoutStore`                   | Format de page, marges                                     |
| `globalState` / `globalActions` | Étape active, outil actif, zoom                            |
