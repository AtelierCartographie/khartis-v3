# Khartis v3 - Suivi d'avancement

> Dernière mise à jour : 3 février 2026

## Avancement global : 85%

| Statut     | Nombre  | Pourcentage |
| ---------- | ------- | ----------- |
| ✅ Fait    | 255     | 81%         |
| ⚠️ Partiel | 21      | 7%          |
| ❌ À faire | 38      | 12%         |
| **Total**  | **314** |             |

### Par section

| Section             | Avancement |
| ------------------- | ---------- |
| 2.A Données         | 100%       |
| 2.B Visualisations  | 91%        |
| 2.C Habillage       | 63%        |
| 2.D Téléchargement  | 100%       |
| 2.E Sauvegarde      | 100%       |
| 2.F Exemples        | 62%        |
| 2.G Aide            | 50%        |
| 3. Specs techniques | 72%        |
| 4. Structure UI     | 93%        |
| 5. Déploiement      | 25%        |

---

## Légende

| Statut | Signification      |
| ------ | ------------------ |
| ✅     | Fait               |
| ⚠️     | Partiellement fait |
| ❌     | À faire            |

---

## 2.A. Données

### 2.A.1 Import tabulaire

| Fonctionnalité                                                           | Statut |
| ------------------------------------------------------------------------ | ------ |
| CSV depuis fichier local                                                 | ✅     |
| CSV via URL                                                              | ✅     |
| Copier-coller (nommé "Tableau collé")                                    | ✅     |
| Variables géo requises : noms de lieux / codes ISO / coordonnées lat+lon | ✅     |

### 2.A.2 Import géographique

| Fonctionnalité                                        | Statut |
| ----------------------------------------------------- | ------ |
| Shapefile (.shp + .dbf + .shx en ZIP)                 | ✅     |
| GeoJSON                                               | ✅     |
| GeoPackage                                            | ✅     |
| Via fichier local ou URL                              | ✅     |
| Utilisable comme visualisation OU comme fond de carte | ✅     |

### 2.A.3 Jeux de données

| Fonctionnalité                                        | Statut |
| ----------------------------------------------------- | ------ |
| Nommage par défaut = nom fichier (ou "Tableau collé") | ✅     |
| Renommer par utilisateur                              | ✅     |
| Dupliquer                                             | ✅     |
| Supprimer                                             | ✅     |

### 2.A.4 Typage variables

| Fonctionnalité                                        | Statut |
| ----------------------------------------------------- | ------ |
| Détection auto : texte, numérique                     | ✅     |
| Sous-type géo : entités admin, codes ISO, coordonnées | ✅     |
| Changement de type manuel                             | ✅     |
| Code graphique distinct par type                      | ✅     |

### 2.A.5 Tableau de données

| Fonctionnalité                              | Statut |
| ------------------------------------------- | ------ |
| Taille variable (redimensionnable)          | ✅     |
| Scroll virtuel (nombre restreint de lignes) | ✅     |
| Agrandissement à taille prédéfinie          | ✅     |
| Nombre de lignes affiché                    | ✅     |

#### Actions sur colonnes

| Fonctionnalité                                  | Statut |
| ----------------------------------------------- | ------ |
| Menu déroulant au survol                        | ✅     |
| Changer le type                                 | ✅     |
| Affiner : majuscules/minuscules, trim espaces   | ✅     |
| Renommer                                        | ✅     |
| Masquer (invisible dans les listes déroulantes) | ✅     |
| Supprimer                                       | ✅     |

#### Résumé statistique

| Fonctionnalité                           | Statut |
| ---------------------------------------- | ------ |
| Geo : nb uniques, nulls, doublons        | ✅     |
| Texte : nb catégories                    | ✅     |
| Numérique : histogramme, min, max, nulls | ✅     |
| Affichable/masquable par utilisateur     | ✅     |

#### Tri

| Fonctionnalité                    | Statut |
| --------------------------------- | ------ |
| Croissant/décroissant (numérique) | ✅     |
| Alphabétique (texte)              | ✅     |

