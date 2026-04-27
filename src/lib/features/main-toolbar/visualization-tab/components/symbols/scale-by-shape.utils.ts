import {
  isLinearShape,
  type ShapeType
} from '$lib/features/main-toolbar/constants';
import { ScaleType } from '$lib/features/commons/store/visualization.store.svelte';

export function getDefaultScaleForShape(shape: ShapeType): ScaleType {
  return isLinearShape(shape) ? ScaleType.LINEAR : ScaleType.SQRT;
}
