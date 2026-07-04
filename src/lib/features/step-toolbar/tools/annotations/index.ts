export {
  annotationsActions,
  getAnnotationsState
} from './annotations.store.svelte';
export { getKnownPageElementDefaultContents } from './annotations-placeholders.utils';
export type {
  AnnotationsState,
  PageElementRole,
  AnnotationCoordinateSpace,
  AnnotationCreationMode,
  Annotation,
  AnnotationDataAnchor,
  AnnotationStyle,
  AnnotationPlacementPreview
} from '../../types/annotations.types';
export { resolveAnnotationCoordinateSpace } from '../../types/annotations.types';
