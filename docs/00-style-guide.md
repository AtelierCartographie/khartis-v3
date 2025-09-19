# 00 — Style Guide

## Overview

This guide defines the coding standards and conventions for the Khartis v3 project. It ensures consistency, maintainability, and clarity across the codebase.

## Core Principles

### 1. Simplicity First
- Write clear, straightforward code
- Avoid over-engineering solutions
- Focus on solving real problems, not hypothetical ones

### 2. No Comments Policy
- **NEVER add comments** unless explicitly requested
- Code should be self-documenting through clear naming
- Use descriptive variable and function names instead

### 3. Visual Code Organization
- Use blank lines to segment logical blocks
- Group related code together
- Create visual hierarchy through spacing
- Don't compress everything together

## Language Conventions

### Default Language
- **Code & Documentation**: English
- **Variables & Functions**: English, descriptive names
- **User-facing text**: Use Paraglide i18n system
- **Error messages**: English in code, translated for UI

## Naming Conventions

### Files and Directories
```
kebab-case for all files and directories
✅ user-profile.svelte
✅ data-utils.ts
✅ create-project/
❌ UserProfile.svelte
❌ dataUtils.ts
```

### Components
```svelte
<!-- PascalCase for component files and imports -->
<script lang="ts">
  import UserProfile from './user-profile.svelte';
  import DataTable from './data-table.svelte';
</script>
```

### Variables and Functions
```typescript
// camelCase for variables and functions
const userData = {};
const isLoading = true;
let currentProject = null;

function calculateTotal() {}
function validateInput() {}
```

### Constants
```typescript
// UPPER_SNAKE_CASE for constants
const MAX_FILE_SIZE = 10485760;
const DEFAULT_TIMEOUT = 5000;
const API_ENDPOINTS = {};
```

### Types and Interfaces
```typescript
// PascalCase for types and interfaces
interface UserData {}
type ProjectState = {};
enum FileStatus {}
```

### Stores (Svelte 5)
```typescript
// kebab-case with .store.svelte.ts suffix
// File: project.store.svelte.ts
export class ProjectStore {
  private _state = $state({});
}

export const projectStore = new ProjectStore();
```

### CSS
```css
/* kebab-case for classes and CSS variables */
.project-header {}
.data-table-row {}

:root {
  --color-primary: #000;
  --spacing-medium: 1rem;
}
```

## TypeScript Guidelines

### Type Safety
```typescript
// ✅ Always use proper types
function processData(data: DataRow[]): ProcessedData {}

// ❌ Never use any
function processData(data: any): any {}
```

### Enums Over Magic Strings
```typescript
// ✅ Use enums for fixed sets
enum FileStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETE = 'complete',
  ERROR = 'error'
}

// ❌ Avoid magic strings
if (status === 'complete') {}
```

### Type Inference
```typescript
// ✅ Let TypeScript infer when obvious
const count = 0; // number
const items = []; // array

// ✅ Explicitly type when not obvious
const items: DataItem[] = [];
const config: Partial<Config> = {};
```

## Svelte 5 Runes Patterns

### State Management
```typescript
// Use $state for reactive values
let count = $state(0);
let userData = $state<User | null>(null);

// Use $derived for computed values
const isValid = $derived(() => count > 0 && userData !== null);
```

### Store Pattern
```typescript
export class ToolStore {
  private _state = $state({
    property: initialValue
  });

  // Getters for derived values
  get computedValue() {
    return $derived(() => this._state.property * 2);
  }

  // Actions to modify state
  updateProperty(value: Type) {
    this._state.property = value;
  }
}

export const toolStore = new ToolStore();
```

### Effects
```typescript
// Use $effect for side effects
$effect(() => {
  if (someCondition) {
    performSideEffect();
  }
});
```

## Component Structure

### Standard Component Template
```svelte
<script lang="ts">
  // 1. Imports
  import { Component } from 'carbon-components-svelte';
  import { store } from './store.svelte';
  import type { Props } from './types';

  // 2. Props interface
  interface Props {
    title: string;
    onClose?: () => void;
  }

  // 3. Props destructuring
  const { title, onClose }: Props = $props();

  // 4. Local state
  let localState = $state(0);

  // 5. Derived values
  const computed = $derived(() => localState * 2);

  // 6. Effects
  $effect(() => {
    // Side effects
  });

  // 7. Functions
  function handleClick() {
    // Logic
  }
</script>

<!-- 8. Template -->
<div class="component-wrapper">
  <!-- Content -->
</div>

<!-- 9. Styles -->
<style>
  .component-wrapper {
    /* Styles */
  }
</style>
```

## Code Organization

### Spacing and Readability
```typescript
// ✅ Good - Clear visual separation
function processData(input: DataInput): ProcessedData {
  // Validate input
  if (!input || !input.data) {
    throw new Error('Invalid input');
  }

  // Transform data
  const transformed = input.data.map(item => ({
    id: item.id,
    value: item.value * 2
  }));

  // Apply filters
  const filtered = transformed.filter(item => item.value > 0);

  return {
    data: filtered,
    count: filtered.length
  };
}

// ❌ Bad - Everything compressed
function processData(input:DataInput):ProcessedData{
if(!input||!input.data){throw new Error('Invalid input');}
const transformed=input.data.map(item=>({id:item.id,value:item.value*2}));
const filtered=transformed.filter(item=>item.value>0);
return{data:filtered,count:filtered.length};}
```

