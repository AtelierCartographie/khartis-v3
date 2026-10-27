# Rendu cartographique

Le chemin des données spatiales jusqu'au canevas : moteurs, couches,
primitives, légendes et interactions. Les caches, workers et mesures de
performance sont dans [Performance et workers](PERFORMANCE_ET_WORKERS.md) ; les
fonds et projections dans [Fonds et projections](FONDS_PROJECTIONS.md).

Le chemin normal est binaire :

```text
DuckDB WASM ou GeoParquet
  → Apache Arrow avec métadonnées GeoArrow
  → geoarrow-deck-stream
  → Deck.gl et buffers GPU
```

GeoJSON n'est qu'un repli. Le produire sur le chemin principal multiplie les
allocations et neutralise les caches indexés sur les tables Arrow.

## Points d'entrée

Chemins relatifs à `src/lib/features/map/`.

| Besoin                              | Fichier                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------ |
| Orchestration de la carte           | `components/thematic-map.svelte`                                         |
| Création et destruction des moteurs | `hooks/use-map-init.svelte.ts`                                           |
| Données et couches                  | `hooks/use-map-display-data.svelte.ts`, `hooks/use-map-layers.svelte.ts` |
| Choix du moteur                     | `utils/render-engine.utils.ts`                                           |
| Conversion GeoArrow binaire         | `utils/geoarrow-stream-bridge.utils.ts`                                  |
| Couches Deck.gl                     | `layers/layer-factory.ts` et les factories par primitive                 |
| Infobulles et sélection             | `interactions/tooltip.service.ts`                                        |

`thematic-map.svelte` coordonne visualisation, fonds, projection et mises à
jour de couches ; il attend qu'un style MapLibre soit stabilisé avant de
demander de nouvelles couches. Chaque hook possède son cycle de vie : un
composant d'interface ne le contourne pas.

## Deux moteurs

| Mode                   | Quand                                 | Rôle                                                                                             |
| ---------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Deck.gl orthographique | fond blanc                            | `OrthographicView`, projections d3 appliquées aux buffers GeoArrow                               |
| MapLibre intercalé     | style de fond tuilé ou fond OSM actif | fond tuilé et interactions MapLibre, couches Deck.gl dans `MapboxOverlay({ interleaved: true })` |

Le choix est fait par `shouldUseMapLibreInterleaved()` (enveloppé par
`resolveMapRenderEngine()`), jamais par une couche. Changer de mode recrée les
ressources, puis `useMapLayers` reconstruit les couches pour le nouveau moteur.

Sans WebGL2, le mode orthographique affiche un canevas de repli. C'est un état
dégradé à diagnostiquer, pas un moyen de masquer une erreur de données.

## Contrats de données

Deux parcours coexistent :

```text
Données importées   fichier → pipeline → DuckDB → Arrow IPC → GeoArrow → Deck.gl
Fond du catalogue   GeoParquet → parquet-wasm → Arrow/GeoArrow → Deck.gl
```

`useMapDisplayData` produit l'un des contrats suivants :

| Contrat               | Usage                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------- |
| Table Arrow directe   | géométrie et attributs dans la même table                                              |
| `SplitRenderingTable` | géométrie du fond et attributs du jeu de données séparés, reliés par `featureIdColumn` |
| Table de densité      | résultat DuckDB, réexposé en `geoarrow.wkb`                                            |
| GeoJSON de secours    | cas incompatibles avec le chemin binaire                                               |

Les métadonnées GeoArrow sont un contrat d'entrée : sans géométrie annotée,
`createDeckLayers` ne produit aucune couche. DuckDB les réattache après les
vues et jointures qui les perdent. Ne pas contourner ce refus par une
conversion.

## Cycle de vie WebGL

`useMapInit` est le seul à instancier les moteurs :

1. vérification de WebGL2 (mode orthographique) et calcul du ratio de rendu ;
2. création de Deck.gl avec `OrthographicView`, ou de MapLibre et de son
   `MapboxOverlay` ;
3. installation des interactions et des observateurs de taille ;
4. synchronisation des styles, des fonds et des couches ;
5. libération lors d'un changement de mode ou du démontage.

