# Visualisations et outils — Guide développeur

> Parcours utilisateur, outils de viz et habillage. Lire ARCHITECTURE.md, MAP.md et CARTOGRAPHIE.md d'abord.

**Voir aussi** : [ARCHITECTURE](./ARCHITECTURE.md) — [CARTOGRAPHIE](./CARTOGRAPHIE.md) — [MAP](./MAP.md) — [PIPELINE_DONNEES](./PIPELINE_DONNEES.md) — [DUCKDB](./DUCKDB.md) — [LEGENDES](./LEGENDES.md)

---

## Les 3 étapes du parcours

```
Données → Visualisations → Habillage
```

Navigation libre entre étapes via 3 boutons principaux (gauche). Chaque étape a ses outils dédiés dans la barre d'outils (droite).

---

## Étape 1 — Données

### Import tabulaire [DATA-01]

**Formats** : CSV, TSV. Trois méthodes :

- Fichier local (upload)
- URL vers fichier hébergé
- Copier-coller

Détection automatique : séparateur, format numérique (virgule/point), en-tête (`csv-detector.ts`, 4 étapes).

### Import géographique [DATA-02]

**Formats** : Shapefile, GeoJSON, GeoPackage, GeoParquet, KML, KMZ, GPX.

Deux usages : (1) viz directe, ou (2) fond de carte pour données tabulaires.

### Typage des variables [DATA-04]

Détection automatique par colonne via `semio-detector.utils.ts` :

- **Texte** / **Numérique**
- Sous-type géographique (geoid, geolat, geolon)

L'utilisateur peut override manuellement.

### Contrôle du tableau [DATA-05a–h]

| Action                         | Description                                                           |
| ------------------------------ | --------------------------------------------------------------------- |
| Renommer / Masquer / Supprimer | Colonnes ou lignes                                                    |
| Statistiques                   | Histogramme, min/max, nulls, uniques                                  |
| Tri                            | Croissant / décroissant / alphabétique                                |
| Recherche                      | Recherche + remplacement sur table et carte                           |
| Filtres                        | `gte`, `lte`, `contains`, `equals`, `between`, `top_asc`, `empty`...  |
| Calculatrice                   | Nouvelle colonne par formule (moyenne, puissance, arrondi, concat...) |
| Corbeille                      | Suppression sélective                                                 |
| Reset                          | Rétablissement des données initiales                                  |

### Géolocalisation [DATA-06]

Deux méthodes :

- **Entités géographiques** : codes ISO, noms administratifs reconnus
- **Coordonnées** : colonnes lat/lon distinctes

Détection automatique, correction manuelle.

### Jointure [DATA-07]

Liaison données tabulaires ↔ fond de carte via identifiant commun.

**Suggestion** : proposition du fond le plus adapté selon taux de correspondance.

**Catalogue** : 111 fonds GeoParquet multi-résolution (France, Europe, Monde).

**Jointure assistée** [DATA-07c] : 4 catégories de résultat

- ✅ Jointes (vert) — correspondance exacte
- ⚠️ À vérifier (jaune) — Jaro-Winkler 0.85–0.99
- 🟠 Non uniques (orange) — plusieurs correspondances
- ❌ Non reconnues (rouge) — aucune correspondance

Correction possible dans le tableau. `invalidateSimilarityCache()` après correction.

**OpenStreetMap** [DATA-07e] : superposition OSM pour données GPS — pas de jointure, superposition directe.

### Enrichir un geo [DATA-08]

Workflow fichier geo importé en début : aperçu tabulaire → jointure assistée.

---

## Étape 2 — Visualisations

### Création [VIZ-01]

Une ou plusieurs viz par projet. Chaque viz = un calque sur la carte.

### Suggestion [VIZ-02a]

Basée sur géométrie + semioTypes + nombre de colonnes. 3 suggestions max. Score de correspondance.

**4 types de viz** :

| Type           | Usage                     | Variable            | Géométries     |
| -------------- | ------------------------- | ------------------- | -------------- |
| `choropleth`   | Aplats colorés            | QTR (ratio, 0–100%) | Polygon, Line  |
| `proportional` | Symboles proportionnels   | QTA (absolu)        | Point, Polygon |
| `categorical`  | Couleurs par catégorie    | QL / QLO            | Toute          |
| `bivariate`    | Taille + couleur (2 vars) | QTA + QL/QTR        | Point, Polygon |

### Paramétrage [VIZ-02b]

