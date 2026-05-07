# Architecture des features

> Pourquoi chaque feature est organisée comme elle l'est, et comment décider de la structure d'une nouvelle feature.

**Voir aussi** : [ARCHITECTURE.md](ARCHITECTURE.md) · [GUIDE_DEVELOPPEUR.md](GUIDE_DEVELOPPEUR.md)

---

## Principes directeurs

Khartis v3 est organisé en _features_ autonomes sous `src/lib/features/`. Trois principes guident l'organisation interne de chaque feature :

1. **L'organisation suit la responsabilité, pas le type de fichier.** Une feature qui ne fait que de l'UI utilise un découpage UI standard. Une feature moteur découpe par couche technique (lecture, transformation, façade). On ne force jamais un pattern qui ne sert pas la feature.
2. **L'index.ts est l'unique surface publique.** Les autres features ne peuvent importer que depuis `index.ts`. Tout le reste est interne. Cette contrainte est vérifiée par `architecture-boundaries.test.ts`.
3. **Le minimum suffisant.** Une feature ne crée un sous-dossier que lorsqu'il y a au moins deux fichiers à y mettre. On préfère un fichier à la racine de la feature plutôt qu'un dossier à un seul élément.

---

## Trois familles de features

Khartis v3 contient 12 features qui se répartissent en trois grandes familles, chacune avec son propre pattern d'organisation.

| Famille             | Pattern interne                                    | Exemples                                                        |
| ------------------- | -------------------------------------------------- | --------------------------------------------------------------- |
| **UI**              | `components/` + `stores/` + `hooks/` + `services/` | `data-tab/`, `visualization-tab/`, `create-project/`, `header/` |
| **Moteur**          | `core/` + `io/` + `operations/` + `services/`      | `data-pipeline/`, `duckdb/`, `project-management/`              |
| **Hybride / shell** | Mélange selon les besoins                          | `map/`, `step-toolbar/`, `main-toolbar/`, `side-nav/`           |

`commons/` n'est pas une feature au sens strict : c'est le code partagé que toutes les features peuvent importer. Il suit lui-même un découpage UI standard étendu (cf. plus bas).

---

## Famille UI : panneaux, onglets, modales

Les features UI exposent un composant racine et coordonnent un panneau utilisateur. Leur découpage interne suit la même grammaire pour rester prévisible :

```
features/<feature-ui>/
├── index.ts                     # exports publics (composant racine + API minimale)
├── <feature>.svelte             # composant racine (point d'entrée Svelte)
├── components/                  # sous-composants internes
├── stores/                      # état réactif persistant (.store.svelte.ts)
├── hooks/                       # logique réactive partagée (use-*.svelte.ts)
├── services/                    # logique métier réutilisable, sans dépendance UI
├── types/                       # types publics et internes
├── utils/                       # helpers purs (pas d'état, pas d'effets)
└── constants/                   # constantes et configurations (optionnel)
```

### Pourquoi ce découpage ?

- **`components/`** : un composant Svelte ne doit jamais contenir de logique métier complexe. Quand un panneau dépasse ~250 lignes, on en extrait des sous-composants ici.
- **`stores/`** vs **`hooks/`** : un store est durable (survit au démontage du composant, persiste éventuellement dans le projet). Un hook est attaché au cycle de vie d'un composant et expose des dérivations réactives.
- **`services/`** isolent le métier des composants. Cela rend le code testable sans jsdom et permet de réutiliser la logique entre plusieurs panneaux.
- **`utils/`** vs **`services/`** : un util est pur (input → output, pas d'état caché). Un service peut tenir un cache, un singleton DuckDB, un registre. La règle simple : si on peut le tester avec `it.each([...])`, c'est un util ; sinon c'est un service.

### Variantes acceptées

- **`create-project/`** n'a pas de `stores/` car son état (formulaire d'import) est géré par un store global de `commons/`. Pas de duplication artificielle.
- **`header/`** ne contient pas de `stores/` ni de `utils/` car c'est un composant essentiellement présentationnel. Un `hooks/` suffit pour la modale d'export.
- **`visualization-tab/`** ajoute un dossier **`adapters/`** pour les adapters qui font le pont avec `step-toolbar/tools/facets/`. C'est une exception documentée : un adapter est un module de traduction entre deux features qui ne peuvent pas se connaître directement.

