# Suggestion de visualisation

Khartis suggère automatiquement des visualisations adaptées aux données importées. C'est un des apports distinctifs de l'outil : là où la plupart des logiciels laissent l'utilisateur choisir une forme graphique à l'aveugle, Khartis lit d'abord les données, en déduit ce qu'elles _sont_ au sens de la sémiologie graphique, puis propose les formes qui leur conviennent — classées par pertinence, la meilleure présélectionnée, toutes remplaçables par l'utilisateur.

Ce document décrit le fonctionnement de l'algorithme, les choix qui le motivent, et ses limites assumées. Les fichiers de référence sont indiqués dans chaque section.

---

## Fondements : Bertin et la grammaire des variables

L'algorithme repose sur la _Sémiologie graphique_ de Jacques Bertin (1967) et, plus indirectement, sur la _Grammar of Graphics_ de Wilkinson : une visualisation correcte découle du **niveau de mesure** de la variable représentée, pas d'un choix esthétique.

La distinction centrale — souvent absente des outils généralistes — est celle entre :

- **Stock (quantité absolue, QTA)** : population, naissances, tonnes de CO₂. Une grandeur dénombrable, extensive, dont la somme a un sens. Elle se représente par une **taille** (symboles proportionnels), jamais par un aplat de couleur : colorer une surface selon une valeur absolue confond l'effet de la valeur et celui de la taille du territoire.
- **Ratio (quantité relative, QTR)** : taux, densité, pourcentage, indice. Une grandeur intensive, comparable d'un territoire à l'autre. Elle se représente par une **intensité de couleur** classée : la choroplèthe.

S'y ajoutent le **qualitatif nominal (QL)** — catégories sans ordre, représentées par des couleurs ou des formes différenciées — et le **qualitatif ordonné (QLO)** — catégories hiérarchisées (faible/moyen/élevé, rangs, années), représentées par un gradient ordonné.

Enfin, trois types « de service » ne déclenchent pas de visualisation mais structurent le reste : **geoid** (codes de jointure), **geolat/geolon** (coordonnées), **label** (libellés : noms de lieux, adresses).

---

## Vue d'ensemble

L'algorithme opère en deux étages :

```
Dataset importé (stats DuckDB par colonne)
        │
        ▼
  Étage 1 — typage sémiologique
  chaque colonne → { semioType, semioScore ∈ [0,1], runnerUp? }
        │
        ▼
  Étage 2 — génération de suggestions
  colonnes × géométrie × patterns → suggestions scorées
  garde-fous de lisibilité → tri → top 3
        │
        ▼
  Application (au clic) : preset + overrides + défauts adaptés
```

| Étage           | Fichier                                                             |
| --------------- | ------------------------------------------------------------------- |
| Statistiques    | `src/lib/features/duckdb/macros/analyse.ts` (macros SQL)            |
| Typage sémio    | `src/lib/features/commons/utils/semio-detector.utils.ts`            |
| Suggestions     | `src/lib/features/commons/services/viz-suggester.service.ts`        |
| Application     | `src/lib/features/visualization-tab/services/suggestion.service.ts` |
| Défauts adaptés | `src/lib/features/commons/services/classification.service.ts`       |

---

## Étage 1 — Typage sémiologique des colonnes

### Les indicateurs

Toutes les statistiques sont calculées par **DuckDB** à l'import (macro `summary_numeric` / `summary_general`, échantillonnées à 50 000 lignes au-delà) ; le typage lui-même est une fonction pure JavaScript qui ne voit que ces agrégats — jamais les données brutes.

| Indicateur                       | Ce qu'il capte                                           |
| -------------------------------- | -------------------------------------------------------- |
| `share_integers`, `share_floats` | Part de valeurs entières / décimales                     |
| `min`, `max`, `extent_magnitude` | Bornes et étendue en ordres de grandeur                  |
| `skewness`                       | Asymétrie de la distribution                             |
| `share_rank_interval`            | Part de valeurs consécutives (suites 1, 2, 3…)           |
| `share_uniques`, `uniques`       | Cardinalité absolue et relative                          |
| `categories`                     | Valeurs distinctes des colonnes texte (≤ 24)             |
| Lexiques sur le **nom**          | ratio, stock, identifiant, libellé, rang, année, lat/lon |

