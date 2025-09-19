# State Synchronization System

## Overview

The state synchronization system ensures consistent state management across the application, coordinating between UI components, stores, and persistent storage using Svelte 5's reactive primitives.

## Architecture

### State Flow Diagram

```
┌──────────────────┐     ┌─────────────────┐     ┌──────────────────┐
│   UI Components  │────▶│  Global State   │────▶│    IndexedDB     │
│    (Svelte)      │◀────│    (Stores)     │◀────│  (Persistence)   │
└──────────────────┘     └─────────────────┘     └──────────────────┘
         ▲                        │                         │
         │                        ▼                         │
         │               ┌─────────────────┐               │
         └───────────────│  LocalStorage   │◀──────────────┘
                         │   (Metadata)     │
                         └─────────────────┘
```

## Svelte 5 Runes System

### State Management with $state

```typescript
// Store definition with reactive state
class ProjectStore {
  private _state = $state<ProjectState>({
    currentProject: undefined,
    isDirty: false,
    isInitialized: false,
    isLoading: false
  });

  // Reactive getters
  get currentProject() {
    return this._state.currentProject;
  }

  get isLoading() {
    return this._state.isLoading;
  }
}
```

### Derived State with $derived

```typescript
// In components
const shouldShowModal = $derived(
  !isLoading && globalState.isCreateProjectModalOpen
);

const pageTransformStyle = $derived(
  globalState.zoom.mode === ZoomMode.Page
    ? `transform: scale(${globalState.zoom.pageZoomLevel / 100})`
    : ''
);
```

## Modal State Synchronization

### Problem

The create project modal needs to coordinate between multiple states:

1. Global application state
2. Component local state
3. Persistent storage state

### Solution

```typescript
// +layout.svelte - Application root
let isLoading = $state(true);

onMount(async () => {
  // Wait for project store to initialize from IndexedDB
  await projectStore.waitForInit();
  isLoading = false;

  // Show modal only if no project exists
  if (!projectStore.currentProject) {
    globalState.isCreateProjectModalOpen = true;
  }
});

// Modal component binding
<CreateProject
  open={!isLoading && globalState.isCreateProjectModalOpen}
  onClose={handleCloseModal}
/>
```

### Key Principles

1. **Single Source of Truth**: `globalState.isCreateProjectModalOpen` controls modal
2. **Async Initialization**: Wait for IndexedDB before showing UI
3. **Loading State**: Prevent modal flicker during initialization

## Store Initialization Pattern

### Async Store Loading

```typescript
class ProjectStore {
  private initPromise?: Promise<void>;

  constructor() {
    if (typeof window !== 'undefined') {
      this.initPromise = this.initialize();
    }
  }

  private async initialize(): Promise<void> {
    this._state.isLoading = true;
    try {
      await this.loadLastProject();
    } finally {
      this._state.isLoading = false;
      this._state.isInitialized = true;
    }
  }

  async waitForInit(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
    }
  }
}
```

### Benefits

- No race conditions
- Clean loading states
- Predictable initialization order

## Global State Management

### Global Store Structure

```typescript
export const globalState = $state<GlobalState>({
  settingPanel: false,
  mainPanel: true,
  isSideNavOpen: false,
  isCreateProjectModalOpen: false,
  isAddDataModalOpen: false,
  selectedStep: ToolbarStep.Data,
  selectedTool: undefined,
  toolbarState: ToolbarState.Full,
  zoom: {
    mode: ZoomMode.Map,
    mapZoomLevel: 1,
    pageZoomLevel: 100
  }
});
```

### Action Pattern

```typescript
export const globalActions = {
  setNavigationState(selectedStep: ToolbarStep): void {
    globalState.selectedStep = selectedStep;

    // Side effects based on state changes
    if (selectedStep === ToolbarStep.Styling) {
      globalState.toolbarState = ToolbarState.Collapsed;
    }
  },

  setZoomMode(mode: ZoomMode): void {
    globalState.zoom.mode = mode;
  }
};
```

