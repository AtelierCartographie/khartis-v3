# Gestion de l'etat

> Stores Svelte 5, persistance, undo/redo et patterns de features

**Voir aussi** : [Architecture](./ARCHITECTURE.md) | [Pipeline de donnees](./PIPELINE_DONNEES.md) | [Visualisation](./VISUALISATIONS.md)

---

## Les 4 couches d'etat

| Couche                      | Role                               | Duree de vie      | Stockage                              |
| --------------------------- | ---------------------------------- | ----------------- | ------------------------------------- |
| **Composant local**         | Etat UI ephemere (inputs, modales) | Montage composant | `$state` dans le `.svelte`            |
| **Store feature**           | Modele domaine + actions           | Session           | `$state` dans le store `.svelte.ts`   |
| **Store global**            | Coordination cross-feature         | Session           | Singleton `ProjectStore`              |
| **IndexedDB / localforage** | Projets et datasets durables       | Persistant        | IndexedDB + localforage (metadonnees) |

**Flux** : Composant --> Store feature --> Store global --> IndexedDB (debounce 5 s sur mutations, auto-save intervalle 30 s)

## Pattern de store Svelte 5 Runes

Chaque store est un **singleton fonctionnel** (function factory, pas de classe) avec `$state` prive, getters publics et methodes de mutation explicites.

```ts
export function createFeatureStore() {
  const state = $state({
    enabled: false,
    data: null as MyData | null
  });

  // Etat derive -- declare au top level, PAS dans un getter
  const isValid = $derived(state.data !== null);

  return {
    // Getters publics (lecture seule)
    get enabled() {
      return state.enabled;
    },
    get data() {
      return state.data;
    },

    // Getter pour etat derive (renvoie la valeur, ne cree pas le $derived)
    get isValid() {
      return isValid;
    },

    // Actions (mutations explicites)
    enable() {
      state.enabled = true;
    },
    disable() {
      state.enabled = false;
    },
    setData(data: MyData) {
      state.data = data;
    }
  };
}

// Export singleton
export const featureStore = createFeatureStore();
```

**Regles** :

- Pas d'affectation directe (toujours via methode), sauf pour les mutations UI ephemeres (`set settingPanel()`, etc.)
- `$derived` est optionnel pour les valeurs derivees simples. Dans la pratique, le code utilise rarement `$derived` -- les getters qui recalculent (ex: `hasConsented`, `isMapMode`) sont acceptables pour des operations peu coteuses. Utiliser `$derived` uniquement pour des calculations coteuses (filtrage, mapping, etc.)
- UI ephemere local au composant, seul l'etat domaine est persiste

## Stores principaux

### projectStore

Cycle de vie projet, fichiers, historique.

```ts
// Cycle de vie
createProject(name: string, files: UploadedFile[]): Promise<void>
loadProject(id: string): Promise<void>
duplicateProject(id: string, newName?: string): Promise<void>
deleteProject(id: string): Promise<void>

// Fichiers
addFilesToProject(files: UploadedFile[]): Promise<void>
removeFileFromProject(fileId: string): Promise<void>

// Mutations (creent un snapshot)
updateProjectName(name: string): void
updateVisualization(patch: Partial<VisualizationConfig>): void
updateLayout(patch: Partial<LayoutConfig>): void

// Historique
undo(): void
redo(): void
canUndo: boolean  // appel a canUndoFn() -- pas un $derived
canRedo: boolean  // appel a canRedoFn() -- pas un $derived

// Archive .kh
createProjectArchive(name?: string): Promise<Blob>
importProjectArchive(file: File): Promise<void>
```

### datasetsStore

Datasets charges, colonnes, statistiques.

> **Pattern avance** : `datasetsState` et `datasetsInternals` sont exportes au niveau du module (`datasets-state.svelte.ts`) et non dans le store factory. Ce pattern "etat externe partage" permet a plusieurs sous-modules du store de partager le meme `$state`.

### visualizationStore

Config visualisations. Types : `choropleth`, `proportional`, `categorical`, `bivariate`. Classifications : `equal-interval`, `quantile`, `jenks`, `stddev`, `manual`.

### globalState + globalActions

Zoom page, pan, etape active. `globalActions` est un export separe contenant les mutations coordonnees (ex: `setNavigationState`, `setToolbarState`).

### projectsStore

