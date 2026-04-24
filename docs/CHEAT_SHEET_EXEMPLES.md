# Cheat sheet utilisateur -- 5 exemples pour prendre Khartis en main

Ce mémo est pensé pour un public non technique. L'idée est simple : partir de fichiers de test déjà hébergés par Khartis, les importer par URL, puis essayer 5 cartes qui montrent rapidement ce que l'outil sait faire de mieux.

Application de test :

- [Khartis PPRD](https://www.sciencespo.fr/cartographie/khartisnewpprd/)

Base commune des fichiers de test :

- `https://www.sciencespo.fr/cartographie/khartisnewpprd/tests-datasets/`

Important :

- vous n'avez rien à télécharger ;
- vous n'avez pas besoin d'un SIG ;
- les traitements se font dans le navigateur, pas sur un serveur.

---

## Import par URL en 30 secondes

1. Ouvrir [Khartis PPRD](https://www.sciencespo.fr/cartographie/khartisnewpprd/).
2. Cliquer sur `Créer un nouveau projet`.
3. Choisir `Lien vers un fichier`.
4. Coller l'URL du jeu de données.
5. Cliquer sur `Charger`, puis sur `Créer`.
6. Si Khartis propose déjà un fond ou une visualisation pertinente, commencez par cette proposition.

---

## Ce que couvrent les 5 exemples

- CSV tabulaire avec jointure automatique à un fond de carte
- CSV avec coordonnées GPS
- GeoJSON avec géométries déjà intégrées
- choroplèthes, symboles proportionnels, cartes catégorielles et bivariées
- projection composite France + outre-mer

---

## 1. Monde des subventions aux énergies fossiles

- **URL** : `https://www.sciencespo.fr/cartographie/khartisnewpprd/tests-datasets/csv/fossil-fuel-subsidies-gdp-2021.csv`
- **But** : produire une carte mondiale propre à partir d'un simple CSV.

### À faire

1. Importer l'URL.
2. Laisser Khartis reconnaître `Code` comme identifiant géographique.
3. Dans `Joindre`, conserver le fond mondial suggéré.
4. Dans `Visualisations`, choisir une choroplèthe.
5. Utiliser la variable `Fossil-fuel subsidies (consumption and production) as a proportion of total GDP (%)`.
6. Régler la discrétisation sur 5 classes, en `K-means` ou en `Quantiles`.
7. En option, tester la projection `Robinson` pour une lecture plus éditoriale du monde.

### Ce que cela montre

- Khartis sait partir d'un tableau très simple.
- La jointure géographique peut se faire automatiquement via un code pays.
- L'outil suggère rapidement une carte statistique lisible sans phase SIG préalable.

---

## 2. France et outre-mer sur une seule carte lisible

- **URL** : `https://www.sciencespo.fr/cartographie/khartisnewpprd/tests-datasets/csv/france-regions-simplification-check.csv`
- **But** : tester une carte régionale française qui n'oublie pas les territoires ultramarins.

### À faire

1. Importer l'URL.
2. Laisser Khartis reconnaître `Code Région 2016` ou `Nom région`.
3. Conserver le fond des régions françaises suggéré.
4. Créer une choroplèthe sur `Valeur test`.
5. Ouvrir l'outil `Projections`.
6. Choisir la projection `France DOM-TOM`.

### Ce que cela montre

- Khartis ne force pas à choisir entre métropole et outre-mer.
- La projection composite est très utile pour des cartes pédagogiques ou institutionnelles.
- C'est un bon exemple de ce qui distingue Khartis d'outils plus génériques.

---

## 3. Sites Seveso en Ile-de-France

- **URL** : `https://www.sciencespo.fr/cartographie/khartisnewpprd/tests-datasets/csv/sites-seveso-idf.csv`
- **But** : cartographier des points directement à partir de coordonnées GPS.

### À faire

1. Importer l'URL.
2. Laisser Khartis reconnaître `Lat` et `Long`.
3. Dans `Géolocaliser`, choisir `Coordonnées géographiques` si ce n'est pas déjà fait.
4. Conserver le fond de référence tuilé.
5. Dans `Visualisations`, choisir une carte catégorielle.
6. Utiliser la variable `Statut Seveso`.

### Ce que cela montre

- Pas besoin d'un fond polygonal ni d'une jointure administrative.
- Khartis sait traiter des données de sites, d'équipements ou d'événements ponctuels.
- C'est une bonne entrée pour des cartes de risques, de réseaux ou de services.

---

## 4. Grandes villes européennes en symboles proportionnels

- **URL** : `https://www.sciencespo.fr/cartographie/khartisnewpprd/tests-datasets/geojson/visualization-toolbox-cases.geojson`
- **But** : tester les symboles proportionnels sur un fichier géographique déjà prêt.

### À faire

1. Importer l'URL.
2. Passer directement à `Visualisations` : le fichier contient déjà ses géométries.
3. Choisir `Symboles proportionnels`.
4. Utiliser la variable `capacity_total`.
5. Pour une comparaison rapide, dupliquer ensuite la visualisation et remplacer `capacity_total` par `population_total`.

### Ce que cela montre

- Khartis n'est pas limité aux CSV à joindre : un GeoJSON peut être cartographié immédiatement.
- Les symboles proportionnels sont utiles quand on veut montrer des ordres de grandeur sans colorier tout l'espace.
- La duplication de visualisation permet de comparer deux lectures du même jeu de données.

---

## 5. Europe sociale en carte bivariée

- **URL** : `https://www.sciencespo.fr/cartographie/khartisnewpprd/tests-datasets/geojson/nuts2_data.geojson`
- **But** : croiser deux indicateurs régionaux européens dans une seule carte.

### À faire

1. Importer l'URL.
2. Passer à `Visualisations`.
3. Choisir une visualisation bivariée.
4. Utiliser `GDP_CAP_PPS_2022` pour la première variable.
5. Utiliser `POP_65P_RT_2023` pour la seconde variable.
6. Garder une grille simple en `3 x 3` classes pour une lecture plus pédagogique.

### Ce que cela montre

- Khartis permet de faire autre chose qu'une carte "une variable = une couleur".
- La carte bivariée est utile pour faire apparaître des contrastes complexes, ici entre richesse et vieillissement.
- C'est une visualisation plus analytique, mais elle reste accessible si l'on garde peu de classes et une légende claire.

---

## Pourquoi ces 5 exemples sont utiles

En moins d'une heure, vous aurez testé :

- un CSV mondial joint automatiquement ;
- un CSV français avec projection composite ;
- un CSV GPS sans jointure ;
- un GeoJSON ponctuel en symboles proportionnels ;
- un GeoJSON polygonal en bivariée.

Autrement dit : les 3 grands points forts de Khartis apparaissent vite.

- **Entrer par les données, pas par la technique** : CSV ou fichier géo, l'outil guide la suite.
- **Proposer des choix cartographiques pertinents** : fond, projection, type de visualisation.
- **Rester pédagogique** : les fonctions avancées existent, mais elles restent activables progressivement.

---

## Bonus : autres formats à essayer ensuite

Si vous voulez aller un peu plus loin, ces fichiers de test montrent aussi l'étendue des formats supportés :

- **Lignes GeoJSON** : `https://www.sciencespo.fr/cartographie/khartisnewpprd/tests-datasets/geojson/lignes-du-reseau-star-de-rennes-metropole.geojson`
- **Shapefile en ZIP** : `https://www.sciencespo.fr/cartographie/khartisnewpprd/tests-datasets/zip/shapefile-complete.zip`
- **KML** : `https://www.sciencespo.fr/cartographie/khartisnewpprd/tests-datasets/kml-kmz/aires-covoiturage/aires-covoiturage.kml`
- **GeoPackage** : `https://www.sciencespo.fr/cartographie/khartisnewpprd/tests-datasets/gpkg/compagnies-herault-l93.gpkg`

Le bon réflexe est de commencer par un exemple simple, puis de monter en complexité seulement quand la question cartographique le demande.
