# Glossaire

Définitions des termes cartographiques, statistiques et techniques utilisés dans Khartis. Ce glossaire s'adresse aux utilisateurs non spécialistes.

Voir aussi le [Guide utilisateur](GUIDE_UTILISATEUR.md) pour la prise en main de l'application.

---

## Termes cartographiques

**Carte en encart** -- Miniature de carte affichée dans un coin de la carte principale, indiquant la zone représentée dans son contexte géographique plus large.

**Choroplèthe** -- Type de carte où les zones géographiques (pays, régions, départements) sont coloriées en fonction d'une variable statistique. Plus la valeur est élevée, plus la couleur est foncée (ou intense). Adapté aux ratios et aux taux.

**Échelle** -- Rapport entre une distance sur la carte et la distance correspondante dans la réalité. Représentée par une barre graduée sur la carte.

**Emprise géographique** -- Étendue spatiale visible sur la carte, définie par ses limites nord, sud, est et ouest.

**Facettes (small multiples)** -- Série de petites cartes identiques, chacune représentant une catégorie ou une période différente. Permet de comparer visuellement plusieurs sous-ensembles de données.

**Fond de carte** -- Couche de géométries (contours de pays, de régions, etc.) sur laquelle les données thématiques sont représentées. Aussi appelé "basemap".

**Légende** -- Élément visuel qui explique la signification des couleurs, symboles et tailles utilisés sur la carte.

**Méridien** -- Ligne imaginaire reliant le pôle Nord au pôle Sud, correspondant à un degré de longitude. Le méridien de Greenwich (0 degré) sert de référence internationale.

**Parallèle** -- Ligne imaginaire parallèle à l'équateur, correspondant à un degré de latitude. L'équateur est le parallèle 0 degré.

**Primitives graphiques** -- Types de géométries de base utilisés pour représenter les données sur la carte : points (symboles), lignes, polygones (surfaces) et textes.

**Projection cartographique** -- Méthode mathématique pour représenter la surface sphérique de la Terre sur un plan. Chaque projection déforme certaines propriétés (surfaces, distances, angles). Exemples : Mercator, Robinson, Bertin 1953.

**Rose des vents** -- Symbole indiquant l'orientation de la carte (nord, sud, est, ouest).

