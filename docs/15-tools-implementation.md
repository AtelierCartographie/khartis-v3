# Tools Implementation Guide

## Overview

Tools in Khartis v3 are modular components that extend the map creation capabilities. Each tool follows a consistent architecture pattern for maintainability and scalability.

## Tool Architecture

### Standard Structure

```
tools/[tool-name]/
├── [tool-name].svelte           # Main component
├── [tool-name].store.svelte.ts  # State management
└── [sub-components].svelte      # Optional sub-components
```

## Implemented Tools

### Search Tool

**Location**: `step-toolbar/tools/search/`

- Entity and value search across datasets
- Real-time filtering
- Highlight results on map

### Layers Tool

**Location**: `step-toolbar/tools/layers/`

- Layer hierarchy management
- Visibility toggles
- Opacity controls
- Reordering support

### Facets Tool

**Location**: `step-toolbar/tools/facets/`

- Small multiples generation
- Variable comparison
- Grid layout configuration

### Projections Tool

**Location**: `step-toolbar/tools/projections/`

- Projection catalog with previews
- Custom CRS support (WKT/PROJ.4)
- Automatic suggestions based on data extent

### Simplification Tool

**Location**: `step-toolbar/tools/simplification/`

- Geometry generalization levels
- Real-time preview
- File size optimization

### Color Blindness Tool

**Location**: `step-toolbar/tools/color-blindness/`

- Simulation filters (protanopia, deuteranopia, tritanopia)
- Real-time preview
- Accessibility validation

### Format Tool

**Location**: `step-toolbar/tools/format/`

Components:

- **format-mode-tabs.svelte**: Mode selection
- **model-select.svelte**: Predefined formats
- **custom-size.svelte**: Custom dimensions
- **margins-editor.svelte**: Margin configuration
- **grid-toggle.svelte**: Grid overlay
- **color-selector.svelte**: Background colors

State Management:

- Page dimensions (width, height)
- Margins (top, right, bottom, left)
- Grid settings
- Background color

### Legend Tool

**Location**: `step-toolbar/tools/legend/`

- Auto-generation from visualization
- Position and size controls
- Style customization
- Interactive editing

### Annotations Tool

**Location**: `step-toolbar/tools/annotations/`

Sub-tools:

- **text-tool.svelte**: Text annotations
- **shape-tool.svelte**: Geometric shapes
- **drawing-tool.svelte**: Freehand drawing
- **image-tool.svelte**: Image placement

Features:

- Layer management
- Style controls
- Transform operations

### Geo Indications Tool

**Location**: `step-toolbar/tools/geo-indications/`

- Scale bar generation
- North arrow placement
- Inset map configuration
- Coordinate display

## Store Pattern

Each tool store follows this pattern:

```typescript
export class ToolNameStore {
  private _state = $state({
    enabled: false,
    settings: {},
    data: null
  });

  get isEnabled() {
    return this._state.enabled;
  }

  get computedValue() {
    return $derived(() => {
      return this._state.data?.process();
    });
  }

  enable() {
    this._state.enabled = true;
  }

  disable() {
    this._state.enabled = false;
  }

  updateSettings(settings: Partial<Settings>) {
    this._state.settings = { ...this._state.settings, ...settings };
  }
}

export const toolNameStore = new ToolNameStore();
```

## Integration with Main Application

### Registration

Tools are registered in the step toolbar navigation system.

### State Synchronization

- Tools subscribe to global state changes
- Updates trigger re-renders via Svelte reactivity
- State persists in project store

### Event Handling

- User interactions dispatch actions
- Tools emit custom events for cross-component communication
- Notification system provides feedback

## Creating a New Tool

### Step 1: Create Directory Structure

```bash
mkdir src/lib/features/step-toolbar/tools/new-tool
```

### Step 2: Implement Store

```typescript
// new-tool.store.svelte.ts
export class NewToolStore {
  private _state = $state({
    // Initial state
  });

  // Getters and actions
}

export const newToolStore = new NewToolStore();
```

### Step 3: Create Component

```svelte
<!-- new-tool.svelte -->
<script lang="ts">
  import { newToolStore } from './new-tool.store.svelte.ts';
  // Component logic
</script>

<!-- UI Template -->
```

### Step 4: Register Tool

Add to toolbar navigation and routing system.

### Step 5: Add Types

Define interfaces in `commons/types/` if needed.

## Testing Tools

### Unit Tests

- Test store logic independently
- Verify computed values
- Check action effects

### Component Tests

- Test UI interactions
- Verify event emissions
- Check accessibility

### Integration Tests

- Test tool within application context
- Verify state persistence
- Check cross-tool interactions

## Performance Guidelines

### Optimization Strategies

- Lazy load heavy dependencies
- Debounce user inputs
- Use virtual scrolling for long lists
- Implement progressive rendering

### Memory Management

- Clean up subscriptions in `$effect` cleanup
- Clear large datasets when tool disabled
- Use weak references where appropriate

## Accessibility

### Requirements

- Keyboard navigation support
- ARIA labels and roles
- Focus management
- Screen reader compatibility

### Implementation

- Use Carbon components (accessible by default)
- Add custom keyboard shortcuts
- Provide text alternatives
- Test with screen readers

## Common Patterns

### Modal Dialogs

Use Carbon Modal component with proper focus trapping.

### Form Validation

Implement real-time validation with clear error messages.

### Progress Indication

Show loading states for async operations.

### Error Handling

Graceful degradation with user-friendly messages via notification system.
