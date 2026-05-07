# Guide développeur

> Onboarding, conventions, patterns et tâches courantes pour contribuer à Khartis v3.

**Voir aussi** : [ARCHITECTURE.md](ARCHITECTURE.md) · [ARCHITECTURE_FEATURES.md](ARCHITECTURE_FEATURES.md) · [PIPELINE_DONNEES.md](PIPELINE_DONNEES.md) · [DUCKDB.md](DUCKDB.md) · [MAP.md](MAP.md) · [GESTION_ETAT.md](GESTION_ETAT.md) · [REFERENCE.md](REFERENCE.md)

---

## Prérequis

- **Node.js ≥ 22** (< 25)
- **pnpm** via Corepack (jamais npm)
- Git + navigateur moderne (Chrome, Firefox, Safari, Edge)

```bash
corepack enable pnpm
git clone https://github.com/AtelierCartographie/khartis-v3.git
cd khartis-v3
cp .env.sample .env
pnpm install
pnpm dev
# → http://localhost:5176/cartographie/khartisnewpprd/
```

---

## Structure du projet

```
src/
├── routes/
│   ├── +layout.svelte       # Point d'entrée SvelteKit : init DuckDB, ARIA
│   └── +page.svelte         # Chargement lazy de la carte principale
└── lib/
    ├── features/            # 12 features autonomes
    │   ├── commons/             # Stores globaux, services, composants, erreurs
    │   ├── create-project/      # Modale d'entrée (import, exemples, ouverture)
    │   ├── data-pipeline/       # Import fichiers, détection format, validation
    │   ├── data-tab/            # Onglet « Données » (import, jointure, enrichissement)
    │   ├── duckdb/              # Moteur DuckDB WASM (Duck, orchestrateur, macros)
    │   ├── header/              # Barre de navigation (export, sauvegarde)
    │   ├── main-toolbar/        # Coquille panneau gauche (orchestre data-tab et visualization-tab)
    │   ├── map/                 # Carte Deck.gl + MapLibre
    │   ├── project-management/  # Persistance .kh, IndexedDB, migrations
    │   ├── side-nav/            # Menu latéral (langue, projets récents)
    │   ├── step-toolbar/        # Panneau droit (10 outils)
    │   └── visualization-tab/   # Onglet « Visualisations » (suggestions, primitives, fond)
    ├── paraglide/           # Généré automatiquement — ne pas éditer
    └── types/               # Types partagés cross-features

messages/
├── fr.json                  # Source des traductions (FR = locale de référence)
└── en.json                  # Traductions EN

tests/
├── pipeline/                # Tests Node.js — pipeline + DuckDB
└── duckdb/                  # Tests Node.js — macros DuckDB
```

### Structure type d'une feature

```
features/mon-outil/
├── index.ts                      # API publique de la feature (exports)
├── mon-outil.svelte              # Composant d'entrée (optionnel)
├── components/                   # Sous-composants internes
├── stores/                       # Stores réactifs (.store.svelte.ts)
├── hooks/                        # Hooks Svelte (use-xxx.svelte.ts)
├── services/                     # Logique métier (aucune dépendance UI)
├── types/                        # Types publics de la feature (.types.ts)
├── utils/                        # Utilitaires purs
└── constants/                    # Constantes et configurations
```

Chaque feature expose son API publique via `index.ts`. Les imports inter-features
doivent passer par ce barrel ; les imports profonds dans les internes d'une
autre feature sont interdits (vérifié par `architecture-boundaries.test.ts`).

> Pour le **rationale** derrière le découpage de chaque feature et les
> guidelines pour en créer une nouvelle, voir
> [ARCHITECTURE_FEATURES.md](ARCHITECTURE_FEATURES.md).

---

## Patterns Svelte 5

### Store feature (pattern factory)

Toute feature expose son état via une factory retournant des getters publics et des méthodes de mutation explicites. L'état interne (`$state`) n'est jamais exposé directement.

