export {
  annotationsActions,
  getAnnotationsState
} from './annotations.store.svelte';
export type {
  AnnotationsState,
  PageElementRole,
  AnnotationCoordinateSpace,
  AnnotationCreationMode,
  Annotation,
  AnnotationStyle,
  AnnotationPlacementPreview
} from './annotations.types';
export { resolveAnnotationCoordinateSpace } from './annotations.types';
