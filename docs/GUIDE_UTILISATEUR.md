# Guide utilisateur

Ce guide présente les fonctionnalités de Khartis v3, organisées selon les trois étapes du parcours de création cartographique. Pour les définitions des termes techniques, consultez le [Glossaire](GLOSSAIRE.md).

---

## Table des matières

1. [Données](#1-données)
2. [Visualisations](#2-visualisations)
3. [Habillage](#3-habillage)
4. [Export et sauvegarde](#4-export-et-sauvegarde)
5. [Confidentialité](#5-confidentialité)

---

## 1. Données

### Formats supportés

| Format               | Type                      | Extension                         |
| -------------------- | ------------------------- | --------------------------------- |
| CSV / TSV / TXT      | Tabulaire                 | `.csv`, `.tsv`, `.txt`            |
| GeoJSON              | Géographique              | `.geojson`, `.json`               |
| GeoPackage           | Géographique              | `.gpkg`                           |
| Shapefile            | Géographique              | `.shp` (archive `.zip`)           |
| GPX                  | Géographique              | `.gpx`                            |
| KML / KMZ            | Géographique              | `.kml`, `.kmz`                    |
| Parquet / GeoParquet | Tabulaire ou géographique | `.parquet`, `.geoparquet`, `.gpq` |

### Import des données

Trois modes d'import sont disponibles :

- **Fichier local** : glisser-déposer ou sélectionner un fichier depuis votre ordinateur.
- **URL** : coller un lien vers un fichier hébergé en ligne.
- **Copier-coller** : coller directement des données tabulaires (CSV) depuis un tableur ou un éditeur de texte.

### Typage automatique

À l'import, Khartis détecte automatiquement le type de chaque colonne :

- **Texte** : noms, identifiants, catégories.
- **Numérique** : valeurs entières ou décimales.
- **Géographique** : coordonnées (latitude/longitude), codes ISO, géométries.

Vous pouvez corriger le type manuellement si nécessaire.

### Outils du tableau

L'aperçu des données propose plusieurs outils :

- **Tri** : cliquer sur un en-tête de colonne pour trier.
- **Recherche** : filtrer les lignes par mot-clé.
- **Filtres** : masquer des lignes selon des critères.
- **Calculatrice** : créer une nouvelle colonne à partir d'une formule.
- **Corbeille** : supprimer des colonnes inutiles.
- **Réinitialisation** : revenir aux données d'origine.

### Géolocalisation

Deux méthodes pour localiser vos données sur la carte :

- **Coordonnées GPS** : si vos données contiennent des colonnes latitude et longitude, Khartis les détecte et positionne les entités automatiquement.
- **Entités administratives** : Khartis identifie les noms ou codes de territoires (pays, régions, départements...) et les associe au fond de carte correspondant.

### Jointure à un fond de carte

Lorsque vos données contiennent des identifiants géographiques (noms de pays, codes ISO...), Khartis les associe aux géométries d'un fond de carte :

- **Suggestions automatiques** : Khartis propose les fonds de carte les plus pertinents.
- **Catalogue** : parcourir les fonds de carte disponibles par échelle (monde, continent, pays).
- **Import personnalisé** : charger votre propre fond de carte (GeoJSON, Shapefile, GeoPackage).
- **Jointure assistée** : interface de correspondance manuelle entre vos identifiants et ceux du fond de carte.
- **OpenStreetMap** : utiliser les données OSM comme fond de carte de référence.

### Enrichissement

Si vous importez un fichier géographique (GeoJSON, Shapefile...), vous pouvez l'enrichir en le croisant avec un autre jeu de données tabulaires ou géographiques.

---

## 2. Visualisations

### Suggestions automatiques

Selon le type de vos variables, Khartis suggère automatiquement les visualisations les plus adaptées.

### Types de visualisation

| Type                        | Usage                                                                 |
| --------------------------- | --------------------------------------------------------------------- |
| **Choroplèthe**             | Colorier des zones selon une variable quantitative (taux, ratio)      |
| **Symboles proportionnels** | Représenter des quantités par la taille de symboles (cercles, carrés) |
| **Catégorielle**            | Distinguer des catégories par la couleur                              |
| **Bivariée**                | Croiser deux variables sur une même carte                             |

### Primitives graphiques

Chaque visualisation s'applique à un ou plusieurs types de géométrie : **symboles** (points), **polygones** (surfaces), **lignes**, **textes**.

### Discrétisation

Pour les variables quantitatives, vous choisissez une méthode de classification :

- **Jenks** (seuils naturels) : minimise les écarts au sein de chaque classe.
- **Quantiles** : chaque classe contient le même nombre d'entités.
- **Intervalles égaux** : chaque classe a la même amplitude.
- **Écart-type** : découpage basé sur la déviation par rapport à la moyenne.
- **Q6** : variante en 6 classes équilibrées.
- **Moyennes emboîtées** : découpage récursif par la moyenne.
- **Head-tail** : adapté aux distributions très déséquilibrées (loi de puissance).

Vous pouvez ajuster le nombre de classes et déplacer les seuils manuellement.

### Couleurs et palettes

- **Palettes séquentielles** : pour des données ordonnées (du clair au foncé).
- **Palettes divergentes** : pour des données avec un point central (ex. : évolution positive/négative).
- **Motifs** : remplissage par hachures ou motifs, utile pour le noir et blanc ou l'accessibilité.
- **Couleur personnalisée** : modification libre de chaque classe.

### Personnalisation du fond de carte

Modifier la couleur de remplissage, la couleur et l'épaisseur du contour, ainsi que l'opacité du fond de carte de référence.

### Outils de l'étape Visualisations

- **Recherche** : localiser une entité sur la carte.
- **Calques** : gérer l'ordre et la visibilité des couches.
- **Projections** : choisir parmi un catalogue de plus de 150 projections cartographiques.
- **Simplification** : réduire le niveau de détail géométrique pour alléger la carte.
- **Facettes** : générer des petites cartes multiples (small multiples) à partir d'une variable.

---

## 3. Habillage

### Éléments prédéfinis

Ajouter et personnaliser les éléments textuels de la carte : **titre**, **sous-titre**, **source**, **signature**.

### Légende

La légende est générée automatiquement. Vous pouvez la repositionner, modifier son titre et ajuster sa présentation.

### Indications géographiques

- **Échelle** : barre d'échelle graphique.
- **Orientation** : flèche du nord (rose des vents).
- **Carte en encart** : miniature de localisation.

### Annotations

Quatre types d'annotations à placer librement sur la carte :

- **Textes** : étiquettes avec police, taille et couleur personnalisables.
- **Formes** : flèches, lignes, rectangles, cercles, triangles.
- **Dessins** : traçage libre (lignes et zones).
- **Images** : import d'images (logo, photo).

### Simulation de daltonisme

Visualiser la carte telle qu'elle apparaîtrait à une personne atteinte de daltonisme (protanopie, deutéranopie, tritanopie). Permet de vérifier que la carte reste lisible pour tous.

### Format et mise en page

Choisir le format de la carte (A4, A3, carré, ou dimensions personnalisées), son orientation et son échelle de zoom.

---

## 4. Export et sauvegarde

### Export de la carte

| Format | Usage                                                                             |
| ------ | --------------------------------------------------------------------------------- |
| SVG    | Image vectorielle, retouchable dans un logiciel de dessin (Inkscape, Illustrator) |
| JPG    | Image bitmap avec choix de résolution (1080p, 2K, 4K)                             |

### Export des données

| Format             | Usage                                                 |
| ------------------ | ----------------------------------------------------- |
| CSV                | Tableau réutilisable dans un tableur                  |
| CSV avec géométrie | Tableau incluant les coordonnées géographiques en WKT |
| GeoJSON            | Standard web pour les données géographiques           |

### Fichier projet

Le format `.kh` sauvegarde l'intégralité de votre projet (données, configuration, habillage). Vous pouvez le rouvrir dans Khartis pour reprendre votre travail.

### Sauvegarde automatique

Khartis sauvegarde automatiquement votre projet dans le navigateur (IndexedDB). En rouvrant l'application, vous retrouvez votre dernier projet.

## 5. Confidentialité

**Aucune donnée n'est transmise à un serveur.** Tout le traitement s'effectue localement dans votre navigateur. Vos fichiers, vos cartes et vos projets restent sur votre machine.
