# Khartis v3 - Suivi d'avancement

> Dernière mise à jour : 22 janvier 2026 - 18h30

---

## Légende des statuts

| Statut | Signification                                    |
| ------ | ------------------------------------------------ |
| ✅     | Fonctionnel et connecté                          |
| ⚠️     | Partiellement implémenté                         |
| 🔌     | **UI prête, à connecter** (store/rendu manquant) |
| 🔧     | À implémenter                                    |

---

## Résumé global

| Section                      | %        | Reste à faire                                         |
| ---------------------------- | -------- | ----------------------------------------------------- |
| 2.A.1-2.A.4 Données (Import) | **100%** | ✅ Fonctionnel                                        |
| 2.A.5 Tableau de données     | **95%**  | 🔌 Recherche sur carte (UI prête)                     |
| 2.A.6-2.A.9 Jointure/Carte   | **100%** | ✅ Fonctionnel                                        |
| 2.B.1-2.B.2 Visualisations   | **85%**  | ✅ Suggestions→viz complet, légende overlay OK        |
| 2.B.3-2.B.4 Outils           | **75%**  | ✅ Basemap layers 85%, calques CRUD complet           |
| 2.C Habillage                | **55%**  | ✅ Légende overlay fonctionnel, annotations 🔌        |
| 2.D Téléchargement           | **85%**  | ✅ Quasi-complet                                      |
| 2.E Sauvegarde               | **100%** | ✅ Fonctionnel                                        |
| 2.F Exemples introductifs    | **90%**  | ⚠️ Vignettes manquantes                               |
| 2.G Aide                     | **40%**  | 🔧 Créer pages annexes + documentation                |
| 3. Spécifications techniques | **85%**  | 🔧 Responsive mobile/tablette + audit WCAG            |
| 4. Intégration UI/UX         | **95%**  | ✅ Fonctionnel                                        |
| 5. Déploiement               | **80%**  | 🔧 Config preprod + documentation code                |

### Avancement global : 82%

> ✅ **Note** : Tous les composants de personnalisation de visualisation sont maintenant connectés au store et au rendu Deck.gl/MapLibre :
> - **polygons-config.svelte** : fill/stroke colors, opacity, modes → store
> - **symbols-config.svelte** : size, shape, color → Deck.gl ScatterplotLayer
> - **lines-config.svelte** : thickness, dashed, color → Deck.gl PathLayer
> - **labels-config.svelte** : font, size, color, position → Deck.gl TextLayer
> - **fill-config.svelte** : fill color, opacity → store
> - **palette-selector.svelte** : sélection + interpolation couleurs → store → rendu
> - **basemap-layers-control.svelte** : toggle/opacity/colors → basemapLayersStore → MapLibre
> - **discretization-modal.svelte** : méthode, classes, breaks manuels → classification.service → store

---

## 2.A. Données

### 2.A.1-2.A.4 Import et typage — 100%

| Fonctionnalité                                                         | Statut |
| ---------------------------------------------------------------------- | ------ |
| Chargement fichier CSV depuis appareil                                 | ✅     |
| Import via lien URL                                                    | ✅     |
| Import par copier-coller (nommé "Tableau collé")                       | ✅     |
| Reconnaissance codes géographiques (ISO2, ISO3, country, region, city) | ✅     |
| Reconnaissance coordonnées lat/lon                                     | ✅     |
| Import Shapefile                                                       | ✅     |
| Import GeoJSON                                                         | ✅     |
| Import GeoPackage                                                      | ✅     |
| Import via lien URL (geo)                                              | ✅     |
| Fichiers ZIP contenant shapefiles                                      | ✅     |
| Identification comme jeu de données                                    | ✅     |
| Nommage par défaut (nom fichier)                                       | ✅     |
| Duplication/Suppression de jeu de données                              | ✅     |
| Détection automatique type texte/numérique                             | ✅     |
| Sous-type géographique détecté                                         | ✅     |
| Changement de type par l'utilisateur                                   | ✅     |
| Codes NUTS (régions européennes)                                       | ✅     |

### 2.A.5 Tableau de données — 95%

