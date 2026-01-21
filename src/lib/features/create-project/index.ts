// =============================================================================
// Components
// =============================================================================
export { default as CreateProject } from './create-project.svelte';
export { default as CreateNewProject } from './create-new-project.svelte';
export { default as OpenProject } from './open-project.svelte';
export { default as TryWithExample } from './try-with-example.svelte';
export { default as ProjectTab } from './project-tab.svelte';
export { default as ProjectName } from './project-name.svelte';

// =============================================================================
// Services
// =============================================================================
export {
  FileProcessorService,
  type ProcessingCallbacks
} from './services/file-processor.service';

export {
  CreateProjectValidationService,
  type MultiFileValidationResult,
  type ValidationResult
} from './services/validation.service';

// =============================================================================
// Hooks
// =============================================================================
export {
  useProjectNavigation,
  type UseProjectNavigationProps,
  type UseProjectNavigationReturn
} from './hooks';
