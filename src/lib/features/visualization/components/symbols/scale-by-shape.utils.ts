import {
  isLinearShape,
  type ShapeType
} from '$lib/features/commons/constants/visualization.constants';
import { ScaleType } from '$lib/features/commons/stores/visualization.store.svelte';

export function getDefaultScaleForShape(shape: ShapeType): ScaleType {
  return isLinearShape(shape) ? ScaleType.LINEAR : ScaleType.SQRT;
}
