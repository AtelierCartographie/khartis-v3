# Discrétisation et couleurs

La chaîne qui transforme une variable en classes, puis en couleurs, motifs et
légende. C'est le domaine le plus chargé en décisions cartographiques : une
borne mal calculée ou une palette mal choisie change la lecture de la carte
sans lever d'erreur.

Le rendu des primitives est décrit dans
[Rendu cartographique](RENDU_CARTOGRAPHIQUE.md), les macros SQL dans
[Import et DuckDB](IMPORT_DUCKDB.md).

## Points d'entrée

Chemins relatifs à `src/lib/features/`.

| Fichier                                        | Rôle                                                            |
| ---------------------------------------------- | --------------------------------------------------------------- |
| `duckdb/macros/breaks.ts`                      | macros de discrétisation et d'arrondi                           |
| `commons/services/classification.service.ts`   | appel des macros, arrondi, effectifs, génération des couleurs   |
| `commons/utils/discretization.utils.ts`        | contrat de nombre de classes et notes affichées                 |
| `commons/components/palette-popover/`          | familles de palettes, aperçu, sélection                         |
| `commons/services/color-suggestion.service.ts` | couleurs proposées par rôle (contour, absence de données, mer…) |
| `commons/services/pattern-palette.service.ts`  | motifs associés aux classes                                     |
| `step-toolbar/tools/color-blindness/`          | simulation des troubles de la vision des couleurs               |
| `visualization-tab/components/discretization/` | panneau, modale et histogramme                                  |

Le calcul des bornes vit dans DuckDB : `calculateBreaks()` appelle une macro et
lit son résultat. Une nouvelle méthode s'ajoute par une macro et une entrée
dans `mapMethodToMacro()`, jamais par une boucle JavaScript.

## Méthodes

| Méthode (`ClassificationMethod`) | Macro          | Contrainte                                                        |
| -------------------------------- | -------------- | ----------------------------------------------------------------- |
| `kmeans` (seuils naturels)       | `kmeans`       | —                                                                 |
| `quantiles`                      | `quantile`     | —                                                                 |
| `equal_interval`                 | `equi_width`   | —                                                                 |
| `q6`                             | `q6`           | 6 classes, bornes aux centiles 5 / 27,5 / 50 / 72,5 / 95          |
| `nested_means`                   | `nested_means` | 2, 4, 8 ou 16 classes                                             |
| `head_tail`                      | `headtail2`    | nombre de classes déterminé par la série                          |
| `manual`                         | —              | bornes saisies par l'utilisateur, jamais recalculées ni arrondies |

`suggestClassificationDefaults()` propose une méthode selon l'asymétrie de la
série : `head_tail` à partir de 3, `quantiles` à partir de 1,5 en valeur
absolue, sinon la méthode courante. Le nombre de classes est plafonné à
max(2, lignes / 3). L'utilisateur reste libre de ce choix.

## Nombre de classes

Trois nombres coexistent ; les confondre est l'erreur la plus fréquente du
domaine :

- **demandé** : le réglage de l'utilisateur, normalisé par
  `resolveRequestedClassCount()` (Q6 → 6, moyennes emboîtées → puissance de 2
  la plus proche) ;
- **naturel** (`naturalClassCount`) : celui que la méthode détermine seule —
  aujourd'hui, seulement head/tail ;
- **obtenu** : les classes réellement construites, après élimination des
  bornes dupliquées ou hors intervalle.

Si la série a au plus autant de valeurs distinctes que de classes demandées,
`calculateBreaks()` retombe à max(2, valeurs distinctes − 1), puis à la
puissance de 2 inférieure pour les moyennes emboîtées.

Head/tail est demandé **en entier** à la macro (au moins 12 paliers), puis
tronqué par le service ; sinon son nombre naturel ne serait plus observable et
l'interface ne pourrait pas expliquer pourquoi elle n'en propose que trois.

`resolveDiscretizationNote()` signale à l'utilisateur tout écart :

| Note              | Sens                                                   |
| ----------------- | ------------------------------------------------------ |
| `q6-unavailable`  | Q6 n'a pas pu produire ses 6 classes                   |
| `head-tail-limit` | la série porte moins de 3 paliers naturels             |
| `merged-breaks`   | des bornes ont fusionné : moins de classes que demandé |
| `empty-classes`   | des classes ne contiennent aucune valeur               |

**Invariant :** tout écart entre demandé et obtenu produit une note. Faire
disparaître une note sans supprimer sa cause est une régression, même si la
carte paraît correcte.

## Arrondi

Deux macros, deux rôles : `round_thresholds` arrondit les **bornes de classe**,
`round_bounds` les **bornes d'échelle** affichées.

- **Bornes de classe.** L'arrondi ne doit jamais changer l'affectation d'une
  entité. Si les bornes arrondies sont moins nombreuses que les bornes
  d'origine, `roundBreaks()` rejette l'arrondi, garde les bornes brutes et
  journalise un avertissement.