### Import Organization
```typescript
// 1. Node/npm packages
import { writable } from 'svelte/store';
import type { RequestHandler } from '@sveltejs/kit';

// 2. Project imports (absolute paths)
import { projectStore } from '$lib/stores';
import type { User } from '$lib/types';

// 3. Relative imports
import { helper } from './utils';
import Component from './component.svelte';
```

## Error Handling

### Consistent Error Patterns
```typescript
// Use try-catch with proper error messages
try {
  await performOperation();
} catch (error) {
  console.error('Failed to perform operation:', error);
  const message = error instanceof Error ? error.message : 'Unknown error';
  showError('Operation failed', message);
}
```

### No Console.log in Production
```typescript
// ❌ Never use console.log in production
console.log('data', data);

// ✅ Use console.error/warn for actual errors
console.error('Critical error:', error);
console.warn('Deprecated function used');
```

## Carbon Components Integration

### Using Carbon Components
```svelte
<script lang="ts">
  import { Button, TextInput, Modal } from 'carbon-components-svelte';

  // Always use bind:value for form inputs
  let inputValue = $state('');
</script>

<TextInput
  bind:value={inputValue}
  placeholder="Enter value"
  invalid={!isValid}
  invalidText="Value is required"
/>

<Button
  kind="primary"
  disabled={!canSubmit}
  on:click={handleSubmit}
>
  Submit
</Button>
```

## File Structure Patterns

### Feature-First Organization
```
src/lib/features/
├── feature-name/
│   ├── components/        # Feature-specific components
│   │   └── sub-component.svelte
│   ├── utils/            # Feature utilities
│   │   └── helper.ts
│   ├── types/            # Feature types
│   │   └── types.ts
│   ├── feature.store.svelte.ts  # Feature store
│   └── feature.svelte    # Main feature component
```

### Shared Resources
```
src/lib/features/commons/
├── components/   # Shared UI components
├── utils/       # Shared utilities
├── services/    # Shared services
├── stores/      # Global stores
└── types/       # Global types
```

## Testing Conventions

### Test File Naming
```
component.svelte → component.test.ts
utils.ts → utils.test.ts
store.svelte.ts → store.test.ts
```

### Test Structure
```typescript
describe('ComponentName', () => {
  it('should handle basic functionality', () => {
    // Test implementation
  });

  it('should handle edge cases', () => {
    // Test implementation
  });
});
```

## Performance Guidelines

### Reactive Optimization
```typescript
// ✅ Use $derived for expensive computations
const expensive = $derived(() => {
  return heavyComputation(data);
});

// ❌ Don't recalculate in template
{#each items as item}
  {heavyComputation(item)}
{/each}
```

### Component Lifecycle
```typescript
// Clean up resources
$effect(() => {
  const interval = setInterval(update, 1000);

  return () => {
    clearInterval(interval);
  };
});
```

## Security Considerations

### Client-Side Context
Since Khartis runs entirely client-side:

```typescript
// ✅ Focus on practical protections
sanitizeFileName(userInput);  // Prevent OS issues
sanitizeNumericInput(value);  // Prevent NaN crashes

// ❌ Don't over-engineer for server attacks
// No need for XSS protection - users affect only themselves
// No need for SQL injection protection - DuckDB runs locally
```

## Accessibility

### Semantic HTML
```svelte
<!-- ✅ Use semantic elements -->
<button on:click={handleClick}>Click me</button>
<nav>Navigation</nav>
<main>Content</main>

<!-- ❌ Avoid div soup -->
<div on:click={handleClick}>Click me</div>
```

### ARIA When Needed
```svelte
<button
  aria-label="Close dialog"
  aria-pressed={isPressed}
>
  <Icon />
</button>
```

## Git Commit Messages

### Format
```
type: brief description

- Detail 1
- Detail 2

🤖 Generated with Claude Code

Co-Authored-By: Claude <noreply@anthropic.com>
```

### Types
- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code refactoring
- `docs`: Documentation
- `test`: Tests
- `chore`: Maintenance

## Common Patterns

### Modal Management
```typescript
// Global state for modals
let isModalOpen = $state(false);

// Open/close functions
function openModal() {
  isModalOpen = true;
}

function closeModal() {
  isModalOpen = false;
}
```

### File Upload Pattern
```typescript
interface UploadedFile {
  id: string;
  name: string;
  status: 'pending' | 'processing' | 'complete' | 'error';
  data?: ProcessedData;
  error?: string;
}
```

### Data Pipeline Pattern
```typescript
// 1. Import → 2. Validate → 3. Type → 4. Clean → 5. Process
const pipeline = {
  import: (file: File) => RawData,
  validate: (data: RawData) => ValidData,
  type: (data: ValidData) => TypedData,
  clean: (data: TypedData) => CleanData,
  process: (data: CleanData) => FinalData
};
```

## Code Review Checklist

Before submitting code:

- [ ] No comments unless requested
- [ ] No console.log statements
- [ ] Proper TypeScript types (no `any`)
- [ ] Enums instead of magic strings
- [ ] Clear visual spacing
- [ ] Consistent naming conventions
- [ ] Error handling in place
- [ ] Carbon components properly integrated
- [ ] Tests for new functionality
- [ ] Accessibility considered

## Summary

This style guide ensures:
- **Consistency** across the codebase
- **Readability** through clear conventions
- **Maintainability** with standard patterns
- **Quality** through TypeScript and testing
- **Simplicity** by avoiding over-engineering

Remember: Write code that solves real problems, not hypothetical ones.