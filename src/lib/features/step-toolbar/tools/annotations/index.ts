export {
  annotationsActions,
  getAnnotationsState
} from './annotations.store.svelte';
export { isPageElementPlaceholder } from './annotations-placeholders.utils';
export { stackBottomRightPageElements } from './annotations-page-layout.utils';
export type {
  PageElementRole,
  Annotation,
  AnnotationDataAnchor,
  AnnotationStyle,
  AnnotationPlacementPreview
} from '../../types/annotations.types';
export { resolveAnnotationCoordinateSpace } from '../../types/annotations.types';