| Fonctionnalité                                                                  | Statut | Note                    |
| ------------------------------------------------------------------------------- | ------ | ----------------------- |
| Panneau latéral taille variable                                                 | ⚠️     |                         |
| Défilement lignes (scroll virtuel avec buffer)                                  | ✅     |                         |
| Agrandissement taille prédéfinie                                                | ✅     |                         |
| Code graphique par type de colonne                                              | ✅     |                         |
| Menu déroulante au clic (3 points)                                              | ✅     |                         |
| Changer le type / Affiner / Renommer / Masquer / Supprimer                      | ✅     |                         |
| Résumé statistique (uniques, nulls, doublons, histogramme, min/max)             | ✅     |                         |
| Tri croissant/décroissant                                                       | ✅     |                         |
| Barre de recherche + navigation résultats                                       | ✅     |                         |
| Recherche sur carte (mise en lumière)                                           | 🔌     | UI prête, highlight map |
| Rechercher/remplacer (Jaro-Winkler fuzzy matching)                              | ✅     |                         |
| Filtres multiples avec opérateurs complets                                      | ✅     |                         |
| Calculatrice (8 fonctions: AVG, SUM, MIN, MAX, POWER, ROUND, CONCAT, SUBSTRING) | ✅     |                         |
| Suppression variables/lignes avec avertissement                                 | ✅     |                         |
| Réinitialisation données (recharge depuis fichier original)                     | ✅     |                         |

### 2.A.6-2.A.9 Géolocalisation et Jointure — 100%

| Fonctionnalité                                                               | Statut |
| ---------------------------------------------------------------------------- | ------ |
| Reconnaissance auto variables geo                                            | ✅     |
| Définition référence géographique                                            | ✅     |
| Validation GPS (détection inversion lat/lon)                                 | ✅     |
| Liaison données tabulaires à fond de carte                                   | ✅     |
| Suggestions basées sur analyse (scoring algorithmique)                       | ✅     |
| Vignettes avec taux correspondance (ProgressBar)                             | ✅     |
| Catalogue de fonds de carte (6 basemaps)                                     | ✅     |
| Moteur de recherche + auto-complétion                                        | ✅     |
| Filtres par années (tri descendant, compteur)                                | ✅     |
| Jointure assistée (4 catégories: JOINED, TO_VERIFY, DUPLICATE, UNRECOGNIZED) | ✅     |
| Import fichier géographique comme fond                                       | ✅     |
| Superposition OpenStreetMap (couche raster séparée)                          | ✅     |
| Enrichir un fichier géographique                                             | ✅     |
| Carte visible au centre                                                      | ✅     |
| Fond par défaut suggéré (auto-select meilleur score)                         | ✅     |
| Infobulles au survol (connecté à Deck.gl, max 10 entrées)                    | ✅     |
| Boutons de zoom (MapLibre + Deck.gl sync)                                    | ✅     |
| Détection codes NUTS                                                         | ✅     |
| Formulaire suggestion nouveau fond de carte                                  | ✅     |

---

## 2.B. Visualisations

### 2.B.1 Création de visualisations — 95%

| Fonctionnalité                         | Statut | Note                              |
| -------------------------------------- | ------ | --------------------------------- |
| Visualisations multiples               | ✅     |                                   |
| Nommage par défaut avec incrémentation | ✅     |                                   |
| Renommer/dupliquer/supprimer           | ✅     |                                   |
| Choix jeu de données                   | ✅     |                                   |
| Création auto visualisation            | ✅     | handleCreateVisualization complet |
| Connexion au visualizationStore        | ✅     | Multi-colonnes gérées             |

### 2.B.2.a Suggestions de visualisations — 95%

| Fonctionnalité                      | Statut | Note                                        |
| ----------------------------------- | ------ | ------------------------------------------- |
| Service viz-suggester.ts (21 types) | ✅     | Service complet, 11+ tests                  |
| UI connectée au service             | ✅     | Suggestions affichées dans UI               |
| Créer viz depuis suggestion         | ✅     | mapSuggestionToType() mappe les 21 IDs      |
| Vignette aperçu générique           | ⚠️     | 50%                                         |
| Limite propositions + afficher plus | ✅     |                                             |
| Score correspondance affiché        | 🔧     |                                             |

