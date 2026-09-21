# Discrétisation et couleurs

Cette page couvre la chaîne qui transforme une variable en classes, puis ces
classes en couleurs, en motifs et en légende. C'est le sous-système le plus
chargé en décisions métier : une borne mal calculée ou une palette mal choisie
change la lecture de la carte sans jamais lever d'erreur.

Le rendu des primitives qui consomment ces classes est décrit dans
[Rendu cartographique](RENDU_CARTOGRAPHIQUE.md); les macros SQL et leur cache
dans [Import et DuckDB](IMPORT_DUCKDB.md).

## Responsabilités et points d'entrée

| Fichier                                        | Rôle                                                                          |
| ---------------------------------------------- | ----------------------------------------------------------------------------- |
| `duckdb/macros/breaks.ts`                      | les huit macros SQL : six méthodes, plus `round_thresholds` et `round_bounds` |
| `commons/services/classification.service.ts`   | orchestre les macros, arrondit, compte les effectifs, génère les couleurs     |
| `commons/utils/discretization.utils.ts`        | le contrat de nombre de classes et les notes affichées à l'utilisateur        |
| `commons/components/palette-popover/`          | les familles de palettes, leur aperçu et leur sélection                       |
| `commons/services/color-suggestion.service.ts` | les couleurs rapides proposées par rôle (contour, absence de données, mer…)   |
| `commons/services/pattern-palette.service.ts`  | les motifs associés aux classes                                               |
| `step-toolbar/tools/color-blindness/`          | la simulation des troubles de la vision des couleurs                          |
| `visualization-tab/components/discretization/` | le panneau, la modale et l'histogramme                                        |

Le calcul vit dans DuckDB, jamais en JavaScript : `calculateBreaks()` construit
une requête vers une macro et lit le résultat. Un nouveau mode de
discrétisation s'ajoute donc par une macro plus une entrée dans
`mapMethodToMacro()`, pas par une boucle de calcul côté client.

## Les sept méthodes

| Méthode (`ClassificationMethod`) | Macro DuckDB   | Contrainte propre                                                   |
| -------------------------------- | -------------- | ------------------------------------------------------------------- |
| `kmeans` (seuils naturels)       | `kmeans`       | —                                                                   |
| `quantiles`                      | `quantile`     | —                                                                   |
| `equal_interval`                 | `equi_width`   | —                                                                   |
| `q6`                             | `q6`           | exactement 6 classes, bornes figées à 5 / 27,5 / 50 / 72,5 / 95 %   |
| `nested_means`                   | `nested_means` | uniquement 2, 4, 8 ou 16 classes                                    |
| `head_tail`                      | `headtail2`    | le nombre de classes est déterminé par la série, pas par la demande |
| `manual`                         | aucune         | bornes éditées par l'utilisateur, jamais recalculées                |

`suggestClassificationDefaults()` propose une méthode initiale à partir de
l'asymétrie de la série : `head_tail` au-delà d'une asymétrie de 3,
`quantiles` au-delà de 1,5 en valeur absolue, sinon la méthode courante. Il
plafonne aussi le nombre de classes à un tiers du nombre de lignes, avec un
minimum de 2. C'est une suggestion : l'utilisateur reste libre de la contredire.

`manual` est le seul mode où l'arrondi ne s'applique pas. Une borne saisie à la
main est reprise telle quelle.

## Le contrat de nombre de classes

Trois nombres cohabitent, et les confondre est la source d'erreur la plus
fréquente de ce domaine :

- **demandé** — ce que l'utilisateur a réglé, normalisé par
  `resolveRequestedClassCount()` (Q6 devient 6, les moyennes emboîtées sont
  ramenées à la puissance de 2 la plus proche);
- **naturel** (`naturalClassCount`) — ce que la méthode détermine seule.
  Aujourd'hui seul head/tail en produit un;
- **obtenu** — le nombre de classes réellement construites, après que des
  bornes dupliquées ou hors intervalle ont été écartées.

