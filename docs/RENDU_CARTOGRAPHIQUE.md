# Rendu cartographique

Ce document décrit le chemin qui mène des données spatiales au canevas. Il
s'adresse aux développeurs qui interviennent sur les couches thématiques, les
fonds, les projections ou les performances de rendu.

Khartis est une application entièrement exécutée dans le navigateur. Le chemin
rapide est binaire :

    DuckDB WASM ou GeoParquet
      -> Apache Arrow avec métadonnées GeoArrow
      -> geoarrow-deck-stream
      -> Deck.gl et buffers GPU

GeoJSON est un format de secours ou d'export, pas le format normal du rendu.
Le convertir sur le chemin principal augmente les allocations et neutralise les
caches associés aux tables Arrow.

## Responsabilités et points d'entrée

| Besoin                              | Sources de vérité                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------------- |
| Orchestration de la carte           | src/lib/features/map/components/thematic-map.svelte                                   |
| Création et destruction des moteurs | src/lib/features/map/hooks/use-map-init.svelte.ts                                     |
| Mise à jour des données et couches  | src/lib/features/map/hooks/use-map-display-data.svelte.ts et use-map-layers.svelte.ts |
| Choix du moteur                     | src/lib/features/map/utils/render-engine.utils.ts                                     |
| Conversion GeoArrow binaire         | src/lib/features/map/utils/geoarrow-stream-bridge.utils.ts                            |
| Primitives Deck                     | src/lib/features/map/layers/layer-factory.ts et les factories associées               |
| Infobulles et sélection             | src/lib/features/map/interactions/tooltip.service.ts                                  |

La carte thématique coordonne l'état de la visualisation, le chargement des
fonds, la projection et les mises à jour de couches. Elle attend la
stabilisation d'un style MapLibre avant de demander de nouvelles couches. Les
hooks restent les propriétaires de leur cycle de vie respectif, ils ne doivent
pas être contournés depuis un composant d'interface.

## Deux moteurs complémentaires

| Mode                | Quand il est choisi                           | Rôle principal                                                                                    |
| ------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Deck orthographique | Aucun fond n'impose MapLibre                  | Carte thématique projetée avec OrthographicView et projections d3 appliquées aux buffers GeoArrow |
| MapLibre intercalé  | Un style de fond le requiert ou OSM est actif | Fond tuilé et interactions MapLibre, couches Deck dans MapboxOverlay avec interleaved: true       |

Le sélecteur central est shouldUseMapLibreInterleaved. Une couche ne doit pas
choisir son moteur elle-même. Le changement de mode recrée les ressources
nécessaires, puis useMapLayers reconstruit les couches avec le modèle et la
projection compatibles.

En l'absence de WebGL2, le mode orthographique affiche un canevas de repli.
Cette situation est un état dégradé à diagnostiquer, pas un motif pour
dissimuler une erreur de données.

## Données spatiales jusqu'au GPU

Deux parcours coexistent et doivent conserver leurs caractéristiques propres.

    Données importées
      fichier -> pipeline -> DuckDB -> Arrow IPC -> GeoArrow -> Deck.gl

    Géométrie d'un fond catalogue pour l'affichage
      GeoParquet -> parquet-wasm -> Arrow/GeoArrow -> Deck.gl

Le second parcours évite DuckDB pour afficher rapidement une géométrie de
catalogue. Il ne signifie pas que le fond ne peut jamais passer par DuckDB :
la géométrie peut être matérialisée dans DuckDB pour une jointure, une analyse
ou une densité. Voir FONDS_PROJECTIONS.md.

### Contrats de rendu

useMapDisplayData produit un contrat adapté à chaque cas :

| Contrat             | Usage                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------ |
| Table Arrow directe | Géométrie et attributs sont disponibles dans une même table                                |
| SplitRenderingTable | Géométrie de fond et attributs métier restent séparés, reliés par l'identifiant de feature |
| Table de densité    | Résultat calculé par DuckDB, réexposé en GeoArrow WKB                                      |
| GeoJSON de secours  | Cas incompatibles avec le chemin binaire, jamais le chemin recherché par défaut            |

Les métadonnées GeoArrow sont un contrat d'entrée des factories. DuckDB les
ajoute ou les réattache notamment après des vues et jointures qui ne les
préservent pas. Une factory qui refuse une table sans géométrie annotée évite
un rendu ambigu, elle ne doit pas être contournée par une conversion hâtive.

## Cycle de vie WebGL

