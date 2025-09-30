# Features & Tools

## Feature Pattern

````
<feature>/
  <feature>.svelte
  <feature>.store.svelte.ts
  <feature>.types.ts
  components/
  utils/

## Project Creation Flow

The project creation modal has three modes powered by an ephemeral create-project store (not persisted):

| Mode        | Purpose                                 | Core Actions / Stores                           |
| ----------- | --------------------------------------- | ------------------------------------------------ |
| New         | Build project from raw data sources     | processFiles, processPastedData, loadOnlineFile  |
| Open        | Load / duplicate / delete saved project | listProjects, loadProject, duplicateProject      |
| Try Example | Seed from curated example dataset       | loadExampleData, processFiles, createProject     |

### New Mode

Inputs:
- Multi file upload: CSV/TSV, GeoJSON, Shapefile bundle (.shp+.dbf+.shx[+.prj][+.cpg]), GeoPackage
- Pasted tabular text (textarea)
- Remote URL (validated before fetch)

Lifecycle:
1. Drop files → FileValidator.validateMultiple groups + validates
2. Valid files pushed with status uploading → processing → complete (or error)
3. Related shapefile component names rendered under primary entry
4. Warnings surfaced via InlineNotification (warning kind)
5. Remove single file or Clear all to reset list
6. Paste data → processPastedData parses inline CSV
7. URL set → setOnlineFileUrl → loadOnlineFile fetches and processes; clears field on success
8. Project name sanitized every edit (sanitizeProjectName)
9. Create enabled only if ≥1 file status=complete and name non-empty and not busy

File item statuses: uploading | processing | complete | error.

Simplified ephemeral shape:

```ts
interface NewProjectState {
  projectName: string;
  uploadedFiles: UploadedFileStatus[]; // id, name, size, status, errorMessage?, relatedFiles?, validation?
  isLoading: boolean;
  error?: string;
  onlineFileUrl?: string;
}
````

On create: projectStore.createProject(name, validFiles) persists initial snapshot, initializes history, closes modal, resets ephemeral state. Adding/removing files pre-creation does not create history snapshots.

### Open Mode

Displays saved projects (Skeleton while loading). Selecting loads project (loadProject) and closes modal. Overflow menu: Duplicate (duplicateProject) and Delete (deleteProject with confirmation modal). Import area accepts .kh / .khartis archive (size + extension validation).

### Try Example Mode

Category filter (EXAMPLE_CATEGORIES) narrows EXAMPLE_PROJECTS. Selecting an example:

1. loadExampleData fetches remote file
2. Wrap data as File (CSV or JSON by extension)
3. processFiles ingests it
4. setProjectName(example.title)
5. projectStore.createProject persists
6. Reset + navigate home

Errors show InlineNotification; logger records details.

### Reset

createProjectActions.resetAllTabs clears all three mode states each time modal closes. Store never writes directly to IndexedDB.

````

## Tool Lifecycle

Activate tab → lazy load → ensure store init → bind dataset/viz refs → user actions mutate store → derived ripple (layers/layout).

## Adding a Tool

1. Folder under `step-toolbar/tools/<name>`
2. Store with $state (enabled flag, domain state)
3. UI component `<name>.svelte`
4. Register in navigation / step toolbar config
5. i18n keys prefix `tool_<name>_`
6. Tests (store + component minimal)

## State Guidelines

| Rule                                | Reason              |
| ----------------------------------- | ------------------- |
| Ephemeral UI local                  | Reduce global noise |
| Persist only canonical domain state | Clean project JSON  |
| Heavy derived in $derived           | Memoization         |
| Workers for expensive tasks         | Responsive UI       |

## Cross-Tool Interactions

Projection change → recompute annotation anchors; simplification → refresh layer geometry; legend edits → re-render legend; format changes → layout scaling.

## Legend Editing

Reorder (visual only), label override, merge, toggle visibility (legend filtering not data removal).

## Collections (Facets)

Select variables → build multiple map instances → choose scale mode (common vs independent) → grid layout.

## Geo Indicators

Scale bar, north arrow, inset map, coordinate readout; all projection-aware.

## Error Handling Examples

| Context                | Strategy                     |
| ---------------------- | ---------------------------- |
| Invalid expression     | Highlight + keep prior value |
| Simplification failure | Revert geometry + notify     |
| Projection missing     | Fallback default projection  |

## Testing Minimum

Store logic (state mutation), component rendering, integration (facets count), legend operations.

## Tool Implementations

### Annotations Tool
Add text, shapes, drawings, and images to maps.

**Types**: text | shape | drawing | image

**Store State**:
```ts
interface AnnotationsState {
  items: AnnotationType[]
  selectedId: string | null
  activeType: 'text' | 'shape' | 'drawing' | 'image'
  predefinedStyle: string
  textContent: string
  defaultStyle: AnnotationStyle
}
````

**Components**:

- text-tool.svelte - Text annotations with rich formatting
- shape-tool.svelte - Rectangles, circles, arrows
- drawing-tool.svelte - Freehand lines and zones
- image-tool.svelte - Import and position images

### Color Blindness Tool

Simulate various color vision deficiencies.

**Simulation Types**:

- Protanopia (red-blind)
- Deuteranopia (green-blind)
- Tritanopia (blue-blind)
- Achromatopsia (complete color blindness)

### Geo Indications Tool

Add geographic reference elements.

**Elements**:

- Scale bar (automatic unit conversion)
- North arrow (projection-aware)
- Coordinate grid
- Location indicator

### Simplification Tool

Reduce geometry complexity for performance.

**Settings**:

- Tolerance slider (0.001 - 10)
- Preview mode
- Vertex count display
- Quality vs performance trade-off

### Search Tool

Find and highlight map features.

**Capabilities**:

- Text search in attributes
- Spatial search (bbox, radius)
- Filter by attribute values
- Highlight results

### Layers Tool

Manage visualization layers and ordering.

**Features**:

- Drag to reorder
- Toggle visibility
- Opacity control
- Blend modes
- Group management

### Projections Tool

Select and configure map projections.

**Categories**:

- Cylindrical (Mercator, Equirectangular)
- Pseudo-cylindrical (Robinson, Mollweide)
- Conic (Albers, Lambert)
- Azimuthal (Orthographic, Stereographic)
- Custom (WKT/PROJ.4 input)

**Auto-suggestion**: Ranks projections by dataset extent fit.

### Legend Tool

Configure and edit map legends.

**Operations**:

- Reorder items
- Edit labels
- Merge classes
- Toggle visibility
- Style customization

### Format Tool

Configure map layout and export settings.

**Sections**:

- Page size (A4, A3, custom)
- Orientation (portrait/landscape)
- Margins and padding
- Title and subtitle
- Export resolution

### Facets Tool

Create small multiples/collections.

**Settings**:

- Variable selection
- Grid columns
- Scale mode (common/independent)
- Synchronized pan/zoom
- Title templates

## Quick Reference

- One tool = one store
- Derived only for pure computed state
- Deactivate tools: clean timeouts/listeners
- Keep UI responsive: offload heavy tasks

```

```
