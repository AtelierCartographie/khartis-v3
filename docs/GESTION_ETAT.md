# Gestion de l'état

> Stores Svelte 5, persistance IndexedDB, snapshot projet et undo/redo.

**Voir aussi** : [ARCHITECTURE.md](ARCHITECTURE.md) · [GUIDE_DEVELOPPEUR.md](GUIDE_DEVELOPPEUR.md) · [PIPELINE_DONNEES.md](PIPELINE_DONNEES.md)

---

## Les 4 couches d'état

| Couche              | Rôle                                           | Durée de vie              | Stockage                         |
| ------------------- | ---------------------------------------------- | ------------------------- | -------------------------------- |
| **Composant local** | État UI éphémère (inputs ouverts, toggles)     | Montage du composant      | `$state` dans le `.svelte`       |
| **Store feature**   | Modèle de domaine + actions d'une feature      | Session navigateur        | `$state` dans `.store.svelte.ts` |
| **Store global**    | Coordination cross-features                    | Session navigateur        | Singleton (`projectStore`, etc.) |
| **IndexedDB**       | Projets, métadonnées et assets binaires source | Persistant entre sessions | Object stores dédiés             |

**Flux** : mutation dans un composant → store feature → store global → `persistenceRegistry` → sérialisation → IndexedDB. La sérialisation est debounce (750 ms par défaut, défini par `DEFAULT_DEBOUNCE_INTERVAL` dans `project-management/core/persistence-registry.ts`) sauf pour les opérations critiques.

---

## Pattern de store (factory Svelte 5)

```typescript
function createFeatureStore() {
  const state = $state({ enabled: false, data: null as MyData | null });

  // $derived au top-level pour les calculs coûteux
  const summary = $derived.by(() => computeSummary(state.data));

  return {
    get enabled() {
      return state.enabled;
    },
    get data() {
      return state.data;
    },
    get summary() {
      return summary;
    }, // retourne la valeur, pas le rune

    enable() {
      state.enabled = true;
    },
    setData(d: MyData) {
      state.data = d;
    }
  };
}

export const featureStore = createFeatureStore();
```

**Règles** :

- `$derived` pour les calculs coûteux (filtres, mappings larges). Pour des calculs simples, un getter qui recalcule est acceptable.
- Pas d'affectation directe sur l'état de domaine depuis l'extérieur — toujours via méthode.
- L'état UI éphémère (toggle panneau, valeur en cours de saisie) reste local au composant.
- `datasetsState` et `datasetsInternals` (feature `duckdb/`) sont un état partagé exporté au niveau module — exception au pattern factory pour permettre à plusieurs sous-modules de partager le même `$state`.

---

## Stores principaux

### `projectStore`

Cycle de vie des projets, gestion des fichiers, historique undo/redo.

```typescript
// Cycle de vie
await projectStore.createProject(name, files);
await projectStore.loadProject(id);
await projectStore.duplicateProject(id, newName?);
await projectStore.deleteProject(id);

// Fichiers
await projectStore.addFilesToProject(files);
await projectStore.removeFileFromProject(fileId);

// Mutations (créent un snapshot undo)
projectStore.updateProjectName(name);

// Historique
projectStore.undo();
projectStore.redo();
projectStore.canUndo  // boolean (getter recalculé)
projectStore.canRedo  // boolean (getter recalculé)

// Archive .kh
await projectStore.exportProject(name?);   // → Blob
await projectStore.importProject(file);
```

> Les mutations de visualisation et de mise en page passent par leurs stores respectifs (`visualizationStore.updateXxx()`, `layoutStore.updateXxx()`), pas par `projectStore` directement. `projectStore` ne se charge que du cycle de vie projet et du snapshot global.

### `datasetsStore`

Datasets chargés en session, avec colonnes enrichies et statistiques. Exposé principalement en lecture depuis les composants ; les mutations passent par `duckDBOrchestrator`.

### `visualizationStore`

Configurations de visualisations actives. Types supportés : `choropleth`, `proportional`, `categorical`, `bivariate`. Chaque config contient `type`, `mapping` (colonnes), `style` (couleurs, épaisseurs), `classification` (méthode, breaks, counts).

### `globalState` + `globalActions`

Zoom page, pan, étape active (Données / Visualisations / Habillage), outil actif. `globalActions` est un export séparé pour les mutations coordonnées. Ces valeurs sont persistées dans le snapshot projet via `uiSettings.globalUi`.

### Autres stores globaux

| Store              | Rôle                                                          |
| ------------------ | ------------------------------------------------------------- |
| `projectsStore`    | Liste des projets + projet actif                              |
| `zoomModeStore`    | Mode zoom carte vs page (persisté dans `uiSettings.zoomMode`) |
| `mapStyleStore`    | Fond de carte actif + couches visibles                        |
| `annotationsStore` | Annotations SVG overlay                                       |
| `legendStore`      | Légendes actives + style                                      |

---

## Persistance — snapshot projet

Le JSON projet ne contient que des **métadonnées légères**. Les octets source vivent dans IndexedDB.

```typescript
interface KhartisProject {
  id: string;
  manifest: {
    version: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    format: 'kh';
  };
  data: { sourceFiles: UploadedFile[]; basemap?: { type; id; data? } };
  visualization?: VisualizationConfig;
  layout?: LayoutConfig;
  resources?: Record<string, unknown>;
}
```

