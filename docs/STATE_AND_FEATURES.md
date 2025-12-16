# State Management & Features

> **State persistence, undo/redo, and feature implementation patterns**

## State Layers

| Layer               | Purpose                     | Lifetime        | Storage                |
| ------------------- | --------------------------- | --------------- | ---------------------- |
| **Component Local** | Ephemeral UI state          | Component mount | `$state` in component  |
| **Feature Store**   | Domain model + actions      | Session         | `$state` in store      |
| **Global Store**    | Cross-feature coordination  | Session         | ProjectStore singleton |
| **IndexedDB**       | Durable projects + datasets | Persistent      | IndexedDB API          |
| **localforage**     | Metadata (recent projects)  | Persistent      | localforage wrapper    |

## Design Principles

- **Single source per domain**: One canonical store per feature
- **Explicit mutations**: No direct state assignment, use methods
- **Pure derived**: Use `$derived` for computed values
- **Debounced auto-save**: 30s default, resets on mutations
- **Bounded history**: 50 snapshots max, FIFO when exceeded

## Project Snapshot Structure

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
    processedData?: any; // Future enrichment
    joinedData?: any; // Future joins
    basemap?: {
      type: string;
      id: string;
      data?: any;
    };
  };
  visualization?: VisualizationConfig;
  layout?: LayoutConfig;
  resources?: Record<string, any>;
}
```

**Note**: Source files (including `parsedData`, `statistics`, `content`) are embedded in project. Future: externalize to dedicated datasets store.

## Auto-Save Mechanism

**Flow:**

```
State Mutation → Set Dirty Flag → Start/Reset Debounce Timer (30s)
  ↓
Timer Fires → Serialize to JSON → Validate Size → Write to IndexedDB
```

**Triggers immediate save** (bypass debounce):

- Project creation
- Import completion
- File add/remove
- Explicit export

**Configuration:**

```ts
projectStore.setAutoSave(enabled: boolean, delayMs?: number);
```

## Undo/Redo System

### Snapshot Triggers

**Creates history snapshot:**

- Project created
- Project name change
- Project data metadata updated
- Visualization updated
- Layout updated

**No snapshot:**

- Transient UI changes (panel toggle, selection)
- Typing in inputs (until debounced commit)
- File add/remove (saved, but not in history)

### History Limits

| Limit         | Value          | Behavior                            |
| ------------- | -------------- | ----------------------------------- |
| Max snapshots | 50             | Oldest dropped FIFO                 |
| Storage       | Full snapshots | No structural diffs                 |
| Timeline      | Linear         | Truncated after undo + new mutation |

### Store API

```ts
projectStore.undo(); // Navigate back
projectStore.redo(); // Navigate forward
projectStore.canUndo; // Boolean derived
projectStore.canRedo; // Boolean derived
```

## Storage Limits

| Limit                 | Value  | Notes                           |
| --------------------- | ------ | ------------------------------- |
| **Max file size**     | 50 MB  | Validation error if exceeded    |
| **Max project size**  | 100 MB | Warning at 80%                  |
| **Max project count** | 50     | Warning at 80%                  |
| **Metadata size**     | ~5 MB  | Last project ID + metadata list |

**Quota handling**: On error, purge oldest project metadata and retry (planned)

## Project Store API

### Core Methods

```ts
// Project lifecycle
createProject(name: string, files: UploadedFile[]): Promise<void>
loadProject(id: string): Promise<void>
duplicateProject(id: string, newName?: string): Promise<void>
deleteProject(id: string): Promise<void>

// File management
addFilesToProject(files: UploadedFile[]): Promise<void>
removeFileFromProject(fileId: string): Promise<void>

// Mutations (create snapshots)
updateProjectName(name: string): void
updateProjectData(patch: Partial<ProjectData>): void
updateVisualization(patch: Partial<VisualizationConfig>): void
updateLayout(patch: Partial<LayoutConfig>): void

// Export/Import
exportProject(name?: string): Promise<Blob>
importProject(file: File): Promise<void>

// Archive (.kh compressed format)
createProjectArchive(name?: string): Promise<Blob>
importProjectArchive(file: File): Promise<void>