### Quand créer un sous-dossier ?

| Si tu as…                               | Crée                                                                    |
| --------------------------------------- | ----------------------------------------------------------------------- |
| 1 store réactif                         | `stores/` (oui, dès le 1er)                                             |
| 1 ou 2 helpers purs                     | un seul `<feature>.utils.ts` racine                                     |
| 3+ helpers purs                         | `utils/`                                                                |
| 1 hook                                  | `<feature>.hook.svelte.ts` racine ou `hooks/` si tu en prévois d'autres |
| 1 composant + sous-composants           | `components/`                                                           |
| Logique métier réutilisable hors Svelte | `services/`                                                             |

---

## Famille Moteur : pipelines, moteurs, persistance

Les features moteur n'ont pas d'UI propre. Elles exposent des façades, traitent des données, et sont consommées par les features UI. Leur découpage suit des **couches techniques** plutôt qu'une séparation MVC.

```
features/<feature-moteur>/
├── index.ts                     # façade publique (un ou deux symboles principaux)
├── <feature>.ts                 # entrée principale ou définitions partagées
├── core/                        # briques fondamentales, abstractions de bas niveau
├── io/                          # entrée/sortie (lecture, écriture, conversion de format)
├── operations/                  # opérations métier composables
├── services/                    # façades de haut niveau qui orchestrent core + io + operations
├── orchestrator/                # (duckdb seul) coordination multi-services avec état partagé
├── macros/                      # (duckdb seul) macros SQL DuckDB
├── cache/                       # (duckdb seul) gestion du cache moteur
├── processors/                  # (data-pipeline seul) stratégies de traitement (pattern Strategy)
├── types/                       # types publics et internes
└── utils/                       # helpers techniques purs
```

### Pourquoi ce découpage par couche ?

Quand une feature manipule des fichiers, des bases de données, des pipelines, le découpage UI ne marche plus. On a besoin de séparer :

- **`core/`** : ce qui ne dépend de rien. Exemple : `validators.ts` valide une chaîne, `format-detector.ts` regarde une extension. Aucun appel à DuckDB, aucun effet.
- **`io/`** : tout ce qui touche au monde extérieur ou à un format binaire. Exemple : `tabular-reader.ts`, `geofile-reader.ts`, `arrow-converter.ts`, `exporter.ts`, `importer.ts`. Ces fichiers parlent à DuckDB, à IndexedDB, ou décodent des bytes.
- **`operations/`** : transformations métier composables. Exemple : `analysis.ts`, `breaks.ts`, `density.ts`, `join.ts`. Une opération prend une table, en produit une autre. Elle ne sait pas comment a été lue la donnée ni où elle ira.
- **`services/`** : façades de haut niveau. Elles orchestrent `core/` + `io/` + `operations/` pour répondre à un cas d'usage du produit. C'est ce que les features UI consomment.
- **`processors/`** (data-pipeline) : implémentation du **pattern Strategy** pour traiter chaque format de fichier (CSV, GeoJSON, Shapefile…). Chaque processeur est interchangeable et enregistré dans un registry. Cette structure existe parce qu'on ajoute régulièrement de nouveaux formats — le découpage doit faciliter l'ajout, pas le freiner.
- **`orchestrator/`** (duckdb) : DuckDB doit gérer un état partagé (singleton, cache de tables, mutations à invalider). L'orchestrator est une couche au-dessus des `services/` qui maintient cet état et synchronise les invalidations. C'est volontairement un dossier dédié, pas un service parmi d'autres.
- **`macros/`** (duckdb) : SQL pur DuckDB chargé une fois à l'init. Isoler ici permet de versionner les macros et de les charger en lot.

### Variantes acceptées