4 primitives (symbole, polygone, ligne, texte) : affichable, masquable, filtrable indépendamment. Réglages : taille, épaisseur, forme, couleur fond, couleur contour.

### Couleurs [VIZ-02c]

| Type                     | Usage                      | Familles                                |
| ------------------------ | -------------------------- | --------------------------------------- |
| **Qualitatives**         | Catégoriel                 | set1, set2, pastel, dark                |
| **Intensité**            | Nuances d'une teinte       | Teinte unique                           |
| **Palette séquentielle** | Choroplèthe, proportionnel | monochrome, bicolore, sépia (5 chacune) |
| **Palette divergente**   | Avec valeur de rupture     | rdbu, rdylgn, brbg, piyg, prgn          |
| **Motifs hatch**         | Accessibilité daltonisme   | 10 formes (diagonal, dots, cross...)    |

### Discrétisation [VIZ-02d]

Découpage de données continues en classes. 8 méthodes :

| Méthode              | Principe                                            |
| -------------------- | --------------------------------------------------- |
| `quantiles`          | Effectifs égaux par classe                          |
| `equal_interval`     | Intervalles de même amplitude                       |
| `jenks`              | Ruptures naturelles (k-means)                       |
| `q6`                 | 6 quantiles prédéfinis (5e, 27.5e, 50e, 72.5e, 95e) |
| `nested_means`       | Moyennes emboîtées récursives                       |
| `head_tail`          | Head/tail breaks (distributions lourdes)            |
| `standard_deviation` | Écart-type (classes centrées sur la moyenne)        |
| `manual`             | Bornes saisies manuellement                         |

Options : méthode + nombre de classes. **Valeur de rupture** : active la palette divergente, positionnable.

### Légende [VIZ-02e]

Générée automatiquement :

- Choroplèthe → rampe de couleurs + seuils
- Catégoriel → swatches discrètes
- Proportionnel → échelle de tailles
- Lignes → swatches de couleur ou d’épaisseur
- Textes → légendes de couleur et de taille dédiées
- Bivarié → combinaison compacte des segments nécessaires
- Motifs → swatches hatchées

---

## Outils de visualisation [VIZ-TOOLS]

Barre d'outils disponible aux étapes Visualisations et Habillage.

### Recherche [VIZ-TOOLS-a]

Recherche d'entité ou valeur. Highlight sur la carte. Parcours des résultats. DuckDB `normalize_text()` pour la correspondance.

### Calques [VIZ-TOOLS-b]

Chaque viz génère un calque avec sous-calques par primitive. Le fond de carte reste global et n'est plus dupliqué sous chaque visualisation.

Actions : affichage/masquage, renommer, dupliquer, supprimer, déplacer. Sous-calques : mêmes options.

Le panneau `Calques` expose explicitement 3 sections : `Fond de carte au-dessus`, `Visualisations`, `Fond de carte en dessous`.
L'ordre de la liste est l'ordre visuel attendu à l'intérieur de chaque section : l'élément le plus haut dans une section se rend au-dessus des éléments placés en dessous dans cette même section.
Les couches de fond sont séparées selon les groupes réellement respectés par le moteur : `foreground` du fond de carte en haut, visualisations au milieu, `background` du fond de carte en bas. Le drag-and-drop ne mélange pas ces groupes et l'interface doit l'expliquer clairement.
Les primitives de texte (`labels`, `texts`) conservent l'ordre produit par chaque visualisation : à l'intérieur d'une même visualisation elles restent au-dessus de ses géométries, et entre visualisations elles suivent strictement l'ordre affiché dans `Calques`. Les collisions entre `labels` et `texts` d'un même jeu de données sont calculées ensemble pour limiter les recouvrements entre visualisations superposées.

Collection : calques regroupés par facette.

### Projections [VIZ-TOOLS-c]

12 projections d3-geo : Mercator, Robinson, Winkel Tripel, Orthographique, Natural Earth, Équirectangulaire, Albers, Conique Conforme, Stéréographique, Azimutale Équivalente, Aitoff, Mollweide.

Projections composites : FRANCE_DOM_TOM (Lambert-93 + encarts ultra-marins), EUROPE_DOM_TOM.

Suggestions algorithmiques par emprise géographique. Catalogue exhaustif + code CRS WKT/PROJ.4 personnalisé. Paramètres : longitude, latitude, rotation.

### Simplification [VIZ-TOOLS-d]

| Type de fond | Approche                                                   |
| ------------ | ---------------------------------------------------------- |
| Catalogue    | 3 niveaux prédéfinis (fichiers GeoParquet low/medium/high) |
| Importé      | Ratio utilisateur via `simplify_and_clean()`               |
| OSM          | Impossible (tuiles vectorielles)                           |