useMapInit est le seul propriétaire de l'instanciation des moteurs :

1. vérification de WebGL2 et calcul du ratio de rendu compatible avec les
   limites GPU ;
2. création de Deck avec OrthographicView, ou de MapLibre et de son
   MapboxOverlay intercalé ;
3. installation des interactions et des observateurs de taille ;
4. synchronisation des styles MapLibre, des fonds et des couches ;
5. libération explicite lors d'un changement de mode ou du démontage.

La libération réelle est importante : l'overlay MapLibre est finalisé avant
map.remove(), et l'instance Deck est finalisée ensuite. Ne remplacez pas cette
séquence par un simple setProps avec une liste de couches vide.

Le ratio de rendu est borné par MAX_TEXTURE_SIZE et MAX_RENDERBUFFER_SIZE dans
render-pixel-ratio.utils.ts. Un écran à forte densité de pixels ou une grande
zone d'export ne doit pas provoquer la création d'un buffer non pris en charge.

## Couches et primitives

layer-factory répartit les géométries puis compose les couches dans l'ordre des
primitives configurées. Les cinq familles ci-dessous sont des responsabilités
équivalentes du rendu.

| Primitive | Factory et couche                                              | À préserver lors d'une évolution                                                               |
| --------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Polygones | polygon-layer-factory, SolidPolygonLayer et PathLayer binaires | Aplat, contour, ordre, données jointes et éventuel remplacement par une densité                |
| Lignes    | line-layer-factory et PathLayer                                | Chemin binaire, style, ordre de dessin et secours GeoJSON                                      |
| Points    | point-layer-factory, ScatterplotLayer et MultiShapeLayer       | Taille, symbole, attributs binaires, picking et ordre des symboles                             |
| Textes    | text-layer-factory                                             | Étiquetage lié aux entités, lisibilité et ordre par rapport aux géométries                     |
| Densité   | density-layer-factory et opérations DuckDB                     | Calcul préalable, géométrie de sortie et coexistence éventuelle avec des points représentatifs |

Les polygones ne sont donc pas un cas secondaire. Une visualisation de densité
peut remplacer l'aplat polygonal par des points générés tout en conservant les
informations nécessaires à l'interaction.

Les couches de fond sont réparties derrière ou devant les couches thématiques.
L'ordre affiché dans le panneau est une projection de cet ordre canonique, pas
une deuxième source de vérité.

## Modèle de visualisation et sémiologie

Une visualisation associe une ou plusieurs primitives à une variable. Le code
ne doit pas créer un concept parallèle pour un nouveau style : il précise une
primitive, un mode de représentation et les paramètres qui lui sont propres.

| Mode          | Donnée attendue       | Conséquence cartographique et technique                                              |
| ------------- | --------------------- | ------------------------------------------------------------------------------------ |
| Unique        | aucune variable       | style constant, utile comme couche de référence                                      |
| Classifié     | variable quantitative | bornes et palette ordonnée, calculées par DuckDB puis persistées comme configuration |
| Catégoriel    | variable qualitative  | catégorie, forme ou couleur par modalité                                             |
| Proportionnel | quantité absolue      | taille de symbole ou largeur de ligne liée à la valeur                               |

Un choroplèthe est un cas de polygone classifié : sa variable devrait être un
taux ou un ratio, pas un effectif absolu. Les effectifs absolus sont plutôt
portés par des symboles proportionnels. Cette distinction métier influe sur la
suggestion initiale, la légende, le calcul de bornes et l’interface de
configuration.

Les suggestions de visualisation, de projection et de palette sont classées
selon les données et les contraintes cartographiques, mais restent modifiables
par l’utilisateur. Une évolution du score ou des valeurs par défaut doit être
testée depuis `visualization-tab/` jusqu’à la primitive concernée, pas
seulement sur la carte finale.

Les légendes reflètent les primitives visibles et leur classification. Les
annotations, l’échelle, l’orientation, les indications géographiques et les
facettes appartiennent à l’habillage : ils sont persistés et exportés, mais ne
changent ni la géométrie ni le moteur de rendu. Les facettes partagent une
instance Deck et plusieurs vues, elles ne créent pas une carte WebGL par case.

### Suggestions, légendes et habillage sûr

La détection sémantique (`semio-detector.utils.ts`) qualifie les variables avant
que `viz-suggester.service.ts` classe les patrons de visualisation possibles.
Une quantité absolue mène en général vers des symboles proportionnels, un ratio
vers une choroplèthe, et une variable qualitative vers une palette catégorielle.
`suggestion.service.ts` applique ensuite le choix de l’utilisateur : une
suggestion ne doit jamais masquer la configuration finale ni empêcher sa
modification.