### 2.B.2.b Paramétrer la visualisation — 85%

| Fonctionnalité                  | Statut | Note                                                 |
| ------------------------------- | ------ | ---------------------------------------------------- |
| Réglages par primitives         | ✅     | Tous connectés (polygons, symbols, lines, labels)    |
| Afficher/masquer primitives     | ✅     | Accordéon toggle connecté au store                   |
| Taille, épaisseur, forme        | ✅     | Sliders connectés via callbacks                      |
| Filtrer primitives              | ⚠️     | 50%                                                  |
| configure-visualization → store | ✅     | Mapping + classification + style connectés           |
| Connexion au rendu Deck.gl      | ✅     | Store synchronisé, breaks calculés, rendu fonctionne |

### 2.B.2.c Personnalisation des couleurs — 40%

| Fonctionnalité                    | Statut | Note                          |
| --------------------------------- | ------ | ----------------------------- |
| Panneau dédié couleurs            | ✅     |                               |
| Filtre daltonisme (9 types UI)    | 🔌     | UI prête, CSS filter manquant |
| Intensité (nuances)               | ✅     |                               |
| Couleur personnalisée HSL         | ✅     |                               |
| Code hexadécimal                  | ✅     |                               |
| Suggestions palettes qualitatives | 🔧     |                               |
| Palettes séquentielles            | ✅     | Connecté à Deck.gl            |
| Palettes divergentes              | 🔧     |                               |
| Motifs personnalisables           | 🔧     |                               |
| Inversion palette                 | ✅     |                               |

### 2.B.2.d Discrétisation — 75%

| Fonctionnalité                 | Statut | Note                                          |
| ------------------------------ | ------ | --------------------------------------------- |
| Sélection méthode              | ✅     | UI connectée au service classification        |
| Nombre de classes              | ✅     | UI connectée au service classification        |
| Equal-interval                 | ✅     | Algo DuckDB appelé via classification.service |
| Quantile                       | ✅     | Algo DuckDB appelé via classification.service |
| Std Deviation                  | ✅     | Algo DuckDB appelé via classification.service |
| Manuel                         | ⚠️     | UI fonctionne, validation manquante           |
| Jenks (fallback sur Quantiles) | ✅     | Utilise kmeans DuckDB                         |
| Saisie manuelle bornes         | ⚠️     | 75% - fonctionne mais pas de validation       |
| Valeur de rupture (divergent)  | 🔌     | UI prête, rendu palette manquant              |
| Diagramme fréquences           | ✅     | Histogramme SVG complet                       |
| Définition méthode (aide)      | ✅     | getMethodDescription() pour chaque méthode    |
| calculateBreaks() appelé       | ✅     | Service classification.service.ts fonctionnel |

### 2.B.2.e Légende — 90%

| Fonctionnalité                            | Statut | Note                                  |
| ----------------------------------------- | ------ | ------------------------------------- |
| Légende configurable dans panneau latéral | ✅     | UI+Store complets, 2 onglets          |
| Légende superposée sur la carte           | ✅     | legend-overlay.svelte intégré         |
| Style (police, taille, fond, opacité)     | ✅     | Connecté via legendStore              |
| Position (4 coins)                        | ✅     | LegendPosition enum                   |
| Légende auto-créée lors de visualisation  | 🔧     | À implémenter                         |

### 2.B.3 Personnaliser le fond de carte — 60%

| Fonctionnalité                            | Statut | Note                                       |
| ----------------------------------------- | ------ | ------------------------------------------ |
| Styles OSM prédéfinis (5 styles MapLibre) | ✅     | Blank, Positron, Dark, Voyager, Liberty    |
| Épaisseur contours (basemap)              | ✅     | Connecté via basemapLayersStore            |
| Opacité (basemap)                         | ✅     | Connecté via basemapLayersStore            |
| Couches multiples                         | ✅     | 9 couches configurables                    |
| Afficher/masquer couches                  | ✅     | Toggle connecté à basemapLayersStore       |
| Couleur contours                          | ✅     | Color picker connecté                      |
| Personnalisation par couche               | ✅     | Chaque couche a ses propres paramètres     |
| Couleur fond polygones                    | ✅     | fillColor connecté au store                |
| Pointillés                                | 🔧     |                                            |
| Ombre portée                              | 🔧     |                                            |

