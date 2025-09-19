# Project Persistence System

> **Note**: For import/export functionality, see [Import/Export System](10-file-import-system.md)

## Overview

The project persistence system provides comprehensive storage and retrieval of Khartis projects using IndexedDB for local storage and a custom .kh archive format for export/import.

## Architecture

### Storage Layers

```
┌─────────────────────────────────────┐
│         User Interface              │
├─────────────────────────────────────┤
│        Project Store                │
│    (State Management Layer)         │
├─────────────────────────────────────┤
│    Project Persistence Utils        │
│      (Abstraction Layer)            │
├─────────────────────────────────────┤
│         IndexedDB API               │
│      (Browser Storage)              │
└─────────────────────────────────────┘
```

## Project Store

### State Structure

```typescript
interface ProjectState {
  currentProject?: KhartisProject;
  isDirty: boolean;
  lastSaved?: Date;
  autoSaveEnabled: boolean;
  autoSaveInterval: number;
  history: ProjectHistoryEntry[];
  historyIndex: number;
  maxHistorySize: number;
  isInitialized: boolean;
  isLoading: boolean;
}
```

### Key Features

- **Auto-save**: Automatic saving every 30 seconds when changes detected
- **Undo/Redo**: History management with 50-entry limit
- **Dirty State Tracking**: Monitors unsaved changes
- **Async Initialization**: Loads last project on startup

### Store Implementation

```typescript
class ProjectStore {
  private _state = $state<ProjectState>({
    currentProject: undefined,
    isDirty: false,
    autoSaveEnabled: true,
    autoSaveInterval: 30000,
    history: [],
    historyIndex: -1,
    maxHistorySize: 50,
    isInitialized: false,
    isLoading: false
  });

  private autoSaveTimer?: number;
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

## Project Data Model

### KhartisProject Structure

```typescript
interface KhartisProject {
  id: string; // UUID
  manifest: ProjectManifest; // Metadata
  data: ProjectData; // Source data
  visualization?: VisualizationConfig; // Map settings
  layout?: LayoutConfig; // Page layout
  resources?: Record<string, any>; // Additional resources
}
```

### Project Manifest

```typescript
interface ProjectManifest {
  version: string; // Khartis version
  createdAt: Date;
  updatedAt: Date;
  name: string;
  author?: string;
  description?: string;
  format: 'kh' | 'khartis';
}
```

## IndexedDB Storage

### Database Schema

```typescript
const DB_NAME = 'KhartisProjects';
const DB_VERSION = 1;
const STORE_NAME = 'projects';