- **`project-management/`** n'a pas d'`operations/` au sens strict, mais a un dossier `operations/` avec une seule action (`duplicate.ts`). C'est acceptable car on prévoit d'autres opérations (rename, archive, restore) qui suivront le même pattern.
- **`data-pipeline/`** garde `pipeline.ts` à la racine (le `dataPipeline` exporté) car c'est le point d'entrée principal. Mettre un fichier-clé à la racine de la feature est encouragé quand cela évite un import à rallonge.

### Comment décider qu'un fichier va dans `core/` ou `io/` ?

Question simple : **« Est-ce que ce fichier dépend de DuckDB, du système de fichiers, du DOM, ou d'un format binaire ? »**

- Oui → `io/`
- Non → `core/`

Si le fichier compose plusieurs `io/` et `operations/` pour répondre à un besoin produit, il va dans `services/`. Si un même `service/` est trop gros (>500 lignes), c'est un signe qu'il faut extraire des opérations dans `operations/`.

---

## Famille hybride : map, step-toolbar, main-toolbar, side-nav

Certaines features ne rentrent pas dans les deux moules précédents. Le tableau ci-dessous justifie chaque cas particulier.

### `map/` — la plus riche

```
map/
├── components/                  # MainMap.svelte, MapTooltip.svelte
├── core/                        # bounds, projscreen — calculs purs partagés
├── io/                          # tooltip.service — pas un vrai io, mais un dossier d'integration externe
├── layers/                      # factories Deck.gl (le plus gros : layer-factory.ts ~190 KB)
├── styling/                     # parsers/extensions de style (geometry-parser, pattern-texture, rotatable-fill)
├── interactions/                # handlers d'événements (line-handlers, polygon-handlers, symbol-handlers, text-handlers, pick-owned)
├── hooks/                       # use-map-init, use-map-layers, use-map-basemap…
├── services/                    # basemap.service, basemap-catalog.service
├── stores/                      # projection.store, basemap-layers.store, map-highlight.store…
├── constants/                   # basemap-styles, layer-ids
├── types/
└── utils/
```

`map/` mélange UI (le composant racine + ses panneaux) **et** moteur (la couche layer factory + styling + interactions). Le découpage par sous-domaines (`layers/`, `styling/`, `interactions/`) reflète une cartographie de Deck.gl interne :

- **`layers/`** : production des `Layer` Deck.gl à partir des données. Le cœur de la feature, énorme par nature (chaque type de couche a sa propre logique).
- **`styling/`** : extensions GLSL et parsers qui modifient le rendu sans changer la structure des couches. À part car réutilisable indépendamment des layers.
- **`interactions/`** : tout ce qui réagit aux événements de la souris (handlers de pick par primitive). À part car suit un cycle de vie différent des layers.

**Règle qui en découle** : si une feature dépasse ~30 fichiers dans `services/`, c'est probablement le signe qu'il faut introduire des sous-domaines comme dans `map/`.

### `step-toolbar/` — méta-feature de mini-features

```
step-toolbar/
├── step-toolbar.svelte              # shell racine
├── tool-container.svelte            # conteneur générique d'outil
├── fonts.constants.ts
├── tools/
│   ├── annotations/                 # mini-feature complète (composants, store, types)
│   ├── color-blindness/
│   ├── facets/
│   ├── format/
│   ├── geo-indications/
│   ├── layers/
│   ├── legend/
│   ├── projections/
│   ├── search/
│   └── simplification/
├── tools-list/                      # liste des outils visibles selon l'étape
└── types/
```

Chaque outil de `tools/<nom>/` est lui-même une mini-feature avec son propre `index.ts`. Cela permet :

- d'ajouter un outil sans modifier les autres ;
- d'utiliser le pattern `createToolStore()` de `commons/` pour la persistance automatique ;
- d'enforcer une limite : aucun fichier en dehors de `step-toolbar/tools/<X>/` ne peut importer profondément un détail de l'outil — passage obligé par `tools/<X>/index.ts`. C'est testé par `architecture-boundaries.test.ts`.