#### 2.B.3.a Couches additionnelles — 85%

| Couche               | Store | UI  | Rendu | Note                           |
| -------------------- | ----- | --- | ----- | ------------------------------ |
| Terre (earth)        | ✅    | ✅  | ✅    | createTerreLayers() complet    |
| Mers/Océans          | ✅    | ✅  | ✅    | createMersLayer() complet      |
| Équateur             | ✅    | ✅  | ✅    | createEquateurLayer() complet  |
| Méridiens/Parallèles | ✅    | ✅  | ✅    | createMeridiensLayer() complet |
| Frontières/Limites   | ✅    | ✅  | ✅    | createFrontieresLayer() complet|
| Lacs et rivières     | ✅    | ✅  | ✅    | GeoJSON chargés async          |
| Relief               | ✅    | ✅  | 🔧    | Stub (DEM data manquant)       |
| Villes/Capitales     | ✅    | ✅  | ✅    | 4 symboles, 4 catégories       |

### 2.B.4.a Recherche — 50%

| Fonctionnalité                  | Statut | Note                         |
| ------------------------------- | ------ | ---------------------------- |
| Barre de recherche entités      | ✅     | Fonctionne (données fixture) |
| Navigation résultats            | ✅     | Prev/Next fonctionnels       |
| Mise en lumière carte           | 🔧     | Aucune intégration carte     |
| Remplacer                       | ⚠️     | 50%                          |
| Options avancées (regex, casse) | ⚠️     | 30%                          |

### 2.B.4.b Calques — 95%

| Fonctionnalité                    | Statut | Note                          |
| --------------------------------- | ------ | ----------------------------- |
| Calque par visualisation          | ✅     |                               |
| Sous-calques par primitive        | ✅     |                               |
| Code couleur + icône              | ✅     |                               |
| Afficher/masquer                  | ✅     |                               |
| Déplacement calques (Drag & Drop) | ✅     |                               |
| Renommer                          | ✅     | OverflowMenu + prompt         |
| Dupliquer                         | ✅     | OverflowMenu + store.duplicate|
| Supprimer                         | ✅     | OverflowMenu + confirm        |
| Raccourci paramétrage             | ⚠️     | 50% - handler stub            |

### 2.B.4.c Projections — 80%

| Fonctionnalité                          | Statut | Note                          |
| --------------------------------------- | ------ | ----------------------------- |
| Projection par défaut (Mercator)        | ✅     |                               |
| Pastille incitation                     | ✅     |                               |
| Suggestions projections (basées bounds) | ✅     |                               |
| Filtres catégories                      | ✅     | 3 catégories                  |
| Vue liste et grille                     | ✅     |                               |
| Catalogue (9 projections)               | ✅     | Rectang/Arrondie/Discontinue  |
| Code CRS (WKT/PROJ.4)                   | 🔌     | UI existe, pas de parsing CRS |
| Paramètres (lon, lat, rotation)         | ✅     | Sliders fonctionnels          |
| Réinitialisation paramètres             | ✅     |                               |
| Aperçu simplifié performance            | ✅     |                               |

### 2.B.4.d Simplification — 5%

| Fonctionnalité                    | UI  | Algo | Note                           |
| --------------------------------- | --- | ---- | ------------------------------ |
| 3 niveaux prédéfinis              | 🔌  | 🔧   | UI prête, algo stub (mock)     |
| Taux personnalisé                 | 🔌  | 🔧   | UI prête, algo stub (mock)     |
| Avertissement suppression entités | 🔌  | 🔧   | Données mockées                |
| Application sur géométries        | 🔧  | 🔧   | Douglas-Peucker non implémenté |

### 2.B.4.e Collection (Facettes) — 3%