Les générateurs SVG génériques de légende vivent dans
`commons/components/legend/`, `map/components/legend-overlay.svelte` les place
sur la carte, et `step-toolbar/tools/legend/` expose leur réglage. Cette
séparation évite de lier le rendu SVG à l’état d’édition.

`LegendSvg.svelte` est le seul point qui injecte du SVG avec `{@html}`. Toute
chaîne issue d’un jeu de données ou d’une configuration doit y être échappée
avec les utilitaires dédiés aux textes et attributs SVG. Une évolution de
légende doit couvrir le rendu à l’écran, l’export et ce cas de sécurité.

### Filtres, interaction et overlays

Les filtres de données et de tables sont appliqués aux tables Arrow avant les
factories par filterArrowTableByDataFilters et
filterArrowTableByTableFilters. Il n'existe pas de DataFilterExtension ni de
propriété yearFilter dans le rendu actuel.

Les données binaires conservent les identifiants d'entités et leur source
métier. Le service d'infobulle peut ainsi résoudre un résultat de sélection
Deck vers la bonne ligne Arrow, y compris pour une visualisation split.

Les légendes, annotations, indicateurs et éléments de mise en page sont des
overlays DOM ou SVG. Ils ne sont pas des primitives Deck. Une modification de
leur affichage doit respecter le mode d'export, qui passe par
globalState.isMapExporting plutôt que par un changement artificiel d'étape.

## Projections et fonds

Le rendu reçoit une projection résolue à partir des choix cartographiques :
projection manuelle, projection du fond ou projection composite. Les
projections orthographiques sont appliquées par geoarrow-deck-stream. Les
projections Web Mercator ou globe nécessaires aux fonds tuilés sont gérées par
MapLibre.

Les projections non identitaires peuvent nécessiter un masque ou un contour de
sphère. Les projections composites créent plusieurs contextes de carte, par
exemple un territoire principal et des encarts. Leur mise en page doit rester
stable pour que les couches, labels et interactions restent cohérents. Le
modèle métier complet est décrit dans FONDS_PROJECTIONS.md.

## Performance et diagnostic

Les règles suivantes sont des invariants de performance :

- Conserver Arrow et GeoArrow jusqu'aux factories. N'utiliser GeoJSON qu'en
  secours explicite.
- Réutiliser les mêmes objets Table et projection quand les données ne
  changent pas. Les caches WeakMap sont fondés sur leur identité.
- Au-delà de 2 000 lignes, le parse GeoArrow peut être délégué à un Worker. Un
  cache manquant peut produire provisoirement une couche vide, puis une mise à
  jour réactive lorsque le résultat arrive.
- Le Worker expire après 30 secondes et bascule vers le thread principal en cas
  d'échec. Le réglage local khartis:disable-parse-worker permet de diagnostiquer
  cette voie.
- Les chargements de jeux de données sont séquentiels afin de limiter les pics
  de mémoire.
- Utiliser les marques de performance et deck-debug.store.svelte.ts avant
  d'attribuer un ralentissement à une primitive ou à Deck.

| Symptôme                            | Parcours de diagnostic                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------- |
| Carte vide après changement de fond | Vérifier le mode choisi, l'état du style MapLibre, puis useMapLayers                        |
| Couche utilisateur absente          | Vérifier la table Arrow, ses métadonnées GeoArrow et les filtres appliqués avant la factory |
| Rendu lent après une projection     | Vérifier la réutilisation des tables et projections, le Worker et les caches du bridge      |
| Ressources GPU conservées           | Vérifier le cycle finalize de l'overlay, de MapLibre et de Deck                             |

## Étendre et vérifier le rendu

Pour ajouter ou modifier une primitive :

1. partir du contrat de visualisation et de la factory concernée ;
2. conserver le chemin binaire, les identifiants de sélection et l'ordre des
   primitives ;
3. traiter les contrats directs et split si la primitive affiche des données
   jointes ;
4. vérifier les deux moteurs lorsque la couche peut coexister avec un fond
   MapLibre ;
5. couvrir le cas de projection, le cas filtré et le cas sans WebGL2 lorsque
   le comportement le concerne.

Les tests proches du code, notamment ceux du bridge GeoArrow, du Worker, des
factories, des filtres et du service de fonds, sont la preuve vivante à mettre
à jour avec ce document.