interface ProjectDBSchema {
  projects: {
    key: string;
    value: KhartisProject;
    indexes: {
      'by-name': string;
      'by-date': Date;
    };
  };
}
```

### Storage Operations

#### Save Project

```typescript
async saveProject(project: KhartisProject): Promise<void> {
  const db = await this.openDatabase();
  const transaction = db.transaction(STORE_NAME, 'readwrite');
  const store = transaction.objectStore(STORE_NAME);

  await store.put(project, project.id);
  await transaction.complete;

  // Update metadata in localStorage for quick access
  this.updateProjectMetadata(project);
}
```

#### Load Project

```typescript
async loadProject(id: string): Promise<KhartisProject | null> {
  const db = await this.openDatabase();
  const transaction = db.transaction(STORE_NAME, 'readonly');
  const store = transaction.objectStore(STORE_NAME);

  return await store.get(id);
}
```

#### List Projects

```typescript
async listProjects(): Promise<SavedProjectMetadata[]> {
  const metadata = this.loadFromLocalStorage<SavedProjectMetadata[]>(
    ProjectStorageKey.METADATA
  ) || [];

  // Verify projects still exist in IndexedDB
  const validProjects = [];
  for (const meta of metadata) {
    if (await this.projectExists(meta.id)) {
      validProjects.push(meta);
    }
  }

  return validProjects.sort((a, b) =>
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}
```

## Auto-Save Mechanism

### Dirty State Management

```typescript
private markDirty(): void {
  this._state.isDirty = true;
  if (this._state.autoSaveEnabled) {
    this.scheduleAutoSave();
  }
}

private scheduleAutoSave(): void {
  if (this.autoSaveTimer) {
    clearTimeout(this.autoSaveTimer);
  }

  if (this._state.autoSaveEnabled && this._state.isDirty) {
    this.autoSaveTimer = window.setTimeout(() => {
      this.saveCurrentProject();
    }, this._state.autoSaveInterval);
  }
}
```

### Save Triggers

- Project name changes
- Data updates
- Visualization configuration changes
- Layout modifications

## History Management

### Undo/Redo Implementation

```typescript
private addToHistory(action: string, snapshot?: KhartisProject): void {
  // Truncate future history if we're not at the end
  if (this._state.historyIndex < this._state.history.length - 1) {
    this._state.history = this._state.history.slice(
      0,
      this._state.historyIndex + 1
    );
  }

  const entry: ProjectHistoryEntry = {
    timestamp: new Date(),
    action,
    snapshot: snapshot || this._state.currentProject
  };

  this._state.history.push(entry);
  this._state.historyIndex++;

  // Limit history size
  if (this._state.history.length > this._state.maxHistorySize) {
    this._state.history.shift();
    this._state.historyIndex--;
  }
}

undo(): void {
  if (!this.canUndo) return;

  this._state.historyIndex--;
  const entry = this._state.history[this._state.historyIndex];

  if (entry.snapshot) {
    this._state.currentProject = { ...entry.snapshot };
    this.markDirty();
  }
}
```

## .kh Archive Format

### Archive Structure

```
project.kh (ZIP archive)
├── manifest.json       # Project metadata
├── data/
│   ├── source/        # Original data files
│   └── processed/     # Processed data
├── visualization.json  # Map configuration
├── layout.json        # Page layout
└── resources/         # Images, fonts, etc.
```

### Export Implementation

```typescript
async createProjectArchive(project: KhartisProject): Promise<Blob> {
  const files: Record<string, any> = {
    'manifest.json': project.manifest,
    'visualization.json': project.visualization || {},
    'layout.json': project.layout || {}
  };

  // Add data files
  if (project.data.sourceFiles) {
    for (const file of project.data.sourceFiles) {
      files[`data/source/${file.name}`] = file.content;
    }
  }

  // Create ZIP archive
  if (typeof CompressionStream !== 'undefined') {
    return await this.createCompressedArchive(files);
  } else {
    return await this.createUncompressedArchive(files);
  }
}
```

### Import Process

```typescript
async importProject(file: File): Promise<KhartisProject> {
  const content = await this.extractArchive(file);

  // Validate archive structure
  if (!content['manifest.json']) {
    throw new Error('Invalid project file: missing manifest');
  }

  const manifest = JSON.parse(content['manifest.json']);

  // Reconstruct project
  const project: KhartisProject = {
    id: crypto.randomUUID(),
    manifest: {
      ...manifest,
      updatedAt: new Date()
    },
    data: await this.reconstructData(content),
    visualization: content['visualization.json'],
    layout: content['layout.json']
  };

  // Save to IndexedDB
  await this.saveProject(project);

  return project;
}
```

## LocalStorage Integration

### Metadata Storage

```typescript
enum ProjectStorageKey {
  CURRENT = 'khartis_current_project', // Current project ID
  METADATA = 'khartis_projects_metadata', // Project list
  AUTOSAVE = 'khartis_autosave', // Auto-save settings
  PREFERENCES = 'khartis_preferences' // User preferences
}
```

### Quick Access

```typescript
saveToLocalStorage<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (error) {
    console.error('LocalStorage save failed:', error);
  }
}