| Fonctionnalité                | Statut |
| ----------------------------- | ------ |
| Collection small multiples    | 🔧     |
| Sélection plusieurs variables | 🔧     |
| Échelle commune/propre        | 🔧     |
| Disposition colonnes          | 🔧     |
| Pastille incitation sur icône | 🔧     |

---

## 2.C. Habillage — 35%

### 2.C.1 Habillage prédéfini — 40%

| Fonctionnalité                                  | Statut | Note                           |
| ----------------------------------------------- | ------ | ------------------------------ |
| Légende configurable (panneau séparé)           | 🔌     | UI prête, pas rendue sur carte |
| Éléments supprimables                           | ✅     |                                |
| Textes prédéfinis (4 styles)                    | ✅     |                                |
| Éléments déplaçables                            | ⚠️     | 70%                            |
| Placeholders textes (titre, sous-titre, source) | ✅     |                                |
| Légende auto-créée avec visualisation           | 🔧     |                                |
| Mention "Réalisé avec Khartis"                  | ✅     |                                |

### 2.C.2.a Format — 80%

| Fonctionnalité               | Statut | Note |
| ---------------------------- | ------ | ---- |
| Formats prédéfinis           | ✅     |      |
| Format personnalisé (pixels) | ✅     |      |
| Couleur page                 | ✅     |      |
| Marges                       | ✅     |      |
| Grille alignement            | ⚠️     | 30%  |
| Redistribution auto éléments | ✅     |      |
| Magnétisme (snapToGrid)      | 🔧     |      |

### 2.C.2.b Légende — 90%

| Fonctionnalité           | Statut | Note                              |
| ------------------------ | ------ | --------------------------------- |
| Édition contenu légendes | ✅     | Titre, sous-titre, note par item  |
| Afficher/masquer         | ✅     | Toggle dans UI + rendu conditionnel |
| Titre, sous-titre, note  | ✅     | Édition inline dans légende.svelte |
| Style (police, taille)   | ✅     | Onglet STYLE avec sliders         |
| Arrière-plan             | ✅     | Toggle + Color Picker HSL         |
| Opacité                  | ✅     | Slider 0-100%                     |
| Rendu overlay sur carte  | ✅     | legend-overlay.svelte intégré     |
| Pastille incitation      | ⚠️     | 20%                               |

### 2.C.2.c Indications géographiques — 60%

| Fonctionnalité                    | UI  | Rendu | Note                           |
| --------------------------------- | --- | ----- | ------------------------------ |
| Échelle (distance, unité)         | ✅  | ✅    |                                |
| Orientation flèche/rose des vents | ✅  | ✅    |                                |
| Taille, couleur orientation       | ✅  | ✅    |                                |
| Carte en encart (globe)           | 🔌  | 🔧    | UI prête, rendu non implémenté |
| Taille, couleur, zoom encart      | 🔌  | 🔧    | UI prête, rendu non implémenté |

### 2.C.2.d Annotations — 15%

| Fonctionnalité                           | UI  | Store | Rendu | Note                             |
| ---------------------------------------- | --- | ----- | ----- | -------------------------------- |
| Texte + placement zone texte             | 🔌  | 🔌    | 🔧    | UI+Store prêts, overlay manquant |
| Style prédéfini/personnalisé (4 styles)  | 🔌  | 🔌    | 🔧    | UI+Store prêts, overlay manquant |
| Formes (flèche, rectangle, cercle, etc.) | 🔌  | 🔌    | 🔧    | UI+Store prêts, overlay manquant |
| Réglages forme                           | 🔌  | 🔌    | 🔧    | UI+Store prêts, overlay manquant |
| Dessin (ligne, zone)                     | 🔌  | 🔌    | 🔧    | UI+Store prêts, overlay manquant |
| Image (jpg, png, gif, svg, webp)         | 🔌  | 🔌    | 🔧    | UI+Store prêts, overlay manquant |
| Placement, taille, opacité image         | 🔌  | 🔌    | 🔧    | UI+Store prêts, overlay manquant |
| Lissage, pointillé                       | 🔌  | 🔌    | ⚠️    |                                  |