La libération suit un ordre précis : `overlay.finalize()`, puis `map.remove()`,
puis `deck.finalize()`, puis destruction du `Device` luma.gl et de son
`CanvasContext` (sans quoi le contexte fuit). Ne pas la remplacer par un
`setProps` avec une liste de couches vide.

Le ratio de rendu (`render-pixel-ratio.utils.ts`) vise un DPR entre 2 et 4,
compense le zoom de page et reste borné par `MAX_TEXTURE_SIZE` et
`MAX_RENDERBUFFER_SIZE` : un grand export ne doit pas créer de buffer que le GPU
refuse.

## Couches et primitives

`layer-factory` répartit les géométries et compose les couches dans l'ordre des
primitives configurées :

| Primitive | Factory et couches Deck.gl                                                | À préserver                                                    |
| --------- | ------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Polygones | `polygon-layer-factory` : `SolidPolygonLayer` + `PathLayer` binaires      | aplat, contour, ordre, données jointes                         |
| Lignes    | `line-layer-factory` : `PathLayer`                                        | chemin binaire, style, ordre                                   |
| Points    | `point-layer-factory` : `MultiShapeLayer` (dérivée de `ScatterplotLayer`) | taille, symbole, picking, ordre des symboles                   |
| Textes    | `text-layer-factory` : `TextLayer`, `LabelLeaderLayer` pour les filets    | lien aux entités, lisibilité, ordre par rapport aux géométries |
| Densité   | `density-layer-factory` : `ScatterplotLayer`, points calculés par DuckDB  | calcul préalable ; peut remplacer l'aplat polygonal            |

### Étiquettes déplacées et filets

À l'étape Habillage, une étiquette se déplace à la souris
(`interactions/label-drag.controller.ts`). Un double-clic ouvre son éditeur
(`components/label-text-editor.svelte`) : le texte saisi remplace la valeur des
données pour cette entité (traduction, correction), seul ce qui diffère des
données est enregistré, et l'éditeur permet aussi de replacer l'étiquette. Les
glyphes des textes saisis rejoignent le jeu de caractères des couches de texte.
La position est le centre du bloc d'étiquettes (principale et secondaire), en
pixels de page depuis l'ancrage de l'entité. Elle est rangée par visualisation
et par clé d'entité dans `labelLayoutStore`, puis enregistrée dans
`layoutSettings.labels`. Dans une collection de cartes, chaque facette a son
propre identifiant de visualisation : une étiquette déplacée ou corrigée dans
une facette ne bouge pas dans les autres. La carte simple et la collection
partagent ce comportement par `useLabelEditing`. La clé vient de l'identifiant du fond joint (`f:`) ou du
`__id` de la ligne (`r:`) : elle survit à un rechargement, pas à un réimport de
données modifiées.

Pendant le glisser, l'étiquette est retirée des couches thématiques et un aperçu
est posé au-dessus de la pile, comme le surlignage au survol : suivre le
pointeur ne reconstruit pas les couches.

Le filet (`computeLabelLeader`, qui délègue à `leaderGeometry` du paquet
`@ateliercartographie/label-placer`) part d'une zone tampon autour du symbole et ne
suit que trois directions : une branche à 45° qui quitte le symbole, puis une
branche horizontale vers le milieu du côté de l'étiquette qui lui fait face, ou
verticale vers son bord haut ou bas quand l'étiquette est surtout au-dessus ou
en dessous. Il n'apparaît qu'au-delà d'un écart minimal. L'étiquette est ferrée
vers l'entité (`resolveLabelAlignment`) : à gauche quand elle est à droite du
centroïde, à droite quand elle est à gauche, au centre au-dessus ou en dessous.
Une étiquette plus large que 10 em passe à la ligne après un espace ou un trait
d'union, jamais au milieu d'un mot (`wrapLabelText`) ; une dernière ligne de trois
caractères ou moins rejoint la précédente. Khartis calcule ces lignes lui-même et
les passe à deck.gl, de sorte que mesure, rendu et export SVG coïncident.
Les étiquettes principale et secondaire s'empilent chacune selon sa hauteur
réelle, lignes renvoyées comprises, avec un interligne fixe.

`LabelLeaderLayer` ancre ses deux
extrémités sur l'entité et les décale en pixels dans le shader, comme le
`getPixelOffset` du `TextLayer` : le filet garde sa longueur à chaque zoom.