```typescript
// feature.store.svelte.ts
function createFeatureStore() {
  const state = $state({
    enabled: false,
    items: [] as string[]
  });

  return {
    get enabled() {
      return state.enabled;
    },
    get items() {
      return state.items;
    },

    enable() {
      state.enabled = true;
    },
    disable() {
      state.enabled = false;
    },
    addItem(item: string) {
      state.items.push(item);
    }
  };
}

export const featureStore = createFeatureStore();
```

**Règles** :

- `$derived` pour les valeurs dérivées coûteuses (filtres, mappings). Pour des calculs simples, un getter qui recalcule est acceptable.
- Pas d'affectation directe sur l'état de domaine depuis l'extérieur — toujours via méthode.
- L'état UI éphémère (toggle panneau, input en cours) reste local au composant.

### Hook Svelte (use-xxx.svelte.ts)

Les hooks encapsulent de la logique réactive multi-composants. Ils reçoivent une interface de props et retournent une interface de getters et méthodes.

```typescript
// use-my-hook.svelte.ts
export function useMyHook(props: MyHookProps): MyHookReturn {
  const computed = $derived.by(() => expensiveComputation(props.data));

  return {
    get computed() {
      return computed;
    },
    reset() {
      /* … */
    }
  };
}
```

### Composant Svelte 5

```svelte
<script lang="ts">
  interface Props {
    value: number;
    onchange?: (v: number) => void;
  }

  let { value, onchange }: Props = $props();
  let localState = $state(value);
</script>
```

- Toujours déclarer les props dans une interface `Props`.
- Utiliser `$bindable()` pour les bindings bidirectionnels.
- Utiliser `Snippet` (pas de `<slot>`).
- Jamais `$$props`, `$$restProps`, `export let`.

---

## Pattern de store d'outil (`createToolStore`)

La plupart des outils de la `step-toolbar` utilisent la factory `createToolStore` de `commons/utils/store.utils.svelte`. Elle gère l'état réactif, les actions et la sérialisation automatique.

```typescript
import { createToolStore } from '$lib/features/commons/utils/store.utils.svelte';

const DEFAULT_STATE: MyToolState = {
  visible: true,
  selectedId: null
};

const { state, actions } = createToolStore<MyToolState>(
  DEFAULT_STATE,
  (state) => ({
    select(id: string) {
      state.selectedId = id;
    },
    clear() {
      state.selectedId = null;
    }
  }),
  { key: 'my-tool' } // clé de sérialisation dans le projet
);

export { state as myToolState, actions as myToolActions };
```

> **Exception** : `facets` n'utilise pas `createToolStore` — sa gestion de `generatedVisualizationIds` est trop spécifique.

---

## Tests

Deux projets Vitest coexistent dans `vite.config.ts` :

| Projet   | Environnement | Fichiers                                 | Script                                    |
| -------- | ------------- | ---------------------------------------- | ----------------------------------------- |
| `client` | jsdom         | `src/**/*.svelte.test.ts` (co-localisés) | `pnpm test:unit`                          |
| `server` | Node          | `tests/pipeline/**` + `tests/duckdb/**`  | `pnpm test:pipeline` / `pnpm test:duckdb` |

**Client (jsdom)** : mock global de `@duckdb/duckdb-wasm` et `$lib/features/duckdb` pour empêcher le chargement du worker WASM. Utiliser `vi.hoisted()` pour les mocks avant import. Stub de `matchMedia` disponible.

**Server (Node)** : mock global de `@duckdb/duckdb-wasm`. Les tests qui ont besoin d'un vrai DuckDB utilisent `@duckdb/node-api` via `tests/pipeline/duckdb-node-helper`. Pool `forks` + `fileParallelism: false` pour isolation complète entre fichiers.

**Règle** : tout changement de feature doit mettre à jour les tests dans le même commit. Voir [REFERENCE.md](REFERENCE.md) pour les helpers de test.

---

## Règles obligatoires