**SIG (Système d'Information Géographique)** -- Ensemble d'outils logiciels permettant de collecter, stocker, analyser et visualiser des données géographiques. Khartis est un outil de cartographie thématique simplifié, distinct des SIG professionnels (QGIS, ArcGIS).

**Simplification / Généralisation** -- Réduction du nombre de points composant les géométries pour alléger la carte. Utile pour les fonds de carte très détaillés ou les exports légers.

## Méthodes de classification

**Intervalles égaux** -- Méthode de discrétisation où l'amplitude totale des valeurs est divisée en classes de même taille. Simple mais sensible aux valeurs extrêmes.

**K-means (seuils naturels)** -- Méthode de discrétisation qui groupe les valeurs autour de centres calculés par macro DuckDB. Détecte les ruptures naturelles dans la distribution des données sans charger toute la colonne en TypeScript.

**Moyennes emboîtées** -- Méthode de discrétisation récursive : on calcule la moyenne, on coupe en deux, puis on répète l'opération sur chaque moitié. Produit 2, 4 ou 8 classes.

**Palette divergente** -- Gamme de couleurs allant d'une teinte à une autre en passant par un point central neutre (souvent blanc ou gris). Adaptée aux données avec une valeur de référence (ex. : évolution positive en bleu, négative en rouge).

**Palette séquentielle** -- Gamme de couleurs allant du clair au foncé (ou inversement) pour représenter un ordre croissant de valeurs.

**Q6** -- Méthode de discrétisation en 6 classes, fondée sur cinq seuils prédéfinis (5e, 27.5e, 50e, 72.5e, 95e percentiles).

**Quantiles** -- Méthode de discrétisation où chaque classe contient le même nombre d'entités. Garantit un équilibre visuel sur la carte, mais peut regrouper des valeurs très différentes.

**Valeur de rupture** -- Seuil défini manuellement pour séparer deux classes dans une discrétisation. Permet d'insérer un point de coupure significatif (ex. : la moyenne nationale).

## Termes liés aux données

**Code ISO** -- Code normalisé pour identifier un pays (ISO 3166-1 alpha-2 : FR, DE, US) ou une subdivision administrative (ISO 3166-2 : FR-IDF, DE-BE). Utilisé pour la jointure entre vos données et les fonds de carte.

**CRS (Coordinate Reference System)** -- Système de référence de coordonnées qui définit comment les coordonnées géographiques (latitude, longitude) correspondent à des positions sur la Terre. Exemple courant : WGS 84 (EPSG:4326).

**CSV (Comma-Separated Values)** -- Format de fichier texte où chaque ligne représente un enregistrement et les valeurs sont séparées par des virgules (ou des points-virgules). Lisible par les tableurs (Excel, LibreOffice Calc).

**Discrétisation** -- Opération consistant à transformer une variable continue (ex. : PIB par habitant) en un nombre fini de classes. Nécessaire pour créer une carte choroplèthe.

**Géolocalisation** -- Processus d'association de coordonnées géographiques (latitude, longitude) ou d'identifiants territoriaux (nom de pays, code postal) à des entités de données, pour les positionner sur une carte.

**GeoJSON** -- Format de fichier basé sur JSON pour décrire des géométries géographiques (points, lignes, polygones) et leurs propriétés. Standard du web cartographique.

**GeoPackage** -- Format de fichier SIG basé sur SQLite, pouvant contenir plusieurs couches de données géographiques. Plus moderne que le Shapefile.

**GeoParquet** -- Format de fichier basé sur Apache Parquet, optimisé pour le stockage et le traitement de grandes quantités de données géographiques. Supporte les encodages géométriques natifs.

**GPX (GPS Exchange Format)** -- Format XML standard pour échanger des traces et points GPS. Utilisé par les applications de randonnée et de sport.

**Jointure** -- Opération qui associe vos données tabulaires (ex. : un fichier CSV de statistiques par pays) aux géométries d'un fond de carte, en faisant correspondre un identifiant commun (nom, code ISO).

**KML (Keyhole Markup Language)** -- Format XML de données géographiques développé pour Google Earth. Le format KMZ est sa version compressée.

**Parquet** -- Format de fichier en colonnes, compact et rapide à lire, conçu pour l'analyse de données. Utilisé dans Khartis pour importer des jeux de données volumineux.

**Shapefile** -- Format de fichier SIG classique composé de plusieurs fichiers (.shp, .shx, .dbf...). Largement supporté mais ancien. Doit être importé sous forme d'archive ZIP dans Khartis.

**Variable géographique** -- Colonne de données contenant des informations spatiales : coordonnées (latitude/longitude), codes de territoire (ISO, INSEE) ou géométries.

**Variable qualitative** -- Colonne de données contenant des catégories sans ordre numérique (ex. : type de climat, nom de parti politique). Représentée par des couleurs distinctes.

**Variable quantitative** -- Colonne de données contenant des valeurs numériques mesurables (ex. : population, PIB, température). Représentée par des gradients de couleur ou des tailles de symboles.

**WKT (Well-Known Text)** -- Format texte standard pour décrire des géométries (points, lignes, polygones) sous forme lisible. Exemple : `POINT(2.35 48.86)`.

## Termes techniques

**Apache Arrow** -- Format de données en colonnes en mémoire, conçu pour les transferts rapides entre systèmes. Dans Khartis, sert de passerelle entre DuckDB (traitement SQL) et Deck.gl (rendu GPU).

**Client-side (côté client)** -- Traitement qui s'effectue entièrement dans le navigateur web de l'utilisateur, sans envoyer de données à un serveur distant. Garantit la confidentialité des données.

**DuckDB WASM** -- Moteur de base de données analytique compilé en WebAssembly, fonctionnant directement dans le navigateur. Permet à Khartis de traiter de grands volumes de données avec des requêtes SQL sans serveur.

**GeoArrow** -- Extension du format Apache Arrow pour les données géographiques. Encode les géométries en format binaire columnar, permettant un rendu GPU direct sans conversion intermédiaire.

**IndexedDB** -- Base de données intégrée au navigateur, utilisée par Khartis pour sauvegarder automatiquement les projets. Les données persistent entre les sessions.

**PWA (Progressive Web App)** -- Application web pouvant être installée sur un appareil et fonctionner hors connexion, comme une application native.

**Rendu GPU** -- Utilisation du processeur graphique (carte graphique) pour afficher la carte. Permet un rendu fluide même avec un grand nombre d'entités géographiques.

**WebGL** -- Interface de programmation permettant aux navigateurs web d'exploiter le GPU pour le rendu graphique 2D et 3D. Utilisé par Deck.gl et MapLibre pour afficher les cartes.