### Placement automatique des étiquettes

L'option « Placement automatique » du panneau Textes (`collisionDetection` du
primitif texte) confie le placement au paquet `@ateliercartographie/label-placer`
(`utils/label-auto-placement.utils.ts`). La fabrique projette chaque ancrage en
pixels de page à travers le viewport deck courant, mesure le bloc d'étiquettes et
le rayon du symbole, puis le moteur choisit pour chaque bloc une position autour
du symbole (pratique de l'Atelier), dans le symbole s'il y tient, ou plus loin avec un
filet. Le résultat est le même centre de bloc qu'un déplacement manuel : ferrage,
empilement, filets et export SVG suivent sans chemin propre.

- Les étiquettes retenues par un filtre Textes sont requises : jamais masquées,
  en chevauchement en dernier recours. Sans filtre, celles qui ne trouvent pas
  de place sont masquées, des moins importantes aux plus importantes (rayon du
  symbole, puis taille du texte, puis valeur). Le filtre se lit dans ses
  identifiants de lignes : en rendu scindé, la table d'attributs est toujours
  restreinte, filtre ou non.
- Sans symbole, l'étiquette d'un polygone passe au moteur avec le contour de
  son entité, projeté en pixels de page et allégé comme les contours du fond :
  elle se place entièrement dedans ou entièrement dehors, jamais à cheval sur
  le contour, et hors des autres polygones. Points représentatifs et polygones
  sont appariés par identifiant d'entité en rendu scindé, par ligne sinon. Une
  étiquette de polygone ne prend pas de filet (elle tomberait chez un voisin)
  et ne garde qu'un pixel de marge autour du texte au lieu du fond de sécurité,
  sauf masque visible.
- Un texte d'une ligne qui peut se couper en deux lignes équilibrées
  (`wrapLabelTextInTwoLines`) est proposé au moteur sous cette seconde forme,
  à un léger surcoût ; le texte est dessiné dans la forme retenue.
- Une étiquette déplacée à la main est épinglée : un obstacle fixe pour les
  autres.
- Les symboles que le filtre Textes laisse sans étiquette restent dessinés : ils
  passent au moteur comme symboles seuls, des obstacles pour les étiquettes. En
  rendu scindé (jeu joint à un fond), leurs attributs ne sont lus que dans le
  périmètre des Textes, et ils ne sont pas transmis.
- Les bornes sont le cadre du fond de carte quand la projection en a un, sinon
  le canvas. Les éléments de page (légende, indications géographiques,
  annotations) sont des obstacles (`pageItemObstaclesStore`).
- Le contour des couches « Territoire » visibles (`ctx.labelOutlineTables`,
  orthographique seulement) est un obstacle souple : une étiquette évite de
  chevaucher une côte ou une frontière extérieure quand une autre position la
  vaut. Ces couches sont fusionnées en une géométrie, donc sans limites internes.
- L'option « Aligner en colonnes » (`labelColumns`, champ optionnel du primitif
  texte) range les étiquettes des groupes serrés en colonne à côté du groupe.
- Le placement est recalculé une fois la vue stabilisée
  (`labelPlacementViewStore`, 250 ms après un zoom, un déplacement ou un
  redimensionnement du canvas) et réutilise le résultat précédent pour que les
  étiquettes restent en place. Il est mis en cache par visualisation.
- Il ne s'applique pas aux collections de cartes, dont les cellules ont leur
  propre vue.

Polygones, lignes et points ont un repli `GeoJsonLayer`. Les couches de fond se
placent derrière ou devant les couches thématiques ; l'ordre affiché dans le
panneau reflète cet ordre, il n'en est pas une seconde source.

## Modèle de visualisation

Une visualisation associe une ou plusieurs primitives à une variable. Un
nouveau style précise une primitive, un mode et ses paramètres ; il ne crée pas
de concept parallèle.

| Mode          | Variable         | Conséquence                                                       |
| ------------- | ---------------- | ----------------------------------------------------------------- |
| Unique        | aucune           | style constant                                                    |
| Classifié     | quantitative     | bornes et palette ordonnée, calculées par DuckDB puis persistées  |
| Catégoriel    | qualitative      | couleur ou forme par modalité                                     |
| Proportionnel | quantité absolue | taille de symbole ou largeur de ligne proportionnelle à la valeur |

