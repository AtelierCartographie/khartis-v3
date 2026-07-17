# Légendes

> Architecture du système de légendes SVG : générateurs, familles, sécurité, intégration dans l'overlay carte.

**Voir aussi** : [ARCHITECTURE.md](ARCHITECTURE.md) · [VISUALISATIONS.md](VISUALISATIONS.md) · [CARTOGRAPHIE.md](CARTOGRAPHIE.md) · [MAP.md](MAP.md)

---

## Architecture en 3 zones

```
commons/components/legend/         ← générateurs SVG génériques (logique cartographique)
        ↓
map/components/legend-overlay.svelte  ← adaptation aux VisualizationConfig actives
        ↓
step-toolbar/tools/legend/         ← outil Habillage (édition titre/style, visibilité)
```

La frontière est stricte : les générateurs ne savent rien des stores Svelte ; l'overlay lit `visualizationStore` et `legendStore` et appelle les générateurs avec des données brutes. L'outil Habillage ne touche pas au SVG directement — il mutate `legendStore`.

`LegendSvg.svelte` est le **seul** composant qui fait `{@html}` dans tout le système de légendes.

---

## Familles de générateurs

### Base issue de `khartis-legends`

| Famille            | Fonction                     | Usage                                                |
| ------------------ | ---------------------------- | ---------------------------------------------------- |
| Symboles emboîtés  | `draw_symbols_legend()`      | Visualisation proportionnelle (cercles emboîtés)     |
| Rampe quantitative | `draw_quanti_color_legend()` | Choroplèthe en classes (rectangles colorés + seuils) |
| Catégoriel         | `draw_categorical_legend()`  | Catégories qualitatives (swatches + labels)          |

### Extensions spécifiques à Khartis

| Famille              | Fonction                               | Usage                                                 |
| -------------------- | -------------------------------------- | ----------------------------------------------------- |
| Swatches compacts    | `draw_khartis_swatch_legend()`         | Lignes, motifs hatch, classes discrètes               |
| Épaisseur de ligne   | `draw_khartis_line_width_legend()`     | Lignes proportionnelles ou classées                   |
| Densité              | `draw_khartis_density_legend()`        | Remplissage par points                                |
| Double proportionnel | `draw_khartis_double_symbols_legend()` | `proportionalType = DOUBLE` (deux séries superposées) |

---

## Mapping viz → générateur

L'overlay `legend-overlay.svelte` dispatche le bon générateur selon le type de visualisation et la primitive :

| Cas Khartis                        | Générateur appelé                                             |
| ---------------------------------- | ------------------------------------------------------------- |
| Polygones en classes               | `draw_quanti_color_legend()`                                  |
| Catégories surface / ligne / point | `draw_categorical_legend()` ou `draw_khartis_swatch_legend()` |
| Symboles proportionnels            | `draw_symbols_legend()`                                       |
| Double proportionnel               | `draw_khartis_double_symbols_legend()`                        |
| Lignes en épaisseur                | `draw_khartis_line_width_legend()`                            |
| Densité                            | `draw_khartis_density_legend()`                               |
| Motifs hatch                       | `draw_khartis_swatch_legend()` avec pattern SVG               |
| Textes en couleur qualitative      | `draw_categorical_legend()` avec `type: 'text'`               |
| Textes en taille proportionnelle   | `draw_symbols_legend()` avec `type: 'text'`                   |
| Données manquantes                 | Footer SVG intégré dans le même bloc                          |

Les primitives texte sont traitées comme de vraies primitives cartographiques : `colorMode = CATEGORIES` produit une légende de couleurs, `sizeMode = PROPORTIONAL` produit une légende de tailles. Si les deux sont actifs, deux segments coexistent dans la même entrée de légende.

---

## Règles UX

- Une visualisation produit une légende compacte — pas d'empilement HTML hétérogène.
- Les segments d'une même légende partagent `title` et `note` via le premier et dernier bloc seulement.
- L'entrée "Données manquantes" reste au plus près du corps de légende.
- Tailles, paddings et largeurs maximales suivent `layout-sizing.utils.ts` — ne pas les hardcoder.
- Khartis ne force pas une matrice bivariée unique : pour les textes et les lignes, deux segments compacts restent plus lisibles qu'un pseudo-tableau.

---

## Sécurité — échappement SVG

`LegendSvg.svelte` est le seul point `{@html}` du système. Toute donnée externe doit passer par :

| Fonction                  | Usage                                                    |
| ------------------------- | -------------------------------------------------------- |
| `escapeSvgText(str)`      | Labels, titres, notes, valeurs de classification         |
| `escapeSvgAttribute(str)` | Couleurs, chemins, attributs SVG (`fill`, `stroke`, `d`) |

Les images `data:` de pattern sont filtrées avant injection. Ne jamais bypasser ces fonctions pour "simplifier" le rendu — une cellule de données CSV peut contenir `</text><script>`.

---

## Intégration avec `legendStore`

`legendStore` maintient la liste des légendes visibles et leur style (police, couleur, arrière-plan). Il est synchronisé avec `visualizationStore` :

- Ajout d'une viz → entrée ajoutée dans `legendStore`.
- Suppression d'une viz → entrée retirée.
- Modification du style → `legendStore.updateLegendStyle(id, patch)`.

Les légendes sont persistées dans `layoutSettings` via `persistenceRegistry` et incluses dans l'export SVG.

---

## Helpers de calcul

`map/utils/legend.utils.ts` fournit les fonctions de calcul de l'échelle des symboles et des seuils lisibles :

- `computeSymbolLegendValues(minVal, maxVal, scale)` — valeurs représentatives pour les cercles emboîtés.
- `formatThreshold(value, precision)` — arrondi lisible pour les seuils de discrétisation.

Ces helpers sont indépendants des stores — ils prennent des scalaires et retournent des scalaires.

---

## Fichiers clés

| Rôle                       | Chemin                                                  |
| -------------------------- | ------------------------------------------------------- |
| Générateurs SVG génériques | `src/lib/features/commons/components/legend/`           |
| Overlay carte              | `src/lib/features/map/components/legend-overlay.svelte` |
| Helpers de scale           | `src/lib/features/map/utils/legend.utils.ts`            |
| Outil Habillage            | `src/lib/features/step-toolbar/tools/legend/`           |
| Sizing constants           | `src/lib/features/commons/utils/layout-sizing.utils.ts` |

---

## Validation

Après toute modification du système de légendes :

```bash
pnpm vitest run --project client \
  src/lib/features/commons/components/legend/legend.svelte.test.ts \
  src/lib/features/map/components/legend-overlay.svelte.test.ts \
  --reporter=agent
pnpm check
pnpm lint
```

Fixtures utiles pour le smoke test navigateur :

- `tests-datasets/geojson/nuts2_data.geojson` — choroplèthe avec 5 classes
- `tests-datasets/geojson/tiny-geo-3features.geojson` — 3 polygones, cas minimal
- `tests-datasets/geojson/visualization-toolbox-cases.geojson` — plusieurs types de viz