### Collection / Facettes [VIZ-TOOLS-e]

Small multiples : chaque variable → une carte distincte. Création via sélection de plusieurs variables dans une primitive.

Options : échelle commune ou propre, nombre de colonnes, distribution.

**Chaque facette = full ThematicMap** (MapLibre + Deck.gl). Limite ~9 facets (8–16 WebGL2 contexts).

---

## Étape 3 — Habillage

Usage libre — pas de structure prédéfinie.

### Habillage prédéfini [HAB-01]

Dès création : titre, sous-titre, source, crédit, signature. Placeholder si vide (vierge = absent à l'export).

### Format [HAB-02a]

Formats prédéfinis (A4, A3, écran) + personnalisé pixels. Marges, couleur de page, grille d'alignement magnétique.

### Légende [HAB-02b]

Affichage/masquage par légende. Titre, sous-titre, note. Style : police, taille, couleur texte, arrière-plan.

### Indications géographiques [HAB-02c]

- **Échelle** : ligne ou boîte, unité (km/miles), couleur
- **Orientation** : flèche ou rose des vents
- **Carte en encart** : globe ou planisphère, taille, réutilisation des couleurs du fond principal

### Annotations [HAB-02d]

SVG overlay, ancrées page (non géolocalisées). 4 types :

- **Texte** : style prédéfini ou personnalisé
- **Forme** : flèche, ligne, rond, rectangle, triangle
- **Dessin** : tracé manuel Bézier
- **Image** : import jpg/png, placement libre

### Daltonisme [HAB-02e]

Simulation CSS (n'affecte pas l'export) : protanopie, deutéranopie, tritanopie.

---

## Personnalisation du fond [VIZ-07]

### Catalogue [VIZ-07a]

9 couches affichables/masquables/personnalisables : terre, mers, lacs, relief, frontières, villes, équateur, méridiens, graticules.

### Importé [VIZ-07b]

Personnalisation réduite : couleur de fond, contour (couleur, épaisseur, pointillés, opacité, ombre).

### OpenStreetMap [VIZ-07c]

6 styles MapLibre (France/Monde × couleurs/grayscale/satellite), sélectionnables via un rail horizontal de cartes. La bascule affiche `Monde` à gauche, `France` à droite, avec `Monde` sélectionné par défaut. Le changement France/Monde recadre la vue sur l'emprise correspondante. La désactivation du mode tuilé recentre la vue sur le fond de référence ou les données courantes. Calques toggleables : routes, étiquettes.

---

## Export [DL-01 à DL-03]

| Format        | Contenu                                                         |
| ------------- | --------------------------------------------------------------- |
| JPG bitmap    | Full HD / 2K / 4K — carte complète, avec ratio de page conservé |
| SVG vectoriel | Calques organisés par éléments et viz                           |
| CSV           | Données tabulaires (géo exclue)                                 |
| GeoJSON       | Données + géométrie                                             |
| .kh projet    | Fichier réimportable pour reprise                               |

---

## Flux d'intégration

```
Fichier → validateFile() → DuckDB → DatasetResult
  → Semio detection → Viz suggestion → VisualizationConfig
    → calculateBreaks() (DuckDB macros) → generateColorsForBreaks() (ok-palette)
      → Arrow table → createDeckLayers() → MapboxOverlay → GPU
```

**Stores principaux** :

- `datasetsStore` — jeux de données importés
- `visualizationStore` — configurations de viz (type, mapping, style, classification)
- `mapStyleStore` — fond de carte actif
- `annotationsStore` — annotations SVG overlay
- `legendStore` — légendes

**Points d'entrée** :

- `dataPipeline.processFile()` — import de fichier
- `vizSuggester.suggestVisualizations()` — suggestion de viz
- `calculateBreaks()` — discrétisation (8 méthodes)
- `generateColorsForBreaks()` — palette (séquentielle/divergente)
- `duckDBOrchestrator` — jointures, filtres, stats

---

**Voir aussi :** [ARCHITECTURE.md](./ARCHITECTURE.md) — [CARTOGRAPHIE.md](./CARTOGRAPHIE.md) — [MAP.md](./MAP.md) — [PIPELINE_DONNEES.md](./PIPELINE_DONNEES.md) — [DUCKDB.md](./DUCKDB.md) — [GUIDE_DEVELOPPEUR.md](./GUIDE_DEVELOPPEUR.md)