Une choroplèthe est un polygone classifié : sa variable doit être un taux ou un
ratio. Les effectifs absolus vont aux symboles proportionnels. Cette règle
guide la suggestion initiale, la légende et l'interface.

La primitive Textes a une hiérarchie typographique unique
(`visualization-tab/components/texts/text-hierarchy.utils.ts`) : la taille
secondaire se déduit de la primaire par un rapport nommé — `equal` (1),
`moderate` (0,75), `strong` (0,55). On choisit un niveau, pas une seconde
taille.

### Suggestions

`semio-detector.utils.ts` qualifie les variables, `viz-suggester.service.ts`
classe les visualisations possibles, puis
`visualization-tab/services/suggestion.service.ts` applique le choix de
l'utilisateur. Une suggestion ne masque jamais la configuration finale. Une
modification de score ou de valeur par défaut se teste depuis
`visualization-tab/` jusqu'à la primitive, pas seulement sur la carte finale.

## Légendes

| Rôle                     | Emplacement                            |
| ------------------------ | -------------------------------------- |
| Générateurs SVG          | `commons/components/legend/`           |
| Placement sur la carte   | `map/components/legend-overlay.svelte` |
| Réglages                 | `step-toolbar/tools/legend/`           |
| Segments et échantillons | `map/utils/legend-segments.utils.ts`   |

`commons/components/legend/legend-svg.svelte` est le seul `{@html}` de
l'application. Toute chaîne issue des données ou de la configuration y est
échappée avec `escapeSvgText` / `escapeSvgAttribute`.

La légende dessine ce que la carte dessine :

- **Valeurs réelles.** La légende n'a pas accès à la série (`dataset.data`
  n'est pas alimenté après l'import). Les paliers des symboles proportionnels
  sont choisis parmi les valeurs de l'échantillon `value_sample` des
  statistiques de colonne, puis réduits à ce que la place permet d'afficher.
- **Tailles réelles.** Une classe a dans la légende la taille qu'elle a sur la
  carte. Quand un générateur applique sa propre échelle (`draw_symbols_legend`
  dessine un glyphe deux fois plus grand que la taille reçue), la compensation
  se fait au point d'appel.
- **Textes.** Des étiquettes de taille et de couleur uniques n'ont pas
  d'entrée de légende ; les autres primitives en gardent une, même en mode
  unique. `legend-subtitle.utils.ts` construit le sous-titre à partir des
  colonnes des primitives actives.

## Absence de données

L'absence de données a une seule définition : une valeur nulle, vide ou non
finie dans une colonne qui pilote une primitive. Ce n'en est pas :

- une entité du fond **non jointe**, qui n'est pas dessinée par la couche
  thématique ;
- une ligne **écartée par un filtre**, masquée elle aussi.
  `createSplitAwareRowAccessor` exige à chaque appel une valeur hors portée
  explicite (`OUT_OF_SCOPE_COLOR`, `OUT_OF_SCOPE_SIZE`).

Les colonnes concernées dépendent du mode de chaque primitive
(`getPrimitiveMissingDataColumns()`) ; en mode unique, seule la colonne
d'étiquette des Textes compte. DuckDB compte les valeurs manquantes sur les
lignes affichées, jointes et non filtrées (`getMissingValueCountsInScope`).
`rowScopeStore.hasMissingData()` conditionne l'entrée « Absence de données » de
la légende et la section correspondante des panneaux de primitive (contexte
`missing-data-availability.ts`), désactivée avec un message quand rien ne
manque.

Sur les polygones, une nouvelle visualisation hachure l'absence de données en
gris (`DEFAULT_MISSING_DATA_PATTERN_CONFIG`, sur la couleur d'absence de
données) pour qu'elle reste distincte de toute classe, quelle que soit la
palette. La légende reprend la même couleur et la même trame
(`getMissingDataLegendItem`), y compris dans le dégradé des classes. Un projet
enregistré garde le rendu qu'il avait choisi (`pattern: false` explicite).

## Filtres et interaction