- **Bornes d'échelle.** `roundedMin` et `roundedMax` (dans `BreaksResult`, puis
  `ClassificationConfig`) servent à l'affichage de la légende, jamais à
  l'affectation. `roundBounds()` garde le minimum arrondi tant qu'il reste sous
  la première borne de classe (et le maximum au-dessus de la dernière) ; sinon,
  il garde la valeur brute. L'arrondi peut donc resserrer légèrement l'échelle,
  sans empiéter sur une classe.

## Point de rupture et palettes divergentes

`detectDivergingBreakpoint()` propose zéro comme pivot seulement si la série
contient des valeurs négatives et positives. Tout autre pivot (moyenne, seuil
réglementaire) est choisi par l'utilisateur.

Avec un pivot, les bornes sont calculées en deux passes, sous le pivot et
au-dessus, puis réunies. `breakpointLowerClassCount` retient le nombre de
classes sous le pivot, pour que légende et palette se répartissent comme la
carte.

`computeDivergingSplit()` répartit la palette selon la position réelle des
bornes. Si une classe chevauche le pivot, elle reçoit la couleur centrale ;
sinon, les classes se partagent entre les deux côtés, éventuellement de façon
asymétrique. La couleur neutre tombe ainsi sur le pivot réel.

## Palettes

Les couleurs sont produites par `@ateliercartographie/ok-palette`, en OKLCH,
pour des paliers perceptuellement réguliers. `generateColorsForBreaks()`
appelle `sequential()` ou `divergentSequential()`, puis `resolvePalette()` pour
la sortie WebGL.

Quatre types (`PALETTE_TYPE`) : `sequential`, `diverging`, `qualitative` et
`pattern`. Le type suit la nature de la variable : une palette qualitative sur
une variable ordonnée détruit l'ordre que la carte doit montrer.

Les familles sont déclarées dans `palette-popover/palette.constants.ts` :
monochromes, bicolores, sépia, niveaux de gris, vif, pastel, et une famille
`colorblind` pour chacun des trois types de couleur. Les jeux adaptés aux
troubles de la vision viennent de Bang Wong (_Nature Methods_ 8, 441, 2011) et
Paul Tol (SRON EPS-TN-09-002), dans `colorblind-palette.constants.ts`. Le noir
de Wong est écarté : il écraserait les autres catégories.

`color-suggestion.service.ts` ne produit pas de palette mais des couleurs
rapides par rôle (contour, absence de données, texte, limite, territoire, mer…),
calculées au besoin par rapport à une couleur de référence : un contour doit
contraster avec son remplissage, un fond rester neutre.

## Motifs

Les trames viennent de `@ateliercartographie/motif.js`. Elles forment un type
de palette (`pattern`) et marquent aussi l'absence de données. Sur la carte,
elles passent par une texture (`map/layers/pattern-texture.ts`) ; dans les
aperçus et la légende, par des `defs` SVG.

## Simulation des troubles de la vision

`color-blindness.filter.ts` fournit des matrices `feColorMatrix` pour huit
profils : protanopie, deutéranopie, tritanopie et leurs formes atténuées,
achromatopsie et achromatomalie. C'est un filtre d'affichage pour relire une
carte avant publication : il ne change ni la classification ni l'export. Le
profil choisi est enregistré dans les réglages d'interface du projet.

## Persistance

`ClassificationConfig` (`commons/stores/visualization.types.ts`) est enregistré
dans le projet et l'archive `.kh` : méthode, nombre de classes, bornes et
effectifs, bornes d'échelle, couleurs résolues, identifiant de palette,
inversion, libellés, pivot et répartition, motif, déclinaison catégorielle.

Les couleurs sont **stockées résolues** : une carte rouverte garde les couleurs
avec lesquelles elle a été faite, même si une famille de palettes évolue.
Modifier cette structure est un changement de format : voir
[Compatibilité du format projet](PROJECT_FORMAT_COMPATIBILITY.md).

## Étendre et tester

- Nouvelle méthode : une macro dans `breaks.ts`, une entrée dans
  `mapMethodToMacro()` et, si elle a une contrainte, dans
  `resolveRequestedClassCount()`. Si son nombre de classes dépend de la série,
  elle renseigne `naturalClassCount` et produit une note.
- Arrondi : tester une série où l'arrondi fusionnerait des bornes ; le résultat
  attendu est le rejet de l'arrondi, pas une classe en moins.
- Palette : vérifier à l'écran, à l'export, puis en simulation.
- Tests : macros dans `tests/duckdb/macros-breaks.test.ts` ; contrat de classes
  dans `tests/pipeline/discretization-utils.test.ts` et
  `tests/pipeline/classification.service.test.ts`.

## Diagnostic

| Symptôme                                        | Piste                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------- |
| Moins de classes que demandé, sans explication  | la note a-t-elle été produite et affichée ? (`resolveDiscretizationNote()`)     |
| Q6 ne donne pas 6 classes                       | série trop peu variée ou concentrée ; `isQ6ContractHonoured()` doit le signaler |
| Légende et carte n'ont pas les mêmes bornes     | `roundedMin` / `roundedMax` utilisés pour affecter au lieu d'afficher           |
| Palette divergente décalée par rapport au pivot | `computeDivergingSplit()` et `breakpointLowerClassCount`                        |
| Bornes peu lisibles après un changement mineur  | l'arrondi a sans doute été rejeté : chercher l'avertissement dans le journal    |