### 2.C.2.e Déficiences visuelles — 5%

| Fonctionnalité                  | UI  | Rendu | Note                          |
| ------------------------------- | --- | ----- | ----------------------------- |
| Simulation daltonisme (9 types) | 🔌  | 🔧    | UI prête, CSS filter manquant |
| Filtre CSS/SVG                  | 🔧  | 🔧    | Non implémenté                |
| Export sans filtre              | 🔧  | 🔧    |                               |

---

## 2.D. Téléchargement — 85%

### 2.D.1 Carte — 90%

| Fonctionnalité                       | Statut | Note                         |
| ------------------------------------ | ------ | ---------------------------- |
| Bouton menu présent toutes étapes    | ✅     |                              |
| 3 onglets (Projet, Carte, Données)   | ✅     |                              |
| Export JPG (1920x1080)               | ✅     | Avec watermark Khartis       |
| Export SVG (avec groupes par calque) | ✅     | Groupes par visualization ID |
| Calques organisés SVG                | ✅     |                              |

### 2.D.2 Données — 85%

| Fonctionnalité               | Statut | Note                       |
| ---------------------------- | ------ | -------------------------- |
| Export CSV                   | ✅     | DuckDB intégré, BOM Excel  |
| Export GeoJSON               | ✅     | Feature collection         |
| Export CSV avec géo (WKT)    | ✅     | Conversion WKT complète    |
| Export fond de carte utilisé | 🔧     | Par design (seulement .kh) |
| Export résultats jointure    | ✅     | Via export data standard   |

### 2.D.3 Projet — 100%

| Fonctionnalité     | Statut |
| ------------------ | ------ |
| Fichier projet .kh | ✅     |
| Réimport projet    | ✅     |

---

## 2.E. Sauvegarde — 95%

| Fonctionnalité                     | Statut |
| ---------------------------------- | ------ |
| Enregistrement auto (30s debounce) | ✅     |
| Nommage + date modification        | ✅     |
| Accès écran accueil                | ✅     |
| Duplication sauvegarde             | ✅     |
| Téléchargement .kh                 | ✅     |
| Réimport projet                    | ✅     |
| Historique undo/redo (store + UI)  | ✅     |
| Sauvegarde IndexedDB               | ✅     |

---

## 2.F. Exemples introductifs — 90%

| Fonctionnalité       | Statut | Note                                  |
| -------------------- | ------ | ------------------------------------- |
| 5 projets exemples   | ✅     | Population, Cities, World, GDP, Flows |
| Vignettes            | ⚠️     | Référencées mais fichiers manquants   |
| Filtres par critères | ✅     | 6 catégories                          |
| Chargement data      | ✅     | Fetch async avec gestion erreurs      |

---

## 2.G. Aide et pages annexes — 40%

| Fonctionnalité                     | Statut |
| ---------------------------------- | ------ |
| Textes d'accompagnement (944 clés) | ✅     |
| Facilité modification (Paraglide)  | ✅     |
| Tooltips                           | ⚠️ 80% |
| Liens vers aide externe            | ⚠️ 50% |
| Pages annexes (mentions légales)   | ⚠️ 20% |
| Documentation utilisateur complète | 🔧     |

---

## 3. Spécifications techniques — 85%

### Technologies — 95%

| Technologie                  | Statut |
| ---------------------------- | ------ |
| DuckDB WASM + SPATIAL        | ✅     |
| Deck.gl (GeoArrow layers)    | ✅     |
| d3.js (projections)          | ✅     |
| Carbon Design System         | ✅     |
| SvelteKit 5 + Runes          | ✅     |
| Paraglide JS (i18n)          | ✅     |
| MapLibre                     | ✅     |
| @observablehq/plot           | ✅     |
| chroma.js                    | 🔧     |
| Analytics (Google Analytics) | 🔧     |

### Performances — 75%

| Fonctionnalité          | Statut |
| ----------------------- | ------ |
| Chargement rapide       | ✅     |
| Écrans loaders          | ✅     |
| Caching PWA (workbox)   | ✅     |
| Code splitting          | ⚠️ 80% |
| Virtualisation tableaux | ⚠️ 50% |

