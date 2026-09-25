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
| Textes    | `text-layer-factory` : `TextLayer`                                        | lien aux entités, lisibilité, ordre par rapport aux géométries |
| Densité   | `density-layer-factory` : `ScatterplotLayer`, points calculés par DuckDB  | calcul préalable ; peut remplacer l'aplat polygonal            |

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