loadFromLocalStorage<T>(key: string): T | null {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : null;
  } catch {
    return null;
  }
}
```

## Project Lifecycle

### Create New Project

```typescript
async createProject(name: string, files: UploadedFile[]): Promise<void> {
  const project: KhartisProject = {
    id: crypto.randomUUID(),
    manifest: {
      version: '3.0.0',
      createdAt: new Date(),
      updatedAt: new Date(),
      name,
      format: 'kh'
    },
    data: {
      sourceFiles: files
    }
  };

  this._state.currentProject = project;
  this._state.isDirty = false;
  this._state.lastSaved = new Date();

  this.addToHistory('Project created', project);
  await this.saveCurrentProject();

  projectPersistence.saveToLocalStorage(
    ProjectStorageKey.CURRENT,
    project.id
  );
}
```

### Load Existing Project

```typescript
async loadProject(id: string): Promise<void> {
  const project = await projectPersistence.loadProject(id);

  if (project) {
    this._state.currentProject = project;
    this._state.isDirty = false;
    this._state.lastSaved = new Date();
    this._state.history = [];
    this._state.historyIndex = -1;

    projectPersistence.saveToLocalStorage(
      ProjectStorageKey.CURRENT,
      project.id
    );
  }
}
```

### Delete Project

```typescript
async deleteProject(id: string): Promise<void> {
  await projectPersistence.deleteProject(id);

  if (this._state.currentProject?.id === id) {
    this._state.currentProject = undefined;
    projectPersistence.clearLocalStorage(ProjectStorageKey.CURRENT);
  }
}
```

## Error Handling

### Storage Errors

```typescript
async saveProject(project: KhartisProject): Promise<void> {
  try {
    await this.saveToIndexedDB(project);
  } catch (error) {
    if (error.name === 'QuotaExceededError') {
      // Clean old projects
      await this.cleanOldProjects();
      // Retry
      await this.saveToIndexedDB(project);
    } else {
      throw error;
    }
  }
}
```

### Recovery Strategies

1. **Quota Exceeded**: Clean old projects automatically
2. **Corrupted Data**: Fall back to localStorage metadata
3. **Missing Files**: Mark as missing, allow re-upload
4. **Version Mismatch**: Provide migration path

## Performance Optimizations

### Lazy Loading

```typescript
// Load only metadata initially
async loadProjectMetadata(id: string): Promise<ProjectManifest> {
  const metadata = this.getMetadataFromLocalStorage(id);
  if (metadata) return metadata;

  // Fall back to IndexedDB if needed
  const project = await this.loadProject(id);
  return project?.manifest;
}
```

### Compression

```typescript
async compressData(data: any): Promise<ArrayBuffer> {
  const json = JSON.stringify(data);
  const encoder = new TextEncoder();
  const input = encoder.encode(json);

  const stream = new CompressionStream('gzip');
  const writer = stream.writable.getWriter();
  writer.write(input);
  writer.close();

  const chunks = [];
  const reader = stream.readable.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  return new Blob(chunks).arrayBuffer();
}
```

## Testing

### Unit Tests

```typescript
describe('Project Persistence', () => {
  test('saves project to IndexedDB', async () => {
    const project = createMockProject();
    await projectPersistence.saveProject(project);

    const loaded = await projectPersistence.loadProject(project.id);
    expect(loaded).toEqual(project);
  });

  test('handles auto-save', async () => {
    projectStore.setAutoSave(true, 100);
    projectStore.updateProjectName('Test');

    await wait(150);
    expect(projectStore.isDirty).toBe(false);
  });
});
```

### E2E Tests

```typescript
test('persists project across page reload', async ({ page }) => {
  // Create project
  await createTestProject(page, 'Test Project');

  // Reload page
  await page.reload();

  // Check project is still loaded
  const projectTitle = page.locator('#khartis-project-title input');
  await expect(projectTitle).toHaveValue('Test Project');
});
```

## Security Considerations

### Data Privacy

- All data stored locally in browser
- No server transmission
- User-controlled export/import

### Data Integrity

```typescript
// Validate project structure on load
function validateProject(project: any): boolean {
  return (
    project?.id &&
    project?.manifest?.version &&
    project?.data &&
    typeof project.manifest.name === 'string'
  );
}
```

## Future Enhancements

### Planned Features

1. **Cloud Sync** - Optional cloud backup
2. **Collaboration** - Share projects via links
3. **Version Control** - Git-like branching
4. **Incremental Save** - Save only changes
5. **Project Templates** - Start from templates

### Storage Improvements

1. **Compression** - Better compression algorithms
2. **Streaming** - Stream large projects
3. **Caching** - Smart caching strategies
4. **Migration** - Automated version migration