### Compatibilité — 90%

| Fonctionnalité                | Statut |
| ----------------------------- | ------ |
| Chrome, Firefox, Edge, Safari | ✅     |
| WebAssembly requis            | ✅     |
| IndexedDB requis              | ✅     |

### Responsive design — 30%

| Fonctionnalité                 | Statut |
| ------------------------------ | ------ |
| Adaptation desktop             | ✅     |
| Mobile toolbar (3 breakpoints) | ⚠️ 50% |
| Adaptation tablettes           | 🔧     |
| Adaptation mobile              | 🔧     |
| Breakpoints CSS harmonisés     | 🔧     |

### Accessibilité — 50%

| Fonctionnalité               | Statut |
| ---------------------------- | ------ |
| ARIA labels (46 occurrences) | ✅     |
| Navigation clavier (Carbon)  | ✅     |
| Focus ring (Carbon)          | ✅     |
| Audit WCAG AA                | 🔧     |
| Color contrast audit         | 🔧     |

### Raccourcis clavier — 100%

| Fonctionnalité                     | Statut |
| ---------------------------------- | ------ |
| 1-2-3 (navigation onglets toolbar) | ✅     |
| ⌘+/-/0 (zoom carte/page)           | ✅     |
| ⌥Z (toggle zoom mode)              | ✅     |
| Escape (fermer modales)            | ✅     |
| ⇧⌘N (nouveau projet)               | ✅     |
| ⇧⌘O (ouvrir projet)                | ✅     |
| ⌘S (sauvegarde)                    | ✅     |

### Multilinguisme — 100%

| Fonctionnalité                           | Statut |
| ---------------------------------------- | ------ |
| Français + Anglais                       | ✅     |
| Changement via menu                      | ✅     |
| Détection auto langue premier load       | ✅     |
| Compatibilité traduction auto navigateur | ✅     |

### Sécurité — 95%

| Fonctionnalité              | Statut |
| --------------------------- | ------ |
| Données client-only         | ✅     |
| Pas de transmission externe | ✅     |
| Sanitization                | ✅     |

### Hébergement — 90%

| Fonctionnalité        | Statut |
| --------------------- | ------ |
| Build statique        | ✅     |
| PWA (manifest, icons) | ✅     |
| FTP ready             | ✅     |

### Licence — 100%

| Fonctionnalité | Statut |
| -------------- | ------ |
| MIT            | ✅     |

---

## 4. Intégration UI/UX — 95%

| Point CDC                           | Statut |
| ----------------------------------- | ------ |
| 4.A Parcours utilisateur (3 étapes) | ✅     |
| 4.B Design System (Carbon)          | ✅     |
| 4.C.1 En-tête (menu, nom projet)    | ✅     |
| 4.C.2 Barre d'outils                | ✅     |
| 4.C.3 Panneau latéral               | ✅     |
| 4.C.4 Visionneuse (carte + zoom)    | ✅     |
| 4.C.5 Fenêtres modales              | ✅     |
| 4.D Maquettes Figma intégrées       | ✅     |

---

## 5. Déploiement — 80%

| Point CDC                      | Statut |
| ------------------------------ | ------ |
| 5.A Environnement preprod/prod | ⚠️     |
| 5.B Documentation code         | ⚠️     |
| 5.C Maintenance                | 🔧     |
| GitHub repository              | ✅     |
| Build statique                 | ✅     |

---

### Avancement global : 82%

---

## Résumé des 🔌 (UI prête, à connecter)

### ✅ Blocage critique #1 résolu : configure-visualization.svelte

~~Le composant de 940 lignes utilise des `$state` locaux qui ne sont **jamais synchronisés** avec `visualizationStore`. Les changements sont perdus à l'unmount.~~

**Résolu** : Tous les composants de configuration utilisent maintenant des callbacks (`onStyleChange`, `onLabelsChange`, `onClassificationChange`, etc.) qui mettent à jour le `visualizationStore`. Le `basemap-layers-control.svelte` utilise directement `basemapLayersStore` avec `$derived` pour la lecture réactive.