## Component-Store Synchronization

### Pattern 1: Direct Binding

```svelte
<script>
  import { globalState } from '$lib/features/commons/store/global.svelte';
</script>

<!-- Direct reactive binding -->
<Modal open={globalState.isCreateProjectModalOpen}>
  <!-- content -->
</Modal>
```

### Pattern 2: Props with Effects

```svelte
<script>
  const { open = false, onClose } = $props();

  // No need for effects - props are reactive
  function handleClose() {
    onClose?.();
  }
</script>

<ComposedModal {open}>
  <!-- content -->
</ComposedModal>
```

### Pattern 3: Local State with Store Updates

```svelte
<script>
  let localValue = $state('');

  function handleChange(value: string) {
    localValue = value;
    // Update store when needed
    if (value.length > 3) {
      createProjectActions.setProjectName(value);
    }
  }
</script>
```

## Auto-Save Synchronization

### Dirty State Management

```typescript
class ProjectStore {
  private markDirty(): void {
    this._state.isDirty = true;
    if (this._state.autoSaveEnabled) {
      this.scheduleAutoSave();
    }
  }

  updateProjectName(name: string): void {
    if (!this._state.currentProject) return;

    this._state.currentProject.manifest.name = name;
    this._state.currentProject.manifest.updatedAt = new Date();
    this.markDirty(); // Triggers auto-save

    this.addToHistory('Project name updated');
  }
}
```

### Debounced Saving

```typescript
private scheduleAutoSave(): void {
  // Clear existing timer
  if (this.autoSaveTimer) {
    clearTimeout(this.autoSaveTimer);
  }

  // Schedule new save
  if (this._state.autoSaveEnabled && this._state.isDirty) {
    this.autoSaveTimer = window.setTimeout(() => {
      this.saveCurrentProject();
    }, this._state.autoSaveInterval);
  }
}
```

## Cross-Component Communication

### Event-Based Pattern

```typescript
// Custom events for complex interactions
function dispatchProjectCreated(project: KhartisProject) {
  window.dispatchEvent(
    new CustomEvent('project-created', {
      detail: project
    })
  );
}

// Listen in components
onMount(() => {
  const handler = (e: CustomEvent) => {
    // Handle project creation
  };

  window.addEventListener('project-created', handler);
  return () => window.removeEventListener('project-created', handler);
});
```

### Store-Based Pattern

```typescript
// Centralized state changes
async function handleCreateProject() {
  await projectStore.createProject(name, files);
  globalState.isCreateProjectModalOpen = false;
  createProjectActions.resetAllTabs();
  goto('/');
}
```

## Loading State Management

### Application-Level Loading

```svelte
{#if isLoading}
  <div class="loading-container">
    <div class="loading-spinner"></div>
  </div>
{:else}
  <Header />
  <Main />
  <Footer />
{/if}
```

### Component-Level Loading

```typescript
let isCreating = $state(false);

async function handleCreate() {
  isCreating = true;

  try {
    await projectStore.createProject(name, files);
    // Success handling
  } catch (error) {
    // Error handling
  } finally {
    isCreating = false;
  }
}
```

## Error State Synchronization

### Centralized Error Handling

```typescript
interface ErrorState {
  hasError: boolean;
  message?: string;
  context?: string;
  recoverable: boolean;
}

class ErrorStore {
  private _state = $state<ErrorState>({
    hasError: false,
    recoverable: true
  });

  setError(error: Error, context?: string) {
    this._state = {
      hasError: true,
      message: error.message,
      context,
      recoverable: true
    };
  }

  clearError() {
    this._state.hasError = false;
  }
}
```

### Error Boundaries