#### Recherche

| Fonctionnalité                            | Statut |
| ----------------------------------------- | ------ |
| Barre de recherche globale ou par colonne | ✅     |
| Nb résultats + navigation prev/next       | ✅     |
| Mise en avant tableau + carte             | ✅     |
| Rechercher/remplacer                      | ✅     |

#### Filtres

| Fonctionnalité                                                            | Statut |
| ------------------------------------------------------------------------- | ------ |
| Filtres multiples                                                         | ✅     |
| Opérateurs : >=, <=, contient, =, !=, entre, top asc/desc, vide, non vide | ✅     |
| Résumé graphique : nb filtrés + %                                         | ✅     |
| Suppression par filtre                                                    | ✅     |

#### Calculatrice

| Fonctionnalité                                               | Statut |
| ------------------------------------------------------------ | ------ |
| Nouvelle variable calculée                                   | ✅     |
| Opérateurs : +, -, \*, /                                     | ✅     |
| Fonctions : moyenne, puissance, arrondis, concat, extraction | ✅     |
| Auto-complétion                                              | ✅     |
| Test avant validation                                        | ✅     |

#### Corbeille

| Fonctionnalité                         | Statut |
| -------------------------------------- | ------ |
| Supprimer variables                    | ✅     |
| Supprimer lignes                       | ✅     |
| Avertissement si impact visualisations | ✅     |

#### Réinitialisation

| Fonctionnalité                            | Statut |
| ----------------------------------------- | ------ |
| Rétablir données initiales                | ✅     |
| Perte des modifications et visualisations | ✅     |

### 2.A.6 Géolocalisation

| Fonctionnalité                             | Statut |
| ------------------------------------------ | ------ |
| Reconnaissance auto variables géo          | ✅     |
| Définition référence géographique manuelle | ✅     |
| Sélection variable(s) liée(s)              | ✅     |

### 2.A.7 Jointure fond de carte

#### Suggestions

| Fonctionnalité                                         | Statut |
| ------------------------------------------------------ | ------ |
| Vignettes triées par taux de correspondance            | ✅     |
| Affiche : titre, niveau découpage, année, source, taux | ✅     |

#### Catalogue

| Fonctionnalité                                      | Statut |
| --------------------------------------------------- | ------ |
| Vignettes avec titre, niveau, année, source         | ✅     |
| Recherche + auto-complétion                         | ✅     |
| Filtre par années                                   | ✅     |
| Bouton "suggérer nouveau fond" (formulaire externe) | ✅     |

#### Jointure assistée

| Fonctionnalité                                                 | Statut |
| -------------------------------------------------------------- | ------ |
| 4 catégories : jointes, à vérifier, non uniques, non reconnues | ✅     |
| Compteur par catégorie (classé par criticité)                  | ✅     |
| Remplacement identifiants dans tableau                         | ✅     |

#### Import fond custom

| Fonctionnalité                       | Statut |
| ------------------------------------ | ------ |
| Même formats que import géographique | ✅     |
| Jointure assistée disponible         | ✅     |

#### Superposition OSM

| Fonctionnalité                        | Statut |
| ------------------------------------- | ------ |
| Pour données avec coordonnées lat/lon | ✅     |
| Personnalisable                       | ✅     |

### 2.A.8 Enrichir fichier géo

| Fonctionnalité                                                            | Statut |
| ------------------------------------------------------------------------- | ------ |
| Joindre données tabulaires à fichier géo                                  | ✅     |
| Import tabulaires (entités géo uniquement, pas coordonnées)               | ✅     |
| Aperçu tableau (sans outils : recherche, filtre, calculatrice, corbeille) | ✅     |
| Sélection variables communes                                              | ✅     |
| Jointure assistée                                                         | ✅     |
| Données jointes visibles dans tableau principal                           | ✅     |

### 2.A.9 Aperçu carte