Les filtres sont évalués par DuckDB : `rowScopeStore` obtient les identifiants
des lignes dans la portée de chaque primitive, puis `applyPrimitiveScopes`
(`use-map-layers.svelte.ts`) restreint les **tables d'attributs** avec
`selectRowsInScope` / `selectRowsByIndices` (`map/utils/arrow-filter.utils.ts`).
La géométrie n'est pas filtrée : une entité écartée reste adressable et est
dessinée avec les valeurs `OUT_OF_SCOPE_*`.

Les données binaires conservent les identifiants d'entité : le service
d'infobulle retrouve la ligne Arrow d'un résultat de picking, y compris en rendu
split.

Au survol, l'infobulle suit le curseur, bornée à la zone de la carte, et l'entité
survolée est cernée du même contour jaune que la recherche. Ce contour est une couche
ajoutée par `setLayers` au-dessus de la pile appliquée
(`map-hover-highlight.store.svelte.ts`, `layers/hover-highlight-overlay.ts`) :
il est construit à partir de la géométrie binaire de la couche survolée
(`khartisPickGeometry`), sans reconstruire les couches thématiques. Un clic
épingle l'inspecteur complet en haut de la carte.

Les textes sont survolables : leur boîte est cernée en jaune. En densité, un
remplissage transparent sous les points porte le survol : c'est le polygone,
qui porte la valeur, qui est cerné.

Les légendes en classes et en catégories (couleur de fond, de contour, de
texte, taille en classes des symboles, lignes et textes) désignent aussi
l'entité survolée :
les autres entrées s'estompent. Les générateurs marquent chaque entrée d'un
attribut `data-legend-entry` (classe, catégorie, absence de données), chaque
segment de légende sait résoudre l'entrée d'une ligne
(`LegendSegment.resolveEntry`, avec `getClassIndexForValue` comme la carte), et
`LegendSvg` bascule les classes CSS sans redessiner la légende. Toutes les
légendes d'une visualisation tirée du même jeu de données lisent la même ligne,
ce qui marque le lieu dans chaque carte d'une collection. Les exports ne portent
jamais cette marque.

## Habillage et facettes

Légendes, annotations, échelle, orientation, indications géographiques et
éléments de page sont des overlays DOM ou SVG, pas des couches Deck.gl. Ils
sont persistés et exportés sans toucher la géométrie ni le moteur. L'export
passe par `globalState.isMapExporting`, jamais par un changement d'étape.

Les facettes (collection de cartes) partagent une instance Deck.gl, avec une
`OrthographicView` par facette. Elles sont toujours rendues en mode
orthographique : un fond uniquement MapLibre n'y est pas dessiné et un
avertissement l'indique. En échelle commune, chaque facette est dessinée contre
le domaine fusionné de ses variables (`facets-shared-scale.ts`), que la légende
doit lire aussi. Un clic sur le titre d'une facette ouvre l'outil Collection de
cartes.

## Projections

Le rendu reçoit une projection résolue : manuelle, héritée du fond, ou
composite (territoire principal et encarts). En mode orthographique,
geoarrow-deck-stream applique la projection d3 ; Web Mercator et globe relèvent
de MapLibre. Les projections non identitaires peuvent ajouter un masque ou un
contour de sphère. Détails : [Fonds et projections](FONDS_PROJECTIONS.md).

## Diagnostic

| Symptôme                            | Vérifier                                                                                       |
| ----------------------------------- | ---------------------------------------------------------------------------------------------- |
| Carte vide après changement de fond | moteur choisi, état du style MapLibre, puis `useMapLayers`                                     |
| Couche utilisateur absente          | table Arrow, métadonnées GeoArrow, portée des filtres                                          |
| Rendu lent après une projection     | identité des tables et projections, worker de parse ([performance](PERFORMANCE_ET_WORKERS.md)) |
| Ressources GPU conservées           | ordre de libération : overlay, MapLibre, Deck.gl, `Device`                                     |

## Étendre une primitive

1. Partir du contrat de visualisation et de la factory concernée.
2. Conserver le chemin binaire, les identifiants de sélection et l'ordre des
   primitives.
3. Gérer les contrats direct et split si la primitive affiche des données
   jointes.
4. Vérifier les deux moteurs si la couche peut coexister avec un fond MapLibre.
5. Couvrir projection, filtre, facettes et absence de WebGL2 quand ils sont
   concernés.
6. Mettre à jour les tests voisins : bridge GeoArrow, worker, factories,
   filtres, service de fonds.