**Ce qui est persisté** : `datasetId`, `assetRef`, aperçu limité, statistiques, transformations, jointures, géolocalisation.

**Ce qui ne l'est pas** : les octets source (dans `project_asset_chunks`), les résultats de recherche, les sélections temporaires, les calculs en cours.

### Object stores IndexedDB

| Store                  | Contenu                                                  |
| ---------------------- | -------------------------------------------------------- |
| `projects`             | Snapshot projet metadata-only                            |
| `metadata`             | Liste des projets + dernier projet ouvert                |
| `project_assets`       | Métadonnées d'assets (`assetId`, taille, MIME)           |
| `project_asset_chunks` | Chunks binaires des fichiers source (8 Mo max par chunk) |
| `project_asset_refs`   | Références `projectId → assetId` (cycle de vie assets)   |

### Registre de persistance

Le serializer ne lit pas les stores un par un. Chaque store s'enregistre dans `persistenceRegistry`, et le projet est sérialisé en 4 blocs stables :

| Bloc                    | Contenu                                                                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `basemapSettings`       | Couches, style, labels, projection carte, vue carte                                                                                                                      |
| `visualizationSettings` | Visualisations, sélection active                                                                                                                                         |
| `layoutSettings`        | Format, annotations, légende, indications géographiques, projection                                                                                                      |
| `uiSettings`            | État UI durable : `globalUi`, `zoomMode`, `dataTab`, `dataWorkflow`, `dataTools`, `datasetsView`, `tableFilters`, `colorBlindness`, `facets`, `search`, `simplification` |

---

## Auto-sauvegarde

```
Mutation → flag dirty → reset timer 750 ms → sérialisation metadata-only → IndexedDB
```

**Sauvegarde immédiate** (bypass debounce) : création de projet, fin d'import, ajout/suppression de fichier, export explicite. Les assets binaires sont persistés une seule fois à l'import et ne sont pas réécrits à chaque auto-save.

### Limites de stockage

| Type                                        | Limite | Comportement               |
| ------------------------------------------- | ------ | -------------------------- |
| CSV / TSV / GeoJSON / KML / KMZ / GPX       | 150 Mo | Erreur de validation       |
| GeoPackage / GeoParquet / Arrow / Shapefile | 200 Mo | Erreur de validation       |
| ZIP générique                               | 100 Mo | Erreur de validation       |
| Nombre de projets                           | 50 max | Erreur de création au-delà |

---

## Undo / Redo

### Ce qui crée un snapshot

Création de projet, renommage, modification d'une visualisation, changement de layout.

### Ce qui ne crée pas de snapshot

Changements UI transitoires (toggle de panneau, sélection d'outil), saisie dans un input avant commit debounce, ajout ou suppression de fichier.

### Paramètres de l'historique

| Paramètre     | Valeur                                             |
| ------------- | -------------------------------------------------- |
| Max snapshots | 50 (FIFO)                                          |
| Stockage      | Snapshots complets (pas de diffs structurels)      |
| Timeline      | Linéaire — tronquée après undo + nouvelle mutation |

---

## Format d'archive `.kh`

Le format `.kh` est une archive autoportante contenant :

```
manifest.json        ← version, dates, nom du projet
project.json         ← snapshot metadata-only
assets/
  <assetId>          ← fichier source compressé dans l'archive
```

À l'import, chaque fichier source est découpé en chunks pour son stockage dans IndexedDB. Ce découpage est interne au navigateur et ne modifie pas la structure de l'archive.

**Export** : `projectStore.exportProject()` → `Blob` → téléchargement navigateur.

**Import** : `projectStore.importProject(file)` valide l'archive et le schéma, restaure les assets dans IndexedDB, désérialise le snapshot metadata-only, puis rejoue les tables DuckDB. La validation précède l'écriture des assets pour ne pas conserver de données orphelines quand un projet est incompatible.

**Compatibilité** : la baseline publique est l'archive `.kh` v2 avec le schéma projet `3.9.0`. Les formats de la phase de développement ne sont pas supportés. Toutes les futures versions publiques doivent conserver une chaîne de migration continue. Voir [PROJECT_FORMAT_COMPATIBILITY.md](PROJECT_FORMAT_COMPATIBILITY.md).

---

## Interactions cross-features

| Déclencheur                  | Features impactées           | Mécanisme                                                      |
| ---------------------------- | ---------------------------- | -------------------------------------------------------------- |
| Changement de projection     | Annotations, indications géo | Les composants réagissent via `$derived` sur `projectionStore` |
| Simplification               | Couches, carte               | Rafraîchissement des Arrow tables via `duckDBOrchestrator`     |
| Édition de légende           | Carte, export                | `legendStore` ← sync avec `visualizationStore`                 |
| Changement de format papier  | Mise en page, export         | `layoutStore` recalcule l'échelle                              |
| Ajout/suppression de fichier | Pipeline, datasets           | `projectStore` → `duckDBOrchestrator`                          |

Les features ne s'abonnent pas directement aux stores des autres features. Elles réagissent aux stores globaux (`projectStore`, `datasetsStore`, `visualizationStore`) ou aux hooks partagés dans `commons/`.