| Fonctionnalité                                       | Statut |
| ---------------------------------------------------- | ------ |
| Infobulles au survol/toucher                         | ✅     |
| Position fixe                                        | ✅     |
| Variables viz en premier, autres en accordéon replié | ✅     |
| Présent tout au long du parcours                     | ✅     |
| Auto-sélection meilleur fond (si tabulaire)          | ✅     |
| Fallback : planisphère pays                          | ✅     |
| Géométrie affichée si fichier géo                    | ✅     |
| Boutons zoom                                         | ✅     |
| Choix : zoom page ou zoom carte                      | ✅     |

---

## 2.B. Visualisations

### 2.B.1 Création

| Fonctionnalité                             | Statut |
| ------------------------------------------ | ------ |
| Création auto à l'entrée dans l'étape      | ✅     |
| Nommage "Visualisation (N)" avec incrément | ✅     |
| Renommer / dupliquer / supprimer           | ✅     |
| Choix jeu de données                       | ✅     |

### 2.B.2 Choisir visualisation

#### Suggestions

| Fonctionnalité                                               | Statut |
| ------------------------------------------------------------ | ------ |
| Basées sur profil données                                    | ✅     |
| Vignette : aperçu générique, primitives, type, variables     | ✅     |
| Max 3 affichées, "voir plus" par 3                           | ✅     |
| Meilleur score sélectionné par défaut + représenté sur carte | ✅     |
| Paramètres préréglés à la sélection                          | ✅     |

#### Paramétrage

| Fonctionnalité                                               | Statut |
| ------------------------------------------------------------ | ------ |
| Réglages par primitive : symboles, polygones, lignes, textes | ✅     |
| Afficher/masquer chaque primitive                            | ✅     |
| Filtrer par primitive                                        | ✅     |
| Taille, épaisseur, forme                                     | ✅     |
| Couleur fond et contour                                      | ✅     |
| Variation selon variable quanti/quali                        | ✅     |

#### Couleurs

| Fonctionnalité                                   | Statut |
| ------------------------------------------------ | ------ |
| Panneau dédié                                    | ✅     |
| Palettes qualitatives (familles de couleurs)     | ✅     |
| Palettes séquentielles                           | ✅     |
| Filtre daltonisme (couleurs accessibles)         | ✅     |
| Nuances plus sombres/lumineuses (couleur unique) | ✅     |
| HSL picker (teinte, saturation, luminosité)      | ✅     |
| Code hexadécimal (affichage + saisie)            | ✅     |
| Motifs : forme, angle, taille, échelle           | ❌     |
| Aplat en motif personnalisable                   | ❌     |
| Palettes séquentielles personnalisables          | ✅     |
| Palettes divergentes                             | ✅     |
| Inversion palette                                | ✅     |

#### Discrétisation

| Fonctionnalité                                             | Statut |
| ---------------------------------------------------------- | ------ |
| Sélection méthode                                          | ✅     |
| Nombre de classes                                          | ✅     |
| Méthodes : equal-interval, quantile, jenks, stddev, manuel | ✅     |
| Valeur de rupture → palette divergente                     | ✅     |
| Position valeur de rupture personnalisable                 | ✅     |
| Diagramme de fréquences                                    | ✅     |
| Saisie manuelle des bornes                                 | ✅     |
| Courte définition de la méthode (aide au choix)            | ✅     |

#### Légende

| Fonctionnalité                               | Statut |
| -------------------------------------------- | ------ |
| Affichée automatiquement avec visualisation  | ✅     |
| Changements visibles simultanément sur carte | ✅     |
| Personnalisable à l'étape Habillage          | ✅     |

### 2.B.3 Personnaliser fond de carte

| Fonctionnalité                   | Statut |
| -------------------------------- | ------ |
| Couleur fond polygones           | ✅     |
| Couleur contours                 | ✅     |
| Épaisseur contours               | ✅     |
| Pointillés                       | ✅     |
| Opacité                          | ✅     |
| Ombre portée (option prédéfinie) | ✅     |

#### Fond catalogue