// History
undo(): void
redo(): void
```

## Archive Format (.kh)

### Export Strategies

**Compressed Archive** (default):

```ts
createProjectArchive(name);
// → gzip-compressed JSON (CompressionStream)
// → Fallback to raw bytes if unsupported
```

**Plain JSON** (diagnostics):

```ts
exportProject(name);
// → Pretty-printed JSON (uncompressed)
```

### Import

- Attempts gzip decompression first
- Falls back to plain JSON if decompression fails
- Validates manifest + data presence
- No deep schema migration yet (planned)

## Metadata Index

### localforage Keys

| Key           | Value                    | Purpose                              |
| ------------- | ------------------------ | ------------------------------------ |
| `CURRENT`     | `string`                 | Last opened project ID               |
| `METADATA`    | `SavedProjectMetadata[]` | Project list (id, name, size, dates) |
| `AUTOSAVE`    | (reserved)               | Future preferences                   |
| `PREFERENCES` | (reserved)               | Future user settings                 |

**Metadata structure:**

```ts
interface SavedProjectMetadata {
  id: string;
  name: string;
  size: number; // Bytes (serialized JSON length)
  createdAt: Date;
  updatedAt: Date;
  description?: string;
}
```

Sorted by `updatedAt` descending on load.

## Project Management Services

The project management feature uses **modular functional design** with the following structure:

```
src/lib/features/project-management/
├── index.ts              # Public API barrel exports
├── types.ts              # Type definitions
├── constants.ts          # Storage keys and limits
├── core/
│   ├── persistence.ts    # projectRepository (IndexedDB operations)
│   ├── storage.ts        # projectStorage (localforage wrapper)
│   └── serializer.ts     # serialize/deserialize functions
├── io/
│   ├── exporter.ts       # exportProject, createArchive
│   └── importer.ts       # importProject
├── operations/
│   ├── auto-save.ts      # AutoSaveController class
│   └── duplicate.ts      # duplicateProject function
└── utils/
    └── json-helpers.ts   # JSON utilities
```

| Module | Location | Responsibility |
| ------ | -------- | -------------- |
| `projectRepository` | `core/persistence.ts` | IndexedDB connection, save/load/remove projects, metadata management |
| `projectStorage` | `core/storage.ts` | Thin localforage wrapper for metadata and preferences |
| `serialize/deserialize` | `core/serializer.ts` | Convert between runtime and persisted representations |
| `exportProject/createArchive` | `io/exporter.ts` | Export to JSON or compressed `.kh` archive |
| `importProject` | `io/importer.ts` | Import and validate project files |
| `AutoSaveController` | `operations/auto-save.ts` | Debounced persistence after mutations |
| `duplicateProject` | `operations/duplicate.ts` | Clone existing projects |

## Feature Pattern

### Directory Structure

```
src/lib/features/<feature-name>/
├── <feature-name>.svelte           # Entry component
├── <feature-name>.store.svelte.ts  # State + actions
├── <feature-name>.types.ts         # Type definitions
├── components/                      # Sub-components
├── utils/                           # Feature-specific utilities
└── tests/                           # Tests
```

### Store Pattern

```ts
export class FeatureStore {
  // Private state
  protected _state = $state({
    enabled: false,
    data: null as MyData | null
  });

  // Public getters
  get enabled() {
    return this._state.enabled;
  }
  get data() {
    return this._state.data;
  }

  // Derived state
  get isValid() {
    return $derived(this._state.data !== null);
  }

  // Actions (explicit mutations)
  enable() {
    this._state.enabled = true;
  }

  disable() {
    this._state.enabled = false;
  }

  setData(data: MyData) {
    this._state.data = data;
  }
}

// Export singleton
export const featureStore = new FeatureStore();
```

## Project Creation Flow

### Three Modes (Ephemeral Store)

The create-project modal uses an **ephemeral store** (not persisted):

#### 1. New Mode

**Upload sources:**

- Multi-file: CSV/TSV, GeoJSON, Shapefile bundle, GeoPackage
- Paste: Tabular text (textarea)
- URL: Remote file fetch

**Workflow:**

```
File Drop → Validation → Processing (uploading → processing → complete/error)
  ↓
Shapefile components grouped
  ↓
Project name sanitized live
  ↓