Les lexiques (fr/en, accents normalisés) sont volontairement des **indices**, pas des verdicts : un mot-clé pèse dans le score mais les signaux de distribution peuvent le contredire. Deux interactions notables : un mot-clé _ratio_ supprime le mot-clé _stock_ (« proportion of **total** GDP » — le mot stock décrit le dénominateur), et une preuve d'ordre dans les valeurs affaiblit la lecture nominale.

### Le scoring

Chaque type reçoit un score additif à partir de ses signaux, puis les scores sont **normalisés par le maximum atteignable du type** — c'est ce qui rend les confiances comparables entre types dont les signaux n'ont pas la même richesse. Le type élu est celui du meilleur score normalisé ; le résultat expose aussi le **second meilleur** (`runnerUp`), un diagnostic interne exploité par les tests du corpus (aucune UI ne le consomme aujourd'hui).

Signaux principaux par type :

| Type              | Signaux positifs (poids)                                                                                                                                                                              |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **QTA**           | entiers (2), valeurs non consécutives (1), étendue ≥ 2 ordres de grandeur (1), lexique stock (2.5), skewness ≥ 2 (1)                                                                                  |
| **QTR**           | décimales (2), lexique ratio ou `%`/`‰`/`/` (3), étendue faible (0.5), traverse zéro (0.5), borné [0,100] (0.5), distribution symétrique (0.5)                                                        |
| **QL**            | faible part d'uniques (2), ≤ 10 catégories (1) — bonus réduits de moitié pour les colonnes numériques ; malus si les valeurs matchent une séquence ordinale                                           |
| **QLO**           | lexique rang (4), valeurs consécutives (2), **année** — mot-clé + entiers dans [1200, 2100] (5), **séquence ordinale textuelle** — faible/moyen/élevé, préfixes « 1 - … » (4), Likert numérique (1.5) |
| **geoid**         | unicité (0.5–1), peu de nulls (0.5–1.5), lexique identifiant (3.5–4), suites consécutives (2)                                                                                                         |
| **geolat/geolon** | lexique lat/lon (4) ou colonne `x`/`y` (2), plage valide (2) ; **veto** si les valeurs sortent de ±90/±180                                                                                            |
| **label**         | lexique nom/libellé/ville/pays… (3.5), forte unicité (1), ≥ 20 valeurs distinctes (1) ; veto si lexique identifiant                                                                                   |

Pourquoi des heuristiques et pas un modèle appris ? Parce que la transparence est ici une exigence : chaque décision doit pouvoir être expliquée (« classée QTR car décimales, bornée 0-100 et nommée _taux_ »), corrigée par l'utilisateur, et ajustée par un contributeur qui lit ce tableau.

### Cas particuliers

- **Années** : une colonne d'années est une dimension ordonnée, pas une quantité — sans ce cas, l'algorithme proposait « des symboles proportionnels à l'année ». La détection exige le mot-clé _et_ la plage plausible : la détection par valeurs seules confondrait années et petites populations.
- **Coordonnées projetées** : une colonne `x` en Lambert 93 (centaines de milliers) échoue au test de plage et reste hors géo. La détection fine de paires GPS (corrélation x/y, validation) appartient à la feature _geolocation_, pas au détecteur sémio.
- **Dates** : traitement forfaitaire (QL si ≤ 10 valeurs, sinon QTR, confiance 0.5) — piste d'amélioration connue.
- **BigInt** : DuckDB WASM renvoie des `BigInt` JS pour les colonnes entières (Flechette est configurée avec `useBigInt: true`) ; le détecteur les coerce systématiquement (`toStatNumber`).

---

## Étage 2 — Du typage aux suggestions

### Les patterns

Une visualisation Khartis est toujours `primitive × traitement × variable(s)` (voir `.claude/rules/cartography-invariants.md`). Le catalogue `VIZ_CRITERIA` décrit ~25 patterns déclaratifs :

| Type de colonne    | Point                                             | Polygone                     | Ligne                       |
| ------------------ | ------------------------------------------------- | ---------------------------- | --------------------------- |
| — (aucune)         | symboles unis                                     | aplat uni                    | lignes unies                |
| **QTA**            | symboles proportionnels                           | symboles proportionnels      | épaisseur proportionnelle   |
| **QTR**            | symboles colorés par classes                      | **choroplèthe**              | lignes colorées par classes |
| **QL**             | couleurs ou formes par catégorie                  | aplat catégoriel             | lignes par catégorie        |
| **QLO**            | gradient ordonné (couleurs ou formes)             | aplat ordonné                | gradient ordonné            |
| **QTA + QL/QTR**   | taille + couleur (bivarié)                        | —                            | épaisseur + couleur         |
| **QTA + QTA**      | double symbole proportionnel                      | double symbole proportionnel | —                           |
| **QTA + label**    | **symboles proportionnels + étiquettes (top 10)** | idem                         | —                           |
| **label + QL/QTR** | étiquettes colorées                               | étiquettes colorées          | —                           |

Deux règles ne se négocient pas : la **choroplèthe est réservée aux ratios** (jamais de valeurs absolues en aplat), et les symboles proportionnels sont la réponse aux stocks.

### Le texte est un habillage, pas une carte

Les libellés sont une primitive à part entière, mais une carte d'étiquettes seule est rarement la bonne première réponse. Deux mécanismes l'encodent :

- les suggestions de texte pur (`texts_*`) sont **scorées sur leur colonne thématique uniquement**, multipliée par une pénalité de rôle complémentaire (×0.7) — elles ne passent jamais devant une choroplèthe ou des symboles proportionnels de même confiance ;
- quand une variable thématique et un libellé coexistent, la suggestion mise en avant est la **combinaison** : symboles proportionnels + étiquettes (stock) ou choroplèthe + étiquettes (ratio, sur polygones), limitées aux 10 plus fortes valeurs — un filtre de données `top_desc` restreint à la primitive texte. Le texte sert la hiérarchie visuelle au lieu de la concurrencer ;
- une colonne trop faible pour porter une visualisation thématique (confiance < 0.3) ne peut pas non plus alimenter une suggestion de texte : jamais de « Textes en classes » sans la choroplèthe correspondante.

### Garde-fous de lisibilité

Une suggestion valide sémiologiquement peut rester illisible. Bornes appliquées, héritées des ordres de grandeur de Bertin :

| Garde-fou                                | Seuil                    | Effet                                                            |
| ---------------------------------------- | ------------------------ | ---------------------------------------------------------------- |
| Catégories par couleur                   | ≤ 8, et ≤ 50 % d'uniques | exclusion → repli aplat                                          |
| Catégories par forme                     | ≤ 5                      | exclusion                                                        |
| Confiance sémio minimale d'une colonne   | ≥ 0.3                    | la colonne devient inerte                                        |
| Étiquettes sur points (texte pur)        | ≤ 150 entités            | pas de suggestion texte (la variante top 10 n'est pas concernée) |
| Colonnes geoid / geolat / geolon / label | —                        | jamais thématiques                                               |

C'est la réponse au cas classique « autant de catégories que d'entités » : plutôt qu'une carte arc-en-ciel illisible, l'algorithme se replie sur l'aplat uni.

### Score, tri, présélection

```
score = round( moyenne(semioScores des colonnes) × facteur de lisibilité × 100 )
```

Le **facteur de lisibilité** pénalise ce qui reste légal mais inconfortable : 7-8 catégories en couleur (×0.85), 5 formes (×0.85), symboles proportionnels sur des valeurs quasi constantes — max/min < 2, des tailles indiscernables ne portent aucune information (×0.6). S'y ajoutent les facteurs de rôle : ×0.9 pour la variante étiquetée des symboles proportionnels, ×0.7 pour les suggestions de texte pur.

Les suggestions sont triées par score, départagées par une préférence de forme (à données égales sur polygones : aplat > symboles colorés > formes), dédupliquées quand deux patterns produiraient le même rendu GPU, et les **3 meilleures** sont présentées, la première appliquée automatiquement.

### Défauts appliqués — la suggestion ne s'arrête pas au choix de la forme

À l'application d'une suggestion classée :

- **Méthode de discrétisation adaptée à la distribution** : skewness ≥ 3 → head/tail (distributions à queue lourde), |skewness| ≥ 1.5 → quantiles, sinon k-means. Jamais retouché si l'utilisateur passe en manuel.
- **Nombre de classes plafonné** à N entités / 3 (minimum 2) : pas de choroplèthe à 4 classes pour 10 communes.
- **Rampe divergente automatique** : si la variable traverse zéro (solde, évolution), le pivot 0 est détecté et la palette devient divergente (`use-classification-breaks`, `detectDivergingBreakpoint`) — et redevient séquentielle si l'utilisateur change pour une colonne toute positive.
- Palettes : séquentielle bleue par défaut (mono-teinte, sûre pour le daltonisme), qualitative « Vif » pour le catégoriel, générées en espace perceptuel OKLab (voir `.claude/rules/colors-classification.md`).

---

## Ce que l'algorithme ne fait pas (non-buts)

- **Il ne verrouille rien.** Toute suggestion est un point de départ ; chaque paramètre reste modifiable, y compris contre l'avis de l'algorithme.
- **Pas de choroplèthe de stocks**, même si l'utilisateur importe uniquement des valeurs absolues — la réponse est les symboles proportionnels.
- **Pas de variables dérivées automatiques.** Calculer un ratio entre deux stocks à la place de l'utilisateur a été envisagé puis retiré : les suggestions offrent un panorama de départ, elles ne transforment pas les données — deviner le bon dénominateur est trop incertain, surtout face à un utilisateur averti qui sait ce qu'il veut calculer.
- **Pas de combinaisons au-delà de deux variables** (pas de trivarié).
- **Pas d'inférence du sens métier** : une colonne `1960` contenant des pourcentages n'est identifiable comme ratio que par sa distribution ; si les signaux sont contradictoires, le `runnerUp` conserve le second type en lice à des fins de diagnostic (tests du corpus), sans signalement dans l'interface.
- **Pas de détection GPS complète** dans le typage sémio — c'est le rôle de la feature _geolocation_ (validation des plages, paires corrélées, inversions lat/lon).
- **Aucune donnée ne quitte le navigateur** : le typage ne lit que des agrégats calculés localement par DuckDB WASM.

---

## Mesurer et faire évoluer

Le réglage des seuils n'est pas laissé à l'intuition : un **corpus étiqueté** de colonnes réelles (`tests/pipeline/semio-corpus.test.ts`, 116 étiquettes issues de 23 jeux de `static/tests-datasets/`, dont les jeux historiques Khartis v1 : décimales européennes, valeurs manquantes `...`/`:`, colonnes %, per capita, rangs, années) vérifie chaque classification attendue et imprime, en cas d'échec, la précision globale et la **matrice de confusion** attendu × détecté. Toute modification des poids doit garder le corpus vert — et tout cas réel mal classé a vocation à y entrer comme étiquette avant d'être corrigé.

Pour étendre l'algorithme :

| Besoin                           | Où intervenir                                                     |
| -------------------------------- | ----------------------------------------------------------------- |
| Nouveau mot-clé fr/en            | lexiques de `semio-detector.utils.ts` (+ cas dans le corpus)      |
| Nouvelle séquence ordinale       | `ORDINAL_SEQUENCES` (idem)                                        |
| Nouveau signal statistique       | macro `summary_numeric` → `ColumnStats` → indicateur de score     |
| Nouveau pattern de visualisation | `VIZ_CRITERIA` + comportement dans `suggestion.service.ts` + i18n |
| Nouveau type sémiologique        | `SemioType`, `TYPE_MAX_SCORE`, un scoreur, et ses consommateurs   |

Tests : `pnpm exec vitest run --project server tests/pipeline/semio-detector.test.ts tests/pipeline/semio-corpus.test.ts tests/pipeline/viz-suggester.test.ts` ; l'audit de bout en bout (vraies macros DuckDB sur les fixtures) vit dans `tests/pipeline/visualization-suggestion-audit.test.ts`.