| Fonctionnalité                                                                                                  | Statut |
| --------------------------------------------------------------------------------------------------------------- | ------ |
| Couches additionnelles configurables individuellement                                                           | ✅     |
| Couches : terre, mers/océans, lacs/rivières, relief, équateur, méridiens/parallèles, frontières/limites, villes | ✅     |
| Afficher/masquer chaque couche                                                                                  | ✅     |
| Personnaliser chaque couche                                                                                     | ✅     |

#### Fond importé

| Fonctionnalité                                                | Statut |
| ------------------------------------------------------------- | ------ |
| Personnalisation réduite                                      | ✅     |
| Couleur fond, contours, épaisseur, pointillés, opacité, ombre | ⚠️     |

#### Fond OSM

| Fonctionnalité             | Statut |
| -------------------------- | ------ |
| Styles prédéfinis          | ✅     |
| Calques à afficher/masquer | ❌     |
| Étiquettes                 | ❌     |

### 2.B.4 Outils visualisation

#### Recherche

| Fonctionnalité                      | Statut |
| ----------------------------------- | ------ |
| Barre de recherche entités/valeurs  | ✅     |
| Mise en lumière sur carte           | ✅     |
| Nb résultats + navigation prev/next | ✅     |
| Infobulle sur objet pointé          | ✅     |

#### Calques

| Fonctionnalité                                              | Statut |
| ----------------------------------------------------------- | ------ |
| 1 calque par visualisation                                  | ✅     |
| Sous-calques par primitive + fond de carte                  | ✅     |
| Code couleur + icône par type                               | ✅     |
| Afficher/masquer calques et sous-calques                    | ✅     |
| Raccourci vers paramétrage                                  | ✅     |
| Renommer/dupliquer/supprimer                                | ✅     |
| Réordonner (drag & drop)                                    | ✅     |
| Sous-calques fond de carte liés si plusieurs visualisations | ✅     |

#### Projections