`calculateBreaks()` réduit d'abord la demande quand la série ne peut pas la
porter : si le nombre de valeurs distinctes est inférieur ou égal au nombre de
classes demandé, il retombe à `distinctCount - 1`, puis à la puissance de 2
inférieure pour les moyennes emboîtées.

Head/tail est un cas particulier assumé : sa cascade doit être demandée
**entière** à la macro, puis tronquée côté service. Si on demandait
directement `n` classes, son nombre naturel cesserait d'être observable et
l'interface ne pourrait plus expliquer pourquoi elle n'en propose que trois.

Quand l'obtenu est inférieur à l'atteignable, `resolveDiscretizationNote()`
produit une note que l'interface affiche, plutôt que de laisser un écart
silencieux :

| Note              | Sens                                                         |
| ----------------- | ------------------------------------------------------------ |
| `q6-unavailable`  | Q6 n'a pas pu rendre ses 6 classes                           |
| `head-tail-limit` | la série ne porte que moins de 3 paliers naturels            |
| `merged-breaks`   | des bornes ont fusionné, il y a moins de classes que demandé |
| `empty-classes`   | des classes existent mais ne contiennent aucune valeur       |

**Invariant :** un écart entre demandé et obtenu doit toujours se traduire par
une note. Une modification de ce domaine qui fait disparaître une note sans
supprimer la cause est une régression, même si la carte reste plausible.

## Arrondi : deux objets distincts

`round_thresholds` arrondit les **bornes de classe**, `round_bounds` arrondit
les **bornes d'échelle** affichées. Les deux ne jouent pas le même rôle et ne
se remplacent pas.

L'arrondi des bornes de classe est une simplification visuelle, et il ne doit
jamais changer l'affectation des entités. `roundBreaks()` applique donc une
garde : si les bornes arrondies, une fois nettoyées, ne sont plus aussi
nombreuses que les bornes d'origine, le résultat arrondi est **jeté** et les
bornes brutes sont conservées, avec un avertissement journalisé. Un arrondi ne
fusionne pas une classe.

`roundedMin` et `roundedMax` sont des **bornes d'affichage** portées par
`BreaksResult` puis par `ClassificationConfig`. Elles servent à la légende et
ne participent jamais à l'affectation d'une entité à une classe, qui se fait à
partir des seules bornes. `roundBounds()` ne les élargit que si l'arrondi
déborde réellement vers l'extérieur, pour ne pas rétrécir l'échelle.

## Point de rupture et palettes divergentes

`detectDivergingBreakpoint()` ne propose zéro comme pivot que si la série
traverse effectivement zéro. Il ne devine rien d'autre : un pivot métier (une
moyenne, un seuil réglementaire) reste à la charge de l'utilisateur.

Quand un pivot est posé, les bornes sont calculées en deux passes
indépendantes, sous le pivot et au-dessus, puis recollées avec le pivot au
milieu. `breakpointLowerClassCount` retient combien de classes se trouvent sous
le pivot, pour que la légende et la palette se répartissent comme la carte.

`computeDivergingSplit()` détermine si une classe **chevauche** le pivot. Dans
ce cas la palette reçoit une classe centrale; sinon elle est symétrique. C'est
ce qui évite qu'une palette divergente place sa couleur neutre à côté du pivot
réel.

## Palettes

Les couleurs sont produites par `@ateliercartographie/ok-palette`, qui
travaille en OKLCH pour que les paliers soient perceptuellement réguliers.
`generateColorsForBreaks()` appelle `sequential()` ou `divergentSequential()`,
puis `resolvePalette()` en sortie WebGL.

Quatre types cohabitent (`PALETTE_TYPE`) : `sequential`, `diverging`,
`qualitative` et `pattern`. Le type doit suivre la sémantique de la variable —
une palette qualitative sur une variable ordonnée détruit l'ordre que la carte
est censée montrer.

Les familles proposées sont déclarées dans `palette-popover/palette.constants.ts` :
monochromes, bicolores, sépia, niveaux de gris, vif, pastel, et une famille
`colorblind` séparée pour les trois types (séquentiel, divergent, qualitatif).

