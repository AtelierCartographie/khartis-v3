# State & Persistence

## Layers

| Layer          | Purpose                                | Lifetime   |
| -------------- | -------------------------------------- | ---------- |
| Local ($state) | Ephemeral UI                           | Component  |
| Feature store  | Domain model + actions                 | Session    |
| Global store   | Cross-feature coordination             | Session    |
| IndexedDB      | Durable project + datasets             | Persistent |
| localforage    | Lightweight metadata (recent projects) | Persistent |

## Principles

Single source per domain; explicit mutation methods; pure $derived; debounce auto-save; bounded undo stack.

## Project Snapshot (Current Shape)

```ts
interface KhartisProject {
  id: string;
  manifest: {
    version: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    author?: string;
    description?: string;
    format: 'kh' | 'khartis';
  };
  data: {
    sourceFiles: UploadedFile[];
    processedData?: any; // planned enrichment outputs (not broadly used yet)
    joinedData?: any; // placeholder for future joins
    basemap?: {
      // optional basemap reference
      type: string;
      id: string;
      data?: any;
    };
  };
  visualization?: VisualizationConfig;
  layout?: LayoutConfig;
  resources?: Record<string, any>; // auxiliary assets (future use)
}
```

Source file objects (including parsedData, statistics, content) are currently embedded inside the project (IndexedDB snapshot + archive). A future optimization may externalize large row data into a dedicated datasets store with lightweight references in the project snapshot.

## Auto-Save

Dirty flag set on mutation → debounce timer (~30s default) → serialize (JSON) → IndexedDB write. Immediate save on project creation, import completion, explicit export, and file add/remove (even though file add/remove does not create a history entry). Timer resets on each structural mutation; no parallel save executions.

## Undo/Redo

Snapshots are added on project-level structural mutations:

- Project created
- Project name change
- Project data object updated (high-level data metadata modifications)
- Visualization updated
- Layout updated

Adding or removing source files does not currently push a history snapshot (only marks dirty and saves). Future timeline truncated after undo + new mutation. History bounded (cap 50). Oldest entry dropped FIFO when exceeding cap. Full snapshots stored (no structural diffs) so keep project object minimal.

### Snapshot Triggers (Examples)

| Change                                   | Snapshot?         | Notes                          |
| ---------------------------------------- | ----------------- | ------------------------------ |
| Typing in label input (debounced commit) | No (until commit) | Avoid noise                    |
| Add / remove source file                 | No                | Only saved; not in history yet |
| Change classification method             | Yes               | Via visualization update       |
| Update layout panel config               | Yes               | Layout structural change       |
| Toggle transient UI panel                | No                | Ephemeral UI only              |

## Quota Handling

Before save: approximate serialized size; basic guard vs limits. On quota error: strategy (planned) to purge oldest project metadata then retry; current code surfaces validation errors (some messages still French; pending localization pass).

## Migration

Compare manifest.version (currently fixed '3.0.0'); future: apply ordered migration scripts. Serializer normalizes Date fields to ISO; UploadedFile binary content (ArrayBuffer) converted to numeric array; deserializer rebuilds typed arrays and Date instances.

## Performance

Cache stable sub-objects (manual); schedule non-critical saves via requestIdleCallback (planned); serialization ensures binary buffers converted exactly once; no compression in IndexedDB (raw JSON) to keep random access simple.

## Validation & Limits (Current Defaults)

| Limit                    | Value       | Notes                      |
| ------------------------ | ----------- | -------------------------- |
| Max single file size     | 50 MB       | Validation error > limit   |
| Max project (serialized) | 100 MB      | Warning at 80%             |
| Max project count        | 50          | Warning at 80% threshold   |
| Storage advisory         | 5 MB approx | Metadata + last project id |

Validator currently emits warnings/errors in French (needs i18n alignment with rest of UI).

## Store API (Selected)

| Method                     | Purpose                            |
| -------------------------- | ---------------------------------- |
| createProject(name, files) | Initialize new project + history   |
| loadProject(id)            | Load and set current project       |
| addFilesToProject(files)   | Append source files (no snapshot)  |
| removeFileFromProject(id)  | Remove source file (no snapshot)   |
| updateProjectName(name)    | Modify name + snapshot             |
| updateProjectData(patch)   | Merge data object + snapshot       |
| updateVisualization(patch) | Merge visualization + snapshot     |
| updateLayout(patch)        | Merge layout + snapshot            |
| undo()/redo()              | Navigate history entries           |
| setAutoSave(enabled, ms?)  | Toggle and optionally change delay |
| exportProject(name?)       | Create downloadable archive        |
| importProject(file)        | Load from archive                  |
| duplicateProject(id,name?) | Deep copy with new id              |
| deleteProject(id)          | Remove persisted project           |

## Quick Reference

- Project snapshot currently embeds uploaded file parsedData (future externalization planned)
- History captures only specific project-level mutations
- Bounded history (50 entries)
- Auto-save debounce default 30s; manual + file add/remove saves validate size limits
- Dates normalized to ISO on save; restored to Date objects on load; binary file buffers reconstructed
- Validator messages still partly French → pending localization
- create-project store is ephemeral (modal only) and not persisted; history not persisted across sessions
- Project duplication appends localized suffix via i18n key (previous hard-coded " (copie)" replaced)

## Archive (.kh) Export

Two export paths exist:

- Compressed archive (`createProjectArchive`): JSON structure (manifest, data, visualization, layout, resources) gzip-compressed via CompressionStream when supported; falls back to raw bytes if unsupported.
- Plain JSON (`exportProject`): Pretty JSON (uncompressed) primarily for diagnostics (not always surfaced in UI).

Import attempts gzip decompression first; on failure treats content as plain JSON. Basic structural validation checks manifest + data presence; no deep schema versioned migration yet.

## Metadata Index

localforage keys:

- CURRENT: last opened project id
- METADATA: array of SavedProjectMetadata (id, name, size, createdAt, updatedAt, description)
- AUTOSAVE / PREFERENCES: reserved for future usage (preferences storage not fully implemented)

Metadata list sorted by updatedAt desc on load; size computed from serialized project JSON length.
