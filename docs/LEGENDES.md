# Légendes — Guide développeur

> Système de légendes cartographiques de Khartis v3. Lire VISUALISATIONS.md et CARTOGRAPHIE.md d'abord pour le contexte produit et cartographique.

**Voir aussi** : [VISUALISATIONS](./VISUALISATIONS.md) — [CARTOGRAPHIE](./CARTOGRAPHIE.md) — [MAP](./MAP.md) — [GUIDE_DEVELOPPEUR](./GUIDE_DEVELOPPEUR.md)

---

## Principe

Khartis embarque sa propre implémentation de `khartis-legends` dans `src/lib/features/commons/components/legend/`.

Objectif :

- garder la logique cartographique de la lib d’origine
- centraliser le rendu SVG dans un composant commun
- couvrir les cas Khartis non présents dans la lib standalone
- sécuriser tout le flux `{@html}` par échappement SVG systématique

La frontière reste stricte :

- `commons/components/legend/` = génération SVG générique
- `map/components/legend-overlay.svelte` = adaptation aux `VisualizationConfig`
- `step-toolbar/tools/legend/` = contenu éditable et style commun

---

## Familles gérées

**Base `khartis-legends`**

| Famille            | Générateur                   | Usage                   |
| ------------------ | ---------------------------- | ----------------------- |
| Symboles emboîtés  | `draw_symbols_legend()`      | Proportionnels simples  |
| Rampe quantitative | `draw_quanti_color_legend()` | Choroplèthes en classes |
| Catégoriel         | `draw_categorical_legend()`  | Catégories qualitatives |

**Extensions Khartis**

| Famille            | Générateur                             | Usage                               |
| ------------------ | -------------------------------------- | ----------------------------------- |
| Swatches compacts  | `draw_khartis_swatch_legend()`         | Lignes, motifs, classes discrètes   |
| Épaisseur de ligne | `draw_khartis_line_width_legend()`     | Lignes proportionnelles ou classées |
| Densité            | `draw_khartis_density_legend()`        | Remplissage par points              |
| Doubles symboles   | `draw_khartis_double_symbols_legend()` | Double proportionnel                |

**Cas couverts dans l’overlay**

| Cas Khartis                        | Rendu                                        |
| ---------------------------------- | -------------------------------------------- |
| Polygones en classes               | Rampe quantitative                           |
| Catégories surface / ligne / point | Swatches cohérents avec la primitive         |
| Symboles proportionnels            | Symboles emboîtés                            |
| Symboles proportionnels doubles    | Paires compactes dans un seul SVG            |
| Lignes en épaisseur                | Lignes SVG compactes                         |
| Densité                            | Ligne dédiée avec ratio                      |
| Motifs                             | Swatches SVG avec pattern                    |
| Textes en couleur qualitative      | Légende catégorielle à symbole texte         |
| Textes en couleur quantitative     | Swatches texte par classes                   |
| Textes proportionnels              | Symboles emboîtés `type: 'text'`             |
| Textes bivariés couleur + taille   | Deux blocs SVG compacts dans la même légende |
| Données manquantes                 | Footer intégré au SVG quand possible         |

---

## Règles UX

- Une visualisation doit produire une légende compacte, jamais un empilement HTML hétérogène.
- Les segments d’une même légende partagent `title`, `subtitle` et `note` via le premier et le dernier bloc seulement.
- `Absence de données` doit rester au plus près du corps de légende.
- Les légendes doivent rester lisibles en petit format : pas de hauteur artificielle, pas de marges internes surdimensionnées.
- Les tailles, paddings et largeurs maximales suivent `layout-sizing.utils.ts`.

---

## Texte et bivarié

Les primitives de texte sont traitées comme de vraies primitives cartographiques, pas comme une annotation.

Conséquences :

- `colorMode = CATEGORIES` ou `CLASSES` produit une légende dédiée
- `sizeMode = PROPORTIONAL` produit une légende de tailles dédiée
- si couleur et taille sont pilotées par les données, les deux segments coexistent dans la même entrée de légende

Khartis ne force pas une matrice bivariée unique pour tous les cas. Pour les textes et les lignes, deux segments compacts restent plus lisibles qu’un pseudo-tableau surchargé.

---

## Sécurité

Le composant `LegendSvg.svelte` est l’unique point de rendu `{@html}`.

Garanties :

- labels, titres et notes passent par `escapeSvgText()`
- couleurs, paths et attributs SVG passent par `escapeSvgAttribute()`
- les `data:` images de pattern sont filtrées avant injection

Le but n’est pas de copier `khartis-legends` byte-for-byte, mais de conserver son algorithme tout en supprimant les voies d’injection non acceptables dans Khartis.

---

## Fichiers clés

| Zone                          | Fichier                                                 |
| ----------------------------- | ------------------------------------------------------- |
| Générateurs communs           | `src/lib/features/commons/components/legend/`           |
| Adaptation aux visualisations | `src/lib/features/map/components/legend-overlay.svelte` |
| Helpers de scale              | `src/lib/features/map/utils/legend.utils.ts`            |
| Outil Habillage               | `src/lib/features/step-toolbar/tools/legend/`           |

---

## Validation

Minimum à exécuter après modification :

- `pnpm vitest run --project client src/lib/features/commons/components/legend/legend.svelte.test.ts src/lib/features/map/components/legend-overlay.svelte.test.ts --reporter=agent`
- `pnpm check`
- `pnpm lint`
- smoke browser sur `/cartographie/khartisnewpprd/`

Jeux de données utiles :

- `static/tests-datasets/geojson/nuts2_data.geojson`
- `static/tests-datasets/geojson/tiny-geo-3features.geojson`
- `static/tests-datasets/geojson/visualization-toolbox-cases.geojson`