**Règle qui en découle** : si une feature contient un ensemble homogène de N choses (outils, formats, processeurs…), un dossier `<choses>/<nom>/` avec mini-feature interne est un pattern valide. Le pluriel dans le nom du dossier est intentionnel.

### `main-toolbar/` — coquille minimale

```
main-toolbar/
├── main-toolbar.svelte              # shell qui orchestre data-tab et visualization-tab
├── mobile-toolbar.svelte            # variante mobile
├── main-toolbar.constants.ts
├── types.ts
├── components/                      # add-data-modal, header, tabs (peu de composants)
└── stores/                          # juste main-toolbar.store
```

Pas de `services/`, pas de `hooks/`, pas de `utils/`. Pourquoi ? Parce que `main-toolbar/` ne fait qu'**orchestrer** : il décide quel onglet afficher (`data-tab` ou `visualization-tab`) et expose un état d'ouverture/fermeture. Toute la logique métier vit dans les onglets eux-mêmes.

**Règle qui en découle** : une feature qui se contente d'orchestrer ne crée que les sous-dossiers strictement nécessaires. Ne pas inventer un `services/` vide juste pour respecter un pattern.

### `side-nav/` — feature ultra-simple

```
side-nav/
├── side-nav.svelte                  # composant unique
├── side-nav.test.ts
├── types.ts
└── hooks/                           # 2 hooks utilisés en interne
```

Une feature peut tenir dans un seul composant + ses types. C'est le cas quand :

- l'UI est purement présentationnelle (pas d'état métier propre) ;
- l'état affiché vient d'autres stores (`projectsStore`, `localeStore`).

**Règle qui en découle** : on ne crée pas un `stores/` si la feature ne possède pas d'état propre. Lire un store de `commons/` n'est pas une raison suffisante pour créer un store local.

---

## `commons/` — le code partagé

`commons/` n'est pas une feature, c'est le dossier où vivent les ressources partagées par plusieurs features. Sa structure étend le pattern UI :

```
commons/
├── pipeline.errors.ts               # hiérarchie d'erreurs (à la racine, pas dans services/)
├── assets/                          # images, icônes, polices
├── components/                      # composants UI réutilisables (Carbon wrappers, color-picker…)
│   ├── advanced-data-table/         # sous-composants groupés
│   ├── carbon/                      # wrappers Carbon
│   ├── legend/
│   ├── palette-popover/
│   └── viz-controls/
├── constants/                       # constantes globales (palettes, file-types, ui)
├── services/                        # services métier transverses (classification, viz-suggester, facet-generator, data-orchestrator)
├── stores/                          # stores globaux (project, datasets, visualization, global, locale…)
├── types/                           # types partagés (create-project.types, data-tab.types, geoarrow…)
└── utils/                           # utilitaires généraux (logger, file-export, validation, projection.utils…)
```

Ce qui est dans `commons/` doit être **réellement partagé**. Une règle simple : un module entre dans `commons/` quand au moins deux features l'utilisent. Tant qu'une seule feature en a besoin, on le garde chez elle.

`pipeline.errors.ts` est volontairement à la racine (et non dans un dossier `errors/`) parce que c'est un fichier unique exporté tel quel. Créer un dossier `errors/` n'apporterait rien.

---

## Guidelines pour une nouvelle feature

### Étape 1 : choisir la famille

Pose-toi cette question : **« Cette feature a-t-elle une UI propre ? »**

- Oui → famille **UI**.
- Non, c'est un moteur consommé par d'autres features → famille **Moteur**.
- Les deux à la fois, ou une coquille très simple → famille **hybride**, mais documente le choix.

### Étape 2 : commencer minimal

Crée juste :

```
features/ma-feature/
├── index.ts
└── ma-feature.svelte (ou ma-feature.ts)
```

N'ajoute un sous-dossier que **lorsqu'il y a au moins deux fichiers à y mettre**. Un dossier à un seul fichier est un coût (un import de plus) sans bénéfice (lisibilité).

### Étape 3 : suivre le pattern de la famille