Liste des projets, projet actif. Localise dans `projects.store.svelte.ts`.

### consentStore

Consentement utilisateur (RGPD). Utilise un getter `hasConsented` qui recalcule (pas de `$derived`).

### zoomModeStore

Mode zoom (map vs page). Utilise un getter `isMapMode` qui recalcule (pas de `$derived`).

## Snapshot projet

```ts
interface KhartisProject {
  id: string;
  manifest: {
    version: string; // '3.0.0'
    createdAt: Date;
    updatedAt: Date;
    name: string;
    author?: string;
    description?: string;
    format: 'kh' | 'khartis';
  };
  data: {
    sourceFiles: UploadedFile[];
    basemap?: { type: string; id: string; data?: any };
  };
  visualization?: VisualizationConfig;
  layout?: LayoutConfig;
  resources?: Record<string, any>;
}
```

Les fichiers sources (dont `parsedData`, `statistics`, `content`) sont embarques dans le projet.

## Auto-sauvegarde

```mermaid
flowchart LR
    MUT["Mutation d'etat"] --> FLAG["Flag dirty"]
    --> TIMER["Demarrage/reset timer<br/>(debounce 5 s)"]
    --> JSON["Timer expire<br/>→ Serialisation JSON"]
    --> VAL["Validation taille"]
    --> IDB["IndexedDB"]

    style MUT fill:#e3f2fd
    style IDB fill:#e8f5e9
```

**Sauvegarde immediate** (bypass debounce) : creation de projet, fin d'import, ajout/suppression de fichier, export explicite.

### Limites de stockage

| Limite             | Valeur | Comportement         |
| ------------------ | ------ | -------------------- |
| Taille max fichier | 50 Mo  | Erreur de validation |
| Taille max projet  | 100 Mo | Avertissement a 80 % |
| Nombre max projets | 50     | Avertissement a 80 % |

## Undo / Redo

### Declencheurs de snapshot

**Cree un snapshot** : creation de projet, renommage, mise a jour metadonnees, modification visualisation/layout.

**Pas de snapshot** : changements UI transitoires (toggle panel, selection), saisie dans les inputs (avant commit debounce), ajout/suppression de fichier.

### Historique

| Parametre     | Valeur             | Comportement                            |
| ------------- | ------------------ | --------------------------------------- |
| Max snapshots | 50                 | FIFO -- le plus ancien est supprime     |
| Stockage      | Snapshots complets | Pas de diffs structurels                |
| Timeline      | Lineaire           | Tronquee apres undo + nouvelle mutation |

## Format d'archive (.kh)

- **Export** : JSON compresse gzip (`CompressionStream`), fallback sur JSON brut
- **Import** : tente la decompression gzip d'abord, fallback JSON brut, valide le manifest

## Metadonnees (localforage)

| Cle        | Type                     | Role                                       |
| ---------- | ------------------------ | ------------------------------------------ |
| `CURRENT`  | `string`                 | Dernier projet ouvert                      |
| `METADATA` | `SavedProjectMetadata[]` | Liste des projets (id, nom, taille, dates) |

## Pattern pour ajouter un store feature

```
src/lib/features/<nom-feature>/
  <nom-feature>.svelte              # Composant d'entree
  <nom-feature>.store.svelte.ts     # Etat + actions
  <nom-feature>.types.ts            # Types
  components/                        # Sous-composants
  utils/                             # Utilitaires specifiques
  tests/                             # Tests
```

1. Creer le store avec `createFeatureStore()` (pattern ci-dessus)
2. Creer le composant UI
3. Enregistrer dans la configuration de navigation du toolbar
4. Ajouter les cles i18n : `tool_<nom>_*`
5. Ajouter les tests

## Interactions cross-features

| Declencheur              | Features impactees           | Action                     |
| ------------------------ | ---------------------------- | -------------------------- |
| Changement de projection | Annotations, Geo-indicateurs | Recalcul des positions     |
| Simplification           | Couches, Carte               | Rafraichissement geometrie |
| Edition legende          | Carte, Export                | Re-rendu legende           |
| Changement de format     | Mise en page, Export         | Ajustement d'echelle       |

## Gestion d'erreur

Expression invalide : garder la valeur precedente. Echec simplification : revert geometrie. Projection manquante : fallback Equirectangulaire. Quota depasse : purge du plus ancien projet.
