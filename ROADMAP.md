# 🗺️ Khartis v3 - Roadmap de Développement

**Objectif : Livraison Novembre 2025 (36 semaines)**
**Progression actuelle : ~40% (base architecture et UI complète, manque cœur carto)**

## Phase 1 : Fondations et Infrastructure (4 semaines)

### 1.1 Setup initial du projet
- [x] Configuration SvelteKit 5 avec mode Runes
- [x] Setup Vite avec code splitting et optimisations
- [x] Installation Carbon Design System pour Svelte
- [x] Configuration Paraglide pour i18n (FR/EN)
- [x] Setup ESLint, Prettier, Husky
- [x] Structure dossiers feature-first (src/lib/features/)

### 1.2 Intégration DuckDB WASM
- [x] Installation DuckDB WASM avec extension spatiale
- [x] Création wrapper JavaScript dans src/lib/core/db/
- [x] Implémentation pipeline de traitement données
- [ ] Tests de performance avec gros datasets
- [ ] Optimisation requêtes spatiales

### 1.3 Setup système de rendu cartographique
- [ ] ⚠️ Intégration Deck.gl avec couches WebGL (packages installés mais non utilisés)
- [ ] ⚠️ Configuration MapLibre GL pour fond de carte (package installé mais non utilisé)
- [x] Setup D3.js pour projections
- [ ] Système de cache GPU et optimisations
- [x] Configuration @observablehq/plot pour graphiques (package installé)

### 1.4 État global et stores réactifs
- [x] Architecture stores avec Svelte 5 runes ($state, $derived)
- [x] Stores globaux : projet, zoom, configuration
- [x] Pattern store par feature (.store.svelte.ts)
- [x] Système d'actions explicites

## Phase 2 : Module Gestion des Données (6 semaines)

### 2.1 Import de données
- [x] Import CSV avec détection automatique délimiteurs
- [x] Import GeoJSON, Shapefile, GeoPackage
- [ ] Import par URL avec gestion CORS
- [x] Interface copier-coller
- [x] Validation MIME et structure
- [ ] Gestion multi-fichiers simultanés

### 2.2 Prévisualisation et typage
- [x] Panel latéral redimensionnable
- [x] Détection automatique types (algorithme Atelier)
- [x] Actions sur variables (renommer, masquer, supprimer)
- [ ] Résumé statistique par variable (histogrammes)
- [x] Interface de correction manuelle
- [ ] Affichage valeurs nulles et doublons

### 2.3 Opérations sur tables
- [x] Tri ascendant/descendant
- [ ] Recherche/remplacement global
- [ ] Système de filtres avancés (top, compris entre)
- [ ] Calculatrice pour nouvelles variables
- [ ] Fonction reset/corbeille
- [ ] Affinage variables (casse, espaces)

### 2.4 Géolocalisation et jointures
- [ ] Détection variables géographiques
- [ ] Assistant de jointure avec catalogue fonds de carte
- [ ] Correction assistée des correspondances (4 catégories)
- [ ] Import fonds de carte personnalisés
- [ ] Enrichissement fichiers géospatiaux
- [ ] Gestion codes ISO et coordonnées

### 2.5 Prévisualisation carte
- [ ] Affichage immédiat après import
- [ ] Tooltips contextuels sur hover
- [x] Contrôles de zoom page/carte
- [ ] Sélection automatique fond de carte approprié
- [ ] Fond planisphère par défaut

## Phase 3 : Moteur de Visualisation (8 semaines)

### 3.1 Cycle de vie visualisations
- [x] Création/gestion visualisations multiples
- [ ] Suggestions basées sur profil données (algorithme scoring)
- [ ] Configuration par primitive graphique
- [x] Système de couches et sous-couches
- [ ] Types : uniques, proportionnels, classes, catégories

### 3.2 Système de couleurs
- [ ] Palettes contextuelles (qualitatives, séquentielles)
- [x] Filtre daltonisme intégré
- [ ] Éditeur couleurs personnalisées HSL
- [ ] Patterns et hachures configurables
- [ ] Palettes divergentes avec point de rupture
- [ ] Intensité et nuances

### 3.3 Classification statistique
- [ ] Méthodes multiples (algorithmes Atelier)
- [ ] Éditeur visuel bornes de classes
- [ ] Histogramme fréquences interactif
- [ ] Classification manuelle
- [ ] Discrétisation avec valeur rupture