Create enabled when: ≥1 complete file + valid name + not busy
```

**File statuses**: `uploading` | `processing` | `complete` | `error`

#### 2. Open Mode

- List saved projects (skeleton while loading)
- Load project → close modal
- Overflow menu: Duplicate, Delete (with confirmation)
- Import area: Accept `.kh` / `.khartis` archives

#### 3. Try Example Mode

- Category filter (EXAMPLE_CATEGORIES)
- Select example:
  1. Fetch remote file
  2. Wrap as File object
  3. Process with standard pipeline
  4. Set project name to example title
  5. Create project
  6. Navigate home

**Reset**: `resetAllTabs()` clears all modes when modal closes

## Tool Implementation

### Tool Lifecycle

```
Tool Tab Activated → Lazy Load Component → Init Store → Bind Dataset/Viz
  ↓
User Actions → Mutate Store → Derived Ripple → Update Layers/Layout
```

### Adding a Tool

1. Create folder: `src/lib/features/step-toolbar/tools/<tool-name>`
2. Create store: `<tool-name>.store.svelte.ts` with `$state`
3. Create UI: `<tool-name>.svelte` component
4. Register in toolbar navigation config
5. Add i18n keys: `tool_<tool-name>_*`
6. Add tests: Store logic + component rendering

### State Guidelines

| Rule                             | Reason                    |
| -------------------------------- | ------------------------- |
| **Ephemeral UI local**           | Reduce global state noise |
| **Persist only domain state**    | Clean project JSON        |
| **Heavy compute in $derived**    | Automatic memoization     |
| **DuckDB for expensive queries** | Responsive UI             |

## Tool Implementations Reference

### Annotations

- **Types**: Text, shapes, drawings, images
- **Features**: Rich formatting, positioning, layering
- **State**: Items list, selection, active type, styles

### Color Blindness

- **Simulations**: Protanopia, deuteranopia, tritanopia, achromatopsia
- **Purpose**: Accessibility testing for color palettes

### Geo Indicators

- **Elements**: Scale bar, north arrow, coordinate grid
- **Features**: Projection-aware, auto-unit conversion

### Simplification

- **Purpose**: Reduce geometry complexity
- **Settings**: Tolerance slider, preview mode, vertex count

### Search

- **Capabilities**: Text search, spatial search, attribute filter
- **Actions**: Highlight results, zoom to selection

### Layers

- **Features**: Reorder, visibility toggle, opacity, blend modes
- **Organization**: Layer groups, drag-and-drop

### Projections

- **Categories**: Cylindrical, conic, azimuthal, custom
- **Auto-suggestion**: Ranked by dataset extent fit

### Legend

- **Operations**: Reorder items, edit labels, merge classes
- **Customization**: Style, visibility, positioning

### Format & Layout

- **Settings**: Page size, orientation, margins
- **Export**: Resolution, title/subtitle configuration

### Facets (Collections)

- **Purpose**: Small multiples for comparison
- **Modes**: Common scale vs independent scale
- **Layout**: Grid columns, synchronized interactions

## Cross-Tool Interactions

| Trigger               | Affected Tools              | Action              |
| --------------------- | --------------------------- | ------------------- |
| **Projection change** | Annotations, Geo Indicators | Recompute positions |
| **Simplification**    | Layers, Map                 | Refresh geometry    |
| **Legend edit**       | Map, Export                 | Re-render legend    |
| **Format change**     | Layout, Export              | Scaling adjustments |

## Error Handling

| Context                    | Strategy                           |
| -------------------------- | ---------------------------------- |
| **Invalid expression**     | Highlight error, keep prior value  |
| **Simplification failure** | Revert geometry, show notification |
| **Projection missing**     | Fallback to Equirectangular        |
| **Quota exceeded**         | Purge oldest project, retry save   |

## Testing Checklist

- [ ] Store mutations update state correctly
- [ ] Derived values recompute on dependencies
- [ ] Component renders store state
- [ ] User interactions trigger correct actions
- [ ] Integration: Tool affects other features correctly
- [ ] History snapshots created appropriately
- [ ] Auto-save triggers on mutations

## Migration & Versioning

**Current**: manifest.version = `'3.0.0'`

**Future**: Ordered migration scripts based on version comparison

**Serialization**:

- Dates → ISO strings
- ArrayBuffer → numeric arrays
- Restoration rebuilds typed arrays and Date instances

---

**See also:**

- [ARCHITECTURE.md](ARCHITECTURE.md) - Store layering architecture
- [DATA_PIPELINE.md](DATA_PIPELINE.md) - Data processing
- [VISUALIZATION.md](VISUALIZATION.md) - Visualization store integration