Les jeux adaptés aux troubles de la vision des couleurs sont sourcés, pas
inventés : Bang Wong (_Nature Methods_ 8, 441, 2011) et Paul Tol (SRON
EPS-TN-09-002), dans `colorblind-palette.constants.ts`. Le noir de la série de
Wong est volontairement écarté : Khartis propose des catégories de poids visuel
comparable, et le noir écrase toutes les autres teintes.

`color-suggestion.service.ts` est un objet différent : il ne produit pas de
palette mais les **couleurs rapides proposées par rôle** (contour, absence de
données, texte, limite, territoire, mer). Un contour a besoin de contraste avec
le remplissage qu'il entoure, un fond doit rester neutre derrière la donnée :
les propositions dépendent donc du rôle et, quand c'est pertinent, d'une
couleur de référence.

## Motifs

Les trames viennent de `@ateliercartographie/motif.js`. Elles s'utilisent comme
un type de palette à part entière (`pattern`), et servent aussi à marquer
l'absence de données. Le rendu carte passe par une texture
(`map/layers/pattern-texture.ts`), tandis que les aperçus et la légende passent
par des `defs` SVG.

## Simulation des troubles de la vision des couleurs

`color-blindness.filter.ts` fournit des matrices SVG `feColorMatrix` pour huit
profils : protanopie, deutéranopie, tritanopie, leurs formes atténuées, ainsi
que l'achromatopsie et l'achromatomalie. C'est un filtre d'affichage posé sur
la carte, destiné à la relecture avant publication. Il ne modifie ni la
configuration, ni l'export.

## Ce qui est persisté

`ClassificationConfig` (`commons/stores/visualization.types.ts`) est sauvegardé
dans le projet et dans l'archive `.kh`. Il porte la méthode, le nombre de
classes, les bornes et leurs effectifs, les bornes d'échelle arrondies, les
couleurs résolues, l'identifiant de palette, l'inversion, les libellés, le
pivot et sa répartition, le motif, et la déclinaison catégorielle (formes,
tailles, contours).

Les couleurs sont donc **résolues et stockées**, pas seulement référencées par
un identifiant de palette. Une carte rouverte affiche les couleurs avec
lesquelles elle a été publiée, même si une famille de palettes évolue par la
suite. Toute évolution de ce type est un changement de format : relire
[Compatibilité du format projet](PROJECT_FORMAT_COMPATIBILITY.md) avant d'y
toucher.

## Étendre et vérifier

- Une nouvelle méthode s'ajoute par une macro dans `breaks.ts`, une entrée dans
  `mapMethodToMacro()` et, si elle a une contrainte propre, dans
  `resolveRequestedClassCount()`. Si son nombre de classes dépend de la série,
  elle doit renseigner `naturalClassCount` et produire une note.
- Une modification d'arrondi doit être vérifiée sur une série où l'arrondi
  fusionne des bornes : le résultat attendu est le rejet de l'arrondi, pas une
  classe en moins.
- Une modification de palette doit être regardée à l'écran **et** à l'export,
  puis en simulation de daltonisme.
- Les tests correspondants vivent dans `tests/duckdb/` pour les macros et dans
  `visualization-tab/components/discretization/` pour le contrat de classes.

## Diagnostic ciblé

| Symptôme                                              | Piste                                                                             |
| ----------------------------------------------------- | --------------------------------------------------------------------------------- |
| Moins de classes que demandé, sans explication        | la note a-t-elle été produite et affichée ? voir `resolveDiscretizationNote()`    |
| Q6 rend autre chose que 6 classes                     | série trop peu variée, ou concentrée : `isQ6ContractHonoured()` doit le signaler  |
| La légende et la carte n'ont pas les mêmes bornes     | `roundedMin` / `roundedMax` utilisés pour affecter des classes au lieu d'afficher |
| Une palette divergente décalée par rapport au pivot   | `computeDivergingSplit()` et `breakpointLowerClassCount`                          |
| Bornes visuellement laides après un changement mineur | l'arrondi a probablement été rejeté : chercher l'avertissement dans le journal    |