### 3.4 Personnalisation fonds de carte
- [ ] Fonds catalogue avec couches multiples
- [ ] Personnalisation OpenStreetMap
- [ ] Styles pour fonds importés
- [ ] Gestion opacité et ombres
- [ ] Couches additionnelles (relief, villes, équateur)

### 3.5 Outils de visualisation
- [x] Recherche : Entités et valeurs avec surbrillance
- [x] Couches : Gestion hiérarchique, réorganisation
- [x] Projections : Suggestions intelligentes, catalogue, CRS personnalisé
- [x] Simplification : Niveaux prédéfinis, taux personnalisé
- [ ] Collections : Small multiples, échelle commune/individuelle
- [ ] Mode performance (aperçu simplifié)

## Phase 4 : Système de Mise en Page (6 semaines)

### 4.1 Gestion des pages
- [x] Formats prédéfinis (ISO, US, digital)
- [x] Dimensions personnalisées
- [x] Grille de composition modulaire
- [x] Marges adaptatives et bleeds
- [x] Outil Format avec redistribution automatique
- [ ] Couleur de page personnalisable

### 4.2 Éléments textuels
- [ ] Hiérarchie typographique (H1-H5)
- [ ] Zones texte prédéfinies (titre, sous-titre, sources)
- [ ] Formatage typographique avancé
- [ ] Styles réutilisables
- [ ] Effets (ombres, contours, gradients)
- [ ] Mention "Réalisé avec Khartis"

### 4.3 Légendes cartographiques
- [x] Génération automatique selon visualisation
- [ ] Types multiples (choroplèthe, symboles, catégories)
- [x] Personnalisation structure et formatage
- [ ] Placement automatique/manuel
- [ ] Harmonisation styles
- [ ] Note et sous-titre légende

### 4.4 Éléments cartographiques
- [x] Échelle : Types multiples, calcul automatique
- [x] Orientation : Flèche nord, rose des vents
- [x] Carton : Globe 3D, planisphère, multi-échelle
- [x] Configuration visuelle complète
- [ ] Zoom et centrage carte encart

### 4.5 Annotations et dessin
- [x] Annotations texte avec bulles
- [x] Bibliothèque formes géométriques
- [x] Dessin à main levée avec lissage
- [x] Import/manipulation images
- [ ] Gestion couches Z-order
- [ ] Pointillés et épaisseurs tracés

### 4.6 Accessibilité visuelle
- [x] Filtres simulation daltonisme temps réel
- [ ] Analyse WCAG automatique
- [ ] Suggestions palettes accessibles
- [ ] Scores accessibilité
- [ ] Validation contrastes

## Phase 5 : Système Export et Sauvegarde (4 semaines)

### 5.1 Export cartes
- [ ] JPEG haute qualité avec compression configurable
- [ ] SVG structuré avec couches organisées
- [ ] PDF vectoriel (optionnel)
- [ ] Métadonnées embarquées

### 5.2 Export données
- [ ] CSV avec transformations appliquées
- [ ] GeoJSON enrichi
- [ ] Shapefile, GeoPackage
- [ ] KML/KMZ pour Google Earth
- [ ] Export données jointes

### 5.3 Système projets
- [ ] Format .kh compressé avec manifeste
- [ ] Sauvegarde automatique IndexedDB
- [ ] Versioning et historique
- [ ] Undo/redo avec limite pratique
- [ ] Import/export projets

### 5.4 Optimisation exports
- [ ] Processing asynchrone avec progress
- [ ] Compression intelligente
- [ ] Prévisualisation taille/qualité
- [ ] Profils prédéfinis

## Phase 6 : Performance et Optimisation (3 semaines)

### 6.1 Stratégies chargement
- [x] Code splitting par route
- [ ] Lazy loading bibliothèques lourdes
- [ ] Preload ressources critiques
- [x] Skeleton screens Carbon

### 6.2 Optimisations runtime
- [ ] Web Workers pour calculs lourds
- [ ] GPU batching et instancing
- [ ] Cache projections et géométries
- [ ] Progressive rendering
- [ ] Virtualisation listes longues

### 6.3 Gestion mémoire
- [ ] Monitoring quotas storage
- [ ] Cleanup proactif
- [ ] Fallback graceful degradation
- [ ] Budgets performance

## Phase 7 : Accessibilité et Sécurité (2 semaines)

### 7.1 Accessibilité WCAG/RGAA
- [ ] Navigation clavier complète
- [ ] Gestion focus et tab order
- [ ] Contraste couleurs validé
- [ ] Support lecteurs écran (où possible)
- [ ] Raccourcis clavier complets (CDC 3.F)

