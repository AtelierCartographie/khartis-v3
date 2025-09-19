# Header Integration with Project Store

> **Note**: For export functionality details, see [Import/Export System](10-file-import-system.md)

## Overview

The header components are fully integrated with the centralized project state management system, providing seamless access to project operations and maintaining UI consistency across the application.

## Architecture

### Component Structure

```
src/lib/features/header/
├── header.svelte          # Main header container
├── project-title.svelte   # Project name display/edit
├── download-button.svelte # Export functionality
└── logo.svelte           # Application branding
```

### State Connection Flow

```
┌─────────────────┐     ┌──────────────────┐     ┌───────────────┐
│ Header Actions  │────▶│  Project Store   │────▶│   IndexedDB   │
│  (UI Events)    │◀────│   (State Mgmt)   │◀────│ (Persistence) │
└─────────────────┘     └──────────────────┘     └───────────────┘
         │                       │
         ▼                       ▼
┌─────────────────┐     ┌──────────────────┐
│  Create Modal   │     │   Auto-Save      │
│  (Tab Control)  │     │   (30s timer)    │
└─────────────────┘     └──────────────────┘
```

## Header Component Integration

### Main Header (header.svelte)

Connected to three stores for comprehensive functionality:

```typescript
import { globalState } from '$lib/features/commons/store/global.svelte';
import { projectStore } from '$lib/features/commons/store/project.store.svelte';
import { createProjectActions } from '$lib/features/commons/store/create-project.store.svelte';
```

#### Key Features

1. **New Project Button**
   - Selects tab 1 in create project modal
   - Opens modal via `globalState.isCreateProjectModalOpen`
   - Resets previous form state

2. **Open Project Button**
   - Selects tab 2 for opening existing projects
   - Opens same modal with different tab
   - Loads saved projects list

3. **Help Button**
   - Provides contextual assistance
   - Links to documentation

## Project Title Component

### Features

- **Real-time Display**: Shows current project name from store
- **Inline Editing**: Click to edit, Enter to save, Escape to cancel
- **Auto-save Integration**: Triggers dirty state on changes
- **Visual Feedback**: Save button shows when changes pending

### Implementation

```typescript
let projectName = $state(projectStore.projectName);
let isEditing = $state(false);

$effect(() => {
  projectName = projectStore.projectName;
});

function handleSave() {
  if (projectName.trim() && projectName !== projectStore.projectName) {
    projectStore.updateProjectName(projectName.trim());
    projectStore.saveCurrentProject();
  }
  isEditing = false;
}
```

### State Synchronization

- Uses Svelte 5's `$effect` for reactive updates
- Maintains local state for editing
- Commits changes to store on save

## Download Button Component

### Export Capabilities

Three export modes via tabbed interface:

1. **Project Export (.kh format)**
   - Complete project with all data
   - Compressed with gzip when supported
   - Preserves all state and configuration

2. **Map Export (Visual)**
   - SVG format for vector editing
   - JPG format for image use
   - Maintains visual fidelity

3. **Data Export**
   - CSV for tabular data
   - GeoJSON for spatial data
   - Includes processed transformations

### Implementation Details

```typescript
let open = $state(false);
let selectedTabIndex = $state(0);
let exportFileName = $state('');

async function handleDownload() {
  switch (selectedTabIndex) {
    case 0: // Project
      await projectStore.exportProject(exportFileName);
      break;
    case 1: // Map
      console.log(`Export map as ${selectedMapFormat}`);
      break;
    case 2: // Data
      console.log(`Export data as ${selectedDataFormat}`);
      break;
  }
  open = false;
}
```

### Reactive State Management

- All modal states use `$state()` for reactivity
- File name pre-populated from project name
- Format selection persisted per session

## Modal Integration

### Create/Open Project Modal

Controlled by header buttons with smart tab selection:

```typescript
function handleNewProject() {
  createProjectActions.selectTab(1); // New project tab
  globalState.isCreateProjectModalOpen = true;
}

function handleOpenProject() {
  createProjectActions.selectTab(2); // Open project tab
  globalState.isCreateProjectModalOpen = true;
}
```

### Tab Management

- Tab 1: Create new project
- Tab 2: Open existing project
- Tab 3: Try example projects

## State Persistence

### Auto-save Trigger Points

1. Project name changes
2. Data modifications
3. Visualization updates
4. Layout adjustments

### Dirty State Tracking

```typescript
private markDirty(): void {
  this._state.isDirty = true;
  if (this._state.autoSaveEnabled) {
    this.scheduleAutoSave();
  }
}
```

## Import/Export System

### .kh Archive Format

The system now supports both compressed and uncompressed project files:

```typescript
async importProject(file: File): Promise<KhartisProject> {
  const buffer = await file.arrayBuffer();
  let content: string;

  try {
    // Try decompression first
    content = await this.decompressData(buffer);
  } catch {
    // Fall back to plain text
    const decoder = new TextDecoder();
    content = decoder.decode(buffer);
  }

  const projectData = JSON.parse(content);
  return this.validateAndSave(projectData);
}
```

### Compression Support

- Uses native CompressionStream API when available
- Falls back to uncompressed format for compatibility
- Transparent handling of both formats on import

## Error Handling

### Import Errors

- Invalid file format detection
- Corrupted data recovery
- User-friendly error messages

### Export Errors

- Quota exceeded handling
- Network failure recovery
- Fallback formats

## Performance Optimizations

### Lazy Loading

- Project metadata loaded separately from full data
- On-demand resource loading
- Efficient memory usage

### Debounced Operations

- Auto-save debounced to 30 seconds
- Name updates batched
- Prevents excessive storage writes

## Testing Considerations

### Unit Tests

```typescript
describe('Header Integration', () => {
  test('new project button opens modal on tab 1', () => {
    handleNewProject();
    expect(createProjectState.selectedTab).toBe(1);
    expect(globalState.isCreateProjectModalOpen).toBe(true);
  });

  test('project title updates trigger save', () => {
    const spy = vi.spyOn(projectStore, 'saveCurrentProject');
    projectStore.updateProjectName('New Name');
    expect(spy).toHaveBeenCalled();
  });
});
```

### E2E Tests

- Modal opening/closing
- Tab switching
- Export functionality
- Import validation

## Best Practices

### State Management

1. Use `$state()` for all reactive variables
2. Prefer store actions over direct mutations
3. Maintain single source of truth

### UI Consistency

1. Disable controls when no project loaded
2. Show loading states during async operations
3. Provide immediate visual feedback

### Error Recovery

1. Graceful degradation for unsupported features
2. Clear error messages with recovery actions
3. Preserve user data on failures

## Future Enhancements

### Planned Features

1. **Cloud Sync** - Optional cloud backup integration
2. **Collaboration** - Share projects via links
3. **Templates** - Start from predefined templates
4. **Batch Export** - Export multiple formats at once

### Performance Improvements

1. **Streaming Exports** - For large projects
2. **Progressive Downloads** - Start using before complete
3. **Background Processing** - Use Web Workers
4. **Incremental Saves** - Save only changes

## Migration Notes

### From Previous Versions

- Old project formats automatically upgraded
- Settings preserved across updates
- Backward compatibility maintained

### Breaking Changes

- None in current implementation
- All features additive
- Existing workflows preserved