```svelte
<script>
  import { ErrorBoundary } from '$lib/components';
  import { errorStore } from '$lib/stores';

  function handleError(error: Error) {
    errorStore.setError(error, 'Component rendering');
  }
</script>

<ErrorBoundary onError={handleError}>
  <ComponentThatMightFail />
</ErrorBoundary>
```

## Performance Optimizations

### Selective Updates

```typescript
// Update only changed properties
function updateProjectData(updates: Partial<ProjectData>) {
  if (!this._state.currentProject) return;

  // Only update provided fields
  Object.assign(this._state.currentProject.data, updates);

  // Mark specific change
  this.markDirty();
  this.addToHistory('Data updated: ' + Object.keys(updates).join(', '));
}
```

### Batched Updates

```typescript
// Batch multiple updates
async function batchUpdate(updates: Array<() => void>) {
  this._state.isBatchUpdating = true;

  for (const update of updates) {
    update();
  }

  this._state.isBatchUpdating = false;

  // Single save after all updates
  if (this._state.isDirty) {
    await this.saveCurrentProject();
  }
}
```

## Testing Synchronization

### Unit Tests

```typescript
describe('State Synchronization', () => {
  test('modal closes when project created', async () => {
    globalState.isCreateProjectModalOpen = true;

    await projectStore.createProject('Test', []);

    expect(globalState.isCreateProjectModalOpen).toBe(false);
  });

  test('auto-save triggers on changes', async () => {
    const saveSpy = vi.spyOn(projectStore, 'saveCurrentProject');
    projectStore.setAutoSave(true, 100);

    projectStore.updateProjectName('New Name');

    await wait(150);
    expect(saveSpy).toHaveBeenCalled();
  });
});
```

### E2E Tests

```typescript
test('state persists across navigation', async ({ page }) => {
  // Set initial state
  await page.evaluate(() => {
    globalState.selectedStep = ToolbarStep.Visualization;
  });

  // Navigate
  await page.click('[href="/settings"]');
  await page.goBack();

  // Check state preserved
  const step = await page.evaluate(() => globalState.selectedStep);
  expect(step).toBe(ToolbarStep.Visualization);
});
```

## Best Practices

### 1. Single Source of Truth

```typescript
// Bad - Multiple sources
let modalOpen = $state(false);
createProjectState.isModalOpen = false;
globalState.isCreateProjectModalOpen = false;

// Good - Single source
globalState.isCreateProjectModalOpen = false;
```

### 2. Avoid Circular Dependencies

```typescript
// Bad - Circular update
$effect(() => {
  if (storeA.value) {
    storeB.setValue(storeA.value);
  }
});

$effect(() => {
  if (storeB.value) {
    storeA.setValue(storeB.value);
  }
});

// Good - Unidirectional flow
$effect(() => {
  storeB.setValue(storeA.value);
});
```

### 3. Explicit State Changes

```typescript
// Bad - Hidden side effects
function updateProject() {
  project.name = 'New Name';
  // Hidden auto-save trigger
}

// Good - Explicit
function updateProject() {
  projectStore.updateProjectName('New Name');
  // Clear that this triggers save
}
```

## Troubleshooting

### Common Issues

1. **Modal Reappears After Refresh**
   - Solution: Check project initialization before showing modal

2. **State Not Updating**
   - Solution: Ensure using reactive ($state) variables

3. **Race Conditions**
   - Solution: Use async/await and loading states

4. **Memory Leaks**
   - Solution: Clean up timers and listeners in onDestroy

## Future Improvements

### Planned Enhancements

1. **State Devtools** - Browser extension for debugging
2. **Time Travel** - Debug state changes over time
3. **State Persistence** - Automatic state recovery
4. **Optimistic Updates** - Immediate UI updates
5. **Conflict Resolution** - Handle concurrent edits

### Performance Goals

1. **Lazy State Loading** - Load only needed state
2. **State Compression** - Compress large state objects
3. **Incremental Updates** - Send only deltas
4. **Worker Processing** - Move heavy ops to workers