1. **TypeScript strict** — jamais `any`, utiliser `unknown` + narrowing.
2. **Svelte 5 Runes** — `$state`, `$derived`, `$effect`. Pas de `writable()`, `$:`, `export let`.
3. **Carbon Design System** pour toute l'UI — jamais `<input>`, `<button>`, `<select>` natifs bruts.
4. **Carbon × Svelte 5 event traps** — `carbon-components-svelte@0.106.x` est distribué en source Svelte 4 ; certains events dispatchent de façon parasite sous Svelte 5 :
   - `<Slider>` → `on:input` uniquement (jamais `on:change`)
   - `<Checkbox>` → `on:change` uniquement (jamais `on:check`)
   - `<RadioButtonGroup on:change>` → early-return si la valeur n'a pas changé
   - Règles complètes : `.claude/rules/carbon-svelte5.md`
5. **Paraglide i18n** pour tout texte visible — `m.key()` depuis `$lib/paraglide/messages`. Mettre à jour FR et EN ensemble.
6. **Logger** (`$lib/features/commons/utils/logger`) — jamais `console.log` en production.
7. **DuckDB-first** — `Duck.read_csv()`, `ST_Read()`, `read_parquet()`. Pas de parsers JS pour les formats que DuckDB gère.
8. **Conventional Commits** — `feat:`, `fix:`, `refactor:`, `perf:`, `test:`, `docs:`, `chore:`.
9. **Fichiers kebab-case** — `mon-composant.svelte`, jamais `MonComposant.svelte`.
10. **Pas de magic strings** — constantes, enums, ou type literals explicites.
11. **Pas de commentaires sauf nécessité absolue** — le code doit être auto-documenté. Commenter uniquement les invariants non-évidents, les contournements de bugs spécifiques, ou les contraintes cachées.

---

## CI / CD

**GitHub Actions** (`.github/workflows/pr-validation.yml`) sur chaque PR vers `staging` ou `main` :

1. Lint + typecheck
2. Tests pipeline + DuckDB (server-side, fiables en CI)
3. Build de production

Les tests client jsdom ne tournent pas en CI car `jsdom` ne simule pas DuckDB WASM de façon fiable. Ils sont exécutés localement.

---

## Déploiement

Khartis est un site statique déployé sur FTP :

```bash
# 1. S'assurer que la CI est verte (Quality Checks GitHub)
# 2. Valider l'UX manuellement (import → viz → export)
pnpm build          # Génère build/ (HTML + JS + assets + fonds de carte)
# 3. Déployer build/ sur le FTP
```

---

## Ajouter un outil dans la step-toolbar

1. Créer `src/lib/features/step-toolbar/tools/<nom>/`.
2. Ajouter `<nom>.store.svelte.ts` avec `createToolStore` et un `DEFAULT_STATE`.
3. Créer `<nom>.svelte` avec les composants Carbon et les clés i18n.
4. Créer `<nom>.types.ts` avec les types publics.
5. Enregistrer dans la configuration de navigation du toolbar.
6. Ajouter les clés i18n dans `messages/fr.json` et `messages/en.json`.
7. Écrire les tests co-localisés.

## Ajouter un processeur de pipeline

1. Ajouter le `FileType` dans `commons/types/create-project.types.ts`.
2. Déclarer l'extension dans `data-pipeline/constants.ts`.
3. Mettre à jour `detectFileFormat()` dans `data-pipeline/core/format-detector.ts`.
4. Créer le processeur dans `data-pipeline/processors/strategies/<nom>-processor.ts` (implémente `FileProcessor`).
5. Exporter depuis `data-pipeline/processors/strategies/index.ts`.
6. Enregistrer dans `data-pipeline/processors/register-processors.ts`.
7. Si le processeur doit être actif (pas en fallback), ajouter le `FileType` à `RAW_FILE_PROCESSOR_TYPES` dans `data-pipeline/processors/file-processor.ts`.
8. Écrire les tests co-localisés.