| Fonctionnalité                                    | Statut |
| ------------------------------------------------- | ------ |
| Projection par défaut                             | ✅     |
| Pastille incitation (jusqu'à utilisation)         | ❌     |
| Suggestions basées sur emprise géographique       | ✅     |
| Filtres : rectangulaires, arrondies, discontinues | ✅     |
| Vue liste et vue grille                           | ✅     |
| Vignette : aperçu, titre, catégorie, description  | ✅     |
| Étiquette "respecte les surfaces" sur vignettes   | ❌     |
| Catalogue complet                                 | ✅     |
| Code CRS (WKT ou PROJ.4)                          | ❌     |
| Paramètres : longitude, latitude, rotation        | ✅     |
| Réinitialisation paramètres                       | ✅     |
| Changements visibles simultanément                | ✅     |
| Aperçu simplifié auto/manuel                      | ⚠️     |

#### Simplification (généralisation)

| Fonctionnalité                             | Statut |
| ------------------------------------------ | ------ |
| Fonds catalogue : 3 niveaux                | ✅     |
| Fonds importés : taux personnalisé         | ✅     |
| Avertissement suppression entités          | ❌     |
| OSM : non simplifiable                     | ✅     |
| Sélection par fichier si multiples chargés | ✅     |

#### Collection (facettes / small multiples)

| Fonctionnalité                                 | Statut |
| ---------------------------------------------- | ------ |
| Sélection plusieurs variables (même primitive) | ✅     |
| 1 variable = 1 carte de la collection          | ✅     |
| Pastille incitation sur icône outil            | ❌     |
| Échelle commune ou propre                      | ✅     |
| Disposition : nombre de colonnes               | ✅     |
| Distribution variables sur cartes              | ✅     |
| Calques regroupés par carte                    | ✅     |
| Même projection et simplification pour toutes  | ✅     |

---

## 2.C. Habillage

### 2.C.1 Habillage prédéfini

| Fonctionnalité                                                       | Statut |
| -------------------------------------------------------------------- | ------ |
| Légende auto (seul élément visible avant étape Habillage)            | ✅     |
| À l'entrée étape : titre, sous-titre, source, source fond, signature | ✅     |
| "Réalisé avec Khartis"                                               | ✅     |
| Textes = placeholders (invisibles à l'export si vides)               | ✅     |
| Chaque élément : déplaçable, supprimable                             | ⚠️     |
| Style par défaut personnalisable                                     | ⚠️     |

### 2.C.2 Outils habillage

#### Format

| Fonctionnalité                                 | Statut |
| ---------------------------------------------- | ------ |
| Formats prédéfinis                             | ✅     |
| Format personnalisé (pixels)                   | ✅     |
| Redistribution auto des éléments au changement | ❌     |
| Couleur page                                   | ✅     |
| Marges                                         | ✅     |
| Grille alignement                              | ❌     |
| Magnétisme (option)                            | ❌     |

#### Légende

| Fonctionnalité                                 | Statut |
| ---------------------------------------------- | ------ |
| Afficher/masquer chaque légende                | ✅     |
| Titre, sous-titre, note                        | ✅     |
| Pastille incitation                            | ❌     |
| Style : police, taille, couleur                | ✅     |
| Arrière-plan : option, couleur, opacité        | ✅     |
| Modifications appliquées à toutes les légendes | ✅     |

#### Indications géographiques - Échelle

| Fonctionnalité                      | Statut |
| ----------------------------------- | ------ |
| Formes prédéfinies : ligne ou boîte | ⚠️     |
| Distance figurée                    | ✅     |
| Unité                               | ✅     |
| Couleur                             | ❌     |

#### Indications géographiques - Orientation

| Fonctionnalité           | Statut |
| ------------------------ | ------ |
| Flèche ou rose des vents | ⚠️     |
| Taille, couleur          | ⚠️     |

#### Indications géographiques - Carte en encart

| Fonctionnalité                               | Statut |
| -------------------------------------------- | ------ |
| Globe ou planisphère                         | ❌     |
| Taille                                       | ❌     |
| Couleur fenêtre cadrage                      | ❌     |
| Couleurs encart ou réutiliser fond principal | ❌     |
| Zoom, centrage                               | ❌     |

#### Annotations - Texte

| Fonctionnalité                                | Statut |
| --------------------------------------------- | ------ |
| Placement zone texte sur page                 | ✅     |
| Style prédéfini ou personnalisé               | ✅     |
| Édition contenu dans panneau                  | ✅     |
| Sélection sur page → modification/suppression | ✅     |

#### Annotations - Forme

| Fonctionnalité                                    | Statut |
| ------------------------------------------------- | ------ |
| Formes : flèche, ligne, rond, rectangle, triangle | ⚠️     |
| Réglages : épaisseur, courbe, pointillé, couleur  | ⚠️     |
| Sélection → modification/suppression              | ✅     |

#### Annotations - Dessin

| Fonctionnalité                                      | Statut |
| --------------------------------------------------- | ------ |
| Ligne ou zone (tracé fermé)                         | ❌     |
| Épaisseur, lissage, couleur contour/fond, pointillé | ❌     |
| Sélection → modification/suppression                | ❌     |

#### Annotations - Image

| Fonctionnalité                       | Statut |
| ------------------------------------ | ------ |
| Import jpg, png                      | ✅     |
| Placement libre sur page             | ✅     |
| Taille, opacité                      | ⚠️     |
| Sélection → modification/suppression | ✅     |

#### Déficiences visuelles

| Fonctionnalité                                         | Statut |
| ------------------------------------------------------ | ------ |
| Simulation daltonisme (protanopie, deutéranopie, etc.) | ✅     |
| Liste filtres fournie                                  | ✅     |
| Prévisualisation uniquement (pas d'effet sur export)   | ✅     |

---

## 2.D. Téléchargement

### 2.D.1 Carte

| Fonctionnalité                                       | Statut |
| ---------------------------------------------------- | ------ |
| JPG haute résolution (bitmap)                        | ✅     |
| SVG avec calques organisés (vectoriel)               | ✅     |
| Calques organisés par éléments page + visualisations | ✅     |

### 2.D.2 Données

| Fonctionnalité                                                 | Statut |
| -------------------------------------------------------------- | ------ |
| CSV (données tabulaires avec modifications)                    | ✅     |
| GeoJSON (fichier géo avec modifications)                       | ✅     |
| Fond de carte utilisé                                          | ✅     |
| Résultat jointure données + fond (sans couches additionnelles) | ✅     |

### 2.D.3 Projet

| Fonctionnalité | Statut |
| -------------- | ------ |
| Fichier .kh    | ✅     |
| Réimportable   | ✅     |

---

## 2.E. Sauvegarde

### 2.E.1 Auto (navigateur)

| Fonctionnalité                             | Statut |
| ------------------------------------------ | ------ |
| Enregistrement à chaque action             | ✅     |
| Nommage utilisateur ou auto avec incrément | ✅     |
| Date dernière modification                 | ✅     |
| Liste à l'accueil + menu principal         | ✅     |
| Duplication possible                       | ✅     |

### 2.E.2 Manuelle (fichier)

| Fonctionnalité                   | Statut |
| -------------------------------- | ------ |
| Téléchargement .kh               | ✅     |
| Réimport pour reprendre/modifier | ✅     |

---

## 2.F. Exemples

| Fonctionnalité                                         | Statut |
| ------------------------------------------------------ | ------ |
| Projets exemples sur page d'accueil                    | ✅     |
| Vignettes                                              | ⚠️     |
| Filtres par critères                                   | ❌     |
| Données variées, fonds variés, visualisations diverses | ✅     |

---

## 2.G. Aide

| Fonctionnalité                         | Statut |
| -------------------------------------- | ------ |
| Textes d'accompagnement dans l'outil   | ⚠️     |
| Tooltips                               | ⚠️     |
| Liens vers aide externe (site Atelier) | ❌     |
| Facilement modifiables (Paraglide)     | ✅     |

---

## 3. Spécifications techniques

### 3.A Stack

| Techno                                        | Statut |
| --------------------------------------------- | ------ |
| DuckDB WASM + SPATIAL                         | ✅     |
| Deck.gl                                       | ✅     |
| MapLibre GL JS                                | ✅     |
| d3-geo                                        | ✅     |
| chroma.js (implémentation native équivalente) | ✅     |
| @observablehq/plot                            | ✅     |
| Carbon Design System                          | ✅     |
| SvelteKit 5 + Runes                           | ✅     |
| Paraglide JS                                  | ✅     |

### 3.B Performances

| Fonctionnalité                             | Statut |
| ------------------------------------------ | ------ |
| Chargement rapide (code splitting)         | ✅     |
| Loaders/squelettes pour opérations longues | ✅     |

### 3.C Compatibilité

| Fonctionnalité                                   | Statut |
| ------------------------------------------------ | ------ |
| Chrome, Firefox, Edge, Safari (desktop + mobile) | ⚠️     |

### 3.D Responsive

| Fonctionnalité                                        | Statut |
| ----------------------------------------------------- | ------ |
| Desktop : panneau latéral gauche, barre outils gauche | ✅     |
| Tablette : adaptation                                 | ❌     |
| Mobile : barre outils en bas, en-tête simplifié       | ❌     |

### 3.E Accessibilité

| Fonctionnalité                      | Statut |
| ----------------------------------- | ------ |
| RGAA conformité                     | ❌     |
| Navigation clavier                  | ⚠️     |
| Contrastes WCAG (Carbon compatible) | ✅     |

### 3.F Raccourcis clavier

| Fonctionnalité                 | Statut |
| ------------------------------ | ------ |
| 1/2/3 : navigation étapes      | ✅     |
| Chaque outil : raccourci dédié | ⚠️     |
| Échap : fermer panneau/annuler | ✅     |

### 3.G Multilinguisme

| Fonctionnalité                           | Statut |
| ---------------------------------------- | ------ |
| Français + Anglais                       | ✅     |
| Détection auto langue navigateur/système | ✅     |
| Changement via menu principal            | ✅     |
| Compatible traduction auto navigateur    | ✅     |

### 3.H Analytics

| Fonctionnalité                   | Statut |
| -------------------------------- | ------ |
| Google Analytics (ou équivalent) | ❌     |
| Suivi audience et interactions   | ❌     |

### 3.I Sécurité

| Fonctionnalité                      | Statut |
| ----------------------------------- | ------ |
| Données 100% client-side            | ✅     |
| Aucune transmission serveur         | ✅     |
| RGPD conforme (cookies, navigation) | ⚠️     |

### 3.J Hébergement

| Fonctionnalité                                       | Statut |
| ---------------------------------------------------- | ------ |
| Serveurs Sciences Po                                 | ❌     |
| Option hébergement externe                           | ❌     |
| GitHub (dépôt privé pendant dev, public à la sortie) | ✅     |

### 3.K Licence

| Fonctionnalité                                | Statut |
| --------------------------------------------- | ------ |
| MIT                                           | ✅     |
| © Atelier de cartographie / Sciences Po, 2025 | ✅     |

---

## 4. Structure UI

### 4.A Parcours utilisateur

| Fonctionnalité                                       | Statut |
| ---------------------------------------------------- | ------ |
| Accueil : Nouveau projet                             | ✅     |
| Accueil : Ouvrir projet/sauvegarde                   | ✅     |
| Accueil : Essayer avec exemple                       | ✅     |
| Étape Données tabulaire : Contrôler les données      | ✅     |
| Étape Données tabulaire : Géolocaliser les données   | ✅     |
| Étape Données tabulaire : Joindre à un fond de carte | ✅     |
| Étape Données fichier géo : Contrôler les données    | ✅     |
| Étape Données fichier géo : Enrichir les données     | ✅     |
| Étape Visualisations : Choisir/créer visualisation   | ✅     |
| Étape Visualisations : Paramétrer visualisation      | ✅     |
| Étape Visualisations : Personnaliser fond de carte   | ✅     |
| Étape Visualisations : 5 outils                      | ✅     |
| Étape Habillage : 5 outils                           | ✅     |
| Fin : Télécharger carte/données/projet               | ✅     |

### 4.B Design System

| Fonctionnalité                        | Statut |
| ------------------------------------- | ------ |
| Carbon Design System (IBM)            | ✅     |
| Personnalisation charte Sciences Po   | ⚠️     |
| Composants créés si besoin spécifique | ✅     |

### 4.C Interface

| Fonctionnalité                                                     | Statut |
| ------------------------------------------------------------------ | ------ |
| En-tête : Menu principal, nom projet, aide, téléchargement         | ✅     |
| Barre outils : 3 boutons étapes + outils contextuels               | ✅     |
| Panneau latéral : Contenus, onglets, fil d'ariane, taille variable | ✅     |
| Visionneuse : Carte + page, zoom, infobulles                       | ✅     |
| Modales : Import, réinitialisation, actions particulières          | ✅     |

### 4.D Responsive

| Fonctionnalité                                                  | Statut |
| --------------------------------------------------------------- | ------ |
| Desktop : Barre outils gauche, panneau latéral affiché          | ✅     |
| Mobile : Barre outils bas, panneau masquable, en-tête simplifié | ❌     |

---

## 5. Déploiement

### 5.A Environnements

| Fonctionnalité                        | Statut |
| ------------------------------------- | ------ |
| Préproduction (tests/validation)      | ❌     |
| Production (après validation preprod) | ❌     |
| Déploiement versionné et documenté    | ❌     |

### 5.B Documentation

| Fonctionnalité              | Statut |
| --------------------------- | ------ |
| Commentaires de code        | ⚠️     |
| Guides d'utilisation        | ❌     |
| Instructions d'installation | ⚠️     |
| Exemples cas d'utilisation  | ❌     |
| Dépôt GitHub maintenu       | ✅     |