- UI → `components/`, `stores/`, `hooks/`, `services/`, `types/`, `utils/`.
- Moteur → `core/`, `io/`, `operations/`, `services/`, `types/`, `utils/`.
- Hybride → mélange documenté.

### Étape 4 : exposer une API publique stricte

`index.ts` ne doit pas tout ré-exporter. Pour chaque export, demande-toi : « est-ce que je veux qu'une autre feature s'appuie sur ça ? ». Si non, garde-le interne.

Surface publique typique :

- 1 à 3 composants racine ;
- les stores singletons réellement consommés ailleurs ;
- les types nécessaires aux consommateurs ;
- les services-façades, jamais leurs internes.

### Étape 5 : nommer avec discipline

Conventions appliquées dans tout le repo :

| Élément          | Forme                                               |
| ---------------- | --------------------------------------------------- |
| Composant Svelte | `kebab-case.svelte`                                 |
| Store            | `<sujet>.store.svelte.ts`                           |
| Hook             | `use-<sujet>.svelte.ts`                             |
| Service          | `<sujet>.service.ts` ou `<sujet>.service.svelte.ts` |
| Types            | `<sujet>.types.ts`                                  |
| Constantes       | `<sujet>.constants.ts`                              |
| Test co-localisé | `<fichier>.svelte.test.ts` (côté client)            |

### Étape 6 : valider avec un test d'architecture

Si la feature introduit un nouveau type de frontière (par ex. un dossier `tools/<X>/`), ajoute un test à `architecture-boundaries.test.ts` pour interdire les imports profonds. Ces tests sont la seule garantie réelle contre la dérive du couplage.

---

## Anti-patterns à éviter

- **Créer un dossier vide ou à un seul fichier** « par cohérence avec les autres features ». Le minimum suffisant prime.
- **Re-exporter tout l'index** depuis `index.ts` (`export * from './internal/foo'`). On documente intentionnellement la surface publique.
- **Mettre un `console.log` ou un singleton mutable dans `utils/`**. Un util doit être pur. Si ce n'est pas pur, c'est un service.
- **Importer un détail interne d'une autre feature** (`$lib/features/X/components/Y.svelte` quand `Y` n'est pas exporté par `X/index.ts`). Si tu as besoin de `Y` ailleurs, c'est un signal pour le déplacer dans `commons/` ou pour exposer `Y` officiellement dans `X/index.ts`.
- **Mélanger Strategy et héritage** dans `processors/`. Le registry attend des stratégies plates, pas une hiérarchie.
- **Créer une feature « shared-X »** quand elle ne sert qu'à éviter une dépendance circulaire. Refactorer la circularité, pas l'enterrer dans une feature de plus.

---

## Récapitulatif visuel

```
src/lib/features/
├── commons/                ⟵ partagé (pas une feature)
│
├── data-pipeline/          ⟵ MOTEUR (core, io, operations, processors, types, utils)
├── duckdb/                 ⟵ MOTEUR (core, io, operations, services, orchestrator, macros, cache, types, utils)
├── project-management/     ⟵ MOTEUR (core, io, operations, services)
│
├── create-project/         ⟵ UI (components, hooks, services, types, utils)
├── data-tab/               ⟵ UI (components, hooks, services, stores, utils)
├── header/                 ⟵ UI minimaliste (components, hooks, services)
├── visualization-tab/      ⟵ UI + adapters (components, hooks, services, types, utils, adapters)
│
├── map/                    ⟵ HYBRIDE riche (components, core, io, layers, styling, interactions, hooks, services, stores, types, utils, constants)
├── step-toolbar/           ⟵ HYBRIDE méta (tools/<X>/, tools-list/, types/)
├── main-toolbar/           ⟵ HYBRIDE coquille (components, stores)
└── side-nav/               ⟵ HYBRIDE simple (hooks)
```

Cette diversité est intentionnelle. La structure de chaque feature reflète sa nature et son volume. Quand on hésite, on choisit la solution la plus simple qui rend la feature lisible aujourd'hui — pas celle qui anticipe une croissance hypothétique.
