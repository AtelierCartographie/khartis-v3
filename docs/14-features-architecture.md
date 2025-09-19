# Features Architecture

## Overview

Khartis v3 uses a feature-first architecture with clear separation of concerns. Each feature is self-contained with its own components, stores, and utilities.

## Core Structure

```
src/lib/features/
├── commons/          # Shared resources
├── create-project/   # Project creation flow
├── header/           # Application header
├── main-toolbar/     # Main navigation
├── map/              # Map rendering
├── side-nav.svelte   # Side navigation
└── step-toolbar/     # Tool-specific features
```

## Commons Module

### Store Pattern

All stores follow a consistent Svelte 5 runes pattern:

```typescript
class FeatureStore {
  private _state = $state({ /* initial state */ })

  get derivedValue() {
    return $derived(() => /* computation */)
  }

  performAction() {
    this._state.property = newValue
  }
}
```

### Key Stores

**project.store.svelte.ts**

- Project metadata and state
- File management
- Serialization/deserialization

**global.svelte.ts**

- Application-wide state
- Toolbar state management
- Zoom controls (map/page modes)

**data-tab.store.svelte.ts**

- Data import workflow
- Validation and typing
- Join operations

**create-project.store.svelte.ts**

- Project creation workflow
- Template selection
- Initial configuration

### Utilities

**notification.utils.svelte.ts**

- Centralized notification system
- Success, error, warning, info types
- Auto-dismiss with configurable timeouts

**file-import.utils.ts**

- File parsing (CSV, GeoJSON, etc.)
- Slugification for safe naming
- Duplicate detection

**project-persistence.utils.ts**

- IndexedDB integration
- Auto-save functionality
- Project history management

**project-serialization.utils.ts**

- .kh archive format handling
- State export/import
- Version compatibility

## Main Toolbar

The main toolbar (`main-toolbar/`) manages the primary workflow steps:

### Data Tab

- **data-control-step.svelte**: Import and validation
- **geolocation-step.svelte**: Geographic matching
- **basemap-join-step.svelte**: Data enrichment

### Visualization Tab

- Layer management
- Visualization type selection
- Classification settings

### Layout Tab

- Page composition
- Export preparation
- Final adjustments

## Step Toolbar Tools

Each tool in `step-toolbar/tools/` follows the same architecture:

### Store Files (13 total)

- annotations.store.svelte.ts
- color-blindness.store.svelte.ts
- facets.store.svelte.ts
- format.store.svelte.ts
- geo-indications.store.svelte.ts
- layers.store.svelte.ts
- legend.store.svelte.ts
- projections.store.svelte.ts
- search.store.svelte.ts
- simplification.store.svelte.ts

### Tool Categories

**Data Tools**

- **search/**: Entity and value search
- **layers/**: Layer hierarchy management

**Visualization Tools**

- **facets/**: Small multiples for comparison
- **projections/**: Map projection catalog
- **simplification/**: Geometry generalization
- **color-blindness/**: Accessibility filters

**Layout Tools**

- **format/**: Page dimensions and grids
- **legend/**: Map legend generation
- **annotations/**: Text, shapes, drawing
- **geo-indications/**: Scale bars, north arrows

## Map Module

### Components

**zoom-toolbar.svelte**

- Dual-mode zoom (map/page)
- Keyboard shortcuts integration
- Visual zoom level display

## State Management Philosophy

1. **Single Source of Truth**: Each feature has one primary store
2. **Derived Values**: Computed with `$derived()` for efficiency
3. **Action Pattern**: State mutations through explicit methods
4. **Type Safety**: Full TypeScript typing, no `any`
5. **Reactivity**: Svelte 5 runes for automatic updates

## Integration Points

### Project Workflow

1. Create/Open project → `create-project/`
2. Import data → `main-toolbar/data-tab/`
3. Configure visualization → `step-toolbar/tools/`
4. Compose layout → `step-toolbar/tools/format/`
5. Export → `header/download-button.svelte`

### Event System

- Custom events defined in `commons/types/custom-events.d.ts`
- Click-outside directive in `commons/utils/click-outside.ts`
- Notification bubbling through `notification.utils.svelte.ts`

## Performance Considerations

- Lazy loading of tool components
- Efficient state updates with runes
- Debounced user inputs
- Progressive rendering for large datasets
- Memory cleanup in store destructors

## Developer Guidelines

### Adding a New Tool

1. Create directory in `step-toolbar/tools/`
2. Implement store with standard pattern
3. Create UI components
4. Register in toolbar navigation
5. Add types in `commons/types/`

### State Persistence

- Use `project.store` for project data
- Implement serialization methods
- Handle version migrations
- Test with large datasets

### Error Handling

- Use notification system for user feedback
- Log errors with context
- Provide recovery options
- Maintain UI responsiveness
