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
} from '../../types/annotations.types';
export { resolveAnnotationCoordinateSpace } from '../../types/annotations.types';