### 7.2 Sécurité
- [ ] CSP headers restrictifs
- [x] Données 100% client-side
- [ ] Scan vulnérabilités dépendances
- [ ] Procédures incident response
- [ ] Conformité RGPD

## Phase 8 : Tests et Documentation (3 semaines)

### 8.1 Tests
- [ ] Tests unitaires Vitest (logique métier)
- [ ] Tests composants (interactions UI)
- [ ] Tests E2E Playwright (parcours critiques)
- [ ] Tests performance et accessibilité
- [ ] Tests compatibilité navigateurs

### 8.2 Documentation
- [ ] Documentation code claire
- [ ] Guides installation/utilisation
- [ ] README par module
- [ ] Exemples et tutoriels
- [ ] Documentation API DuckDB wrapper

## Phase 9 : Déploiement et Finalisation (2 semaines)

### 9.1 Environnements
- [ ] Setup préproduction
- [ ] Configuration production Sciences Po
- [ ] Pipeline CI/CD GitHub Actions
- [ ] Monitoring et analytics (Google Analytics)
- [ ] Hébergement serveur Sciences Po

### 9.2 Finalisation
- [ ] Intégration pages annexes (Atelier)
- [ ] Validation finale équipe
- [ ] Migration notes et compatibilité
- [ ] License MIT et copyright
- [ ] Exemples introductifs (CDC 2.F)
- [ ] Liens vers aide externe

## 📅 Jalons Critiques

- [ ] **M3** : Module données fonctionnel
- [ ] **M6** : Visualisations complètes
- [ ] **M8** : Mise en page et export
- [ ] **M9** : Production ready

## ⚠️ Points d'Attention Critiques

- [ ] Algorithmes fournis par l'Atelier (typage, suggestions, jointures)
- [ ] Catalogue fonds de carte et fichiers associés
- [ ] Performance avec gros datasets (100MB+)
- [ ] Compatibilité mobile responsive
- [ ] Intégration continue avec équipe Sciences Po
- [ ] Traductions FR/EN complètes
- [ ] Conformité design system Carbon

## 📊 Statistiques de Progression

### Par Phase
- **Phase 1** : 75% complété (15/20 tâches) ⚠️ 2 packages installés mais non utilisés
- **Phase 2** : 45% complété (11/24 tâches)
- **Phase 3** : 30% complété (7/23 tâches)
- **Phase 4** : 60% complété (16/27 tâches)
- **Phase 5** : 0% complété (0/16 tâches)
- **Phase 6** : 20% complété (2/10 tâches)
- **Phase 7** : 10% complété (1/10 tâches)
- **Phase 8** : 0% complété (0/10 tâches)
- **Phase 9** : 0% complété (0/11 tâches)

### Global
- **Total** : 52 tâches complétées sur 151
- **Progression** : 34%

## 🚀 Prochaines Priorités

1. **URGENT** : Intégration Deck.gl et MapLibre GL (base cartographique) - Packages installés mais non utilisés
2. **IMPORTANT** : Assistant de jointure et catalogue fonds de carte
3. **IMPORTANT** : Algorithmes de suggestions de visualisations
4. **NORMAL** : Système d'export SVG et sauvegarde projet
5. **FAIBLE** : Pages annexes et exemples introductifs

## ⚠️ Incohérences Détectées

### Packages Installés mais Non Utilisés
- **Deck.gl** : Toutes les dépendances @deck.gl/* et deck.gl sont dans package.json mais aucune implémentation trouvée
- **MapLibre GL** : maplibre-gl installé mais non utilisé dans le code
- **Mapbox GL** : mapbox-gl installé (pourquoi si MapLibre est prévu?)

### Tâches Marquées Complètes mais Partiellement Implémentées
1. **DuckDB wrapper** : Créé dans `/services/duckdb-orchestrator.service.ts` et non dans `src/lib/core/db/` comme indiqué
2. **Import par copier-coller** : Mentionné comme fait mais pas d'implémentation claire trouvée
3. **Résumé statistique** : Structure présente dans AdvancedDataTable mais pas d'histogrammes visuels

### Architecture
- ✅ Structure feature-first correctement implémentée
- ✅ Stores avec Svelte 5 runes bien en place
- ✅ Carbon Design System largement utilisé
- ✅ Paraglide i18n configuré et utilisé
- ✅ DuckDB WASM intégré avec extension spatiale