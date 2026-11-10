export {
  projectionActions,
  getProjectionState
} from './projection.store.svelte';
export type { ProjectionState } from '../../types/projections.types';
export { buildProjectionRenderKey } from './projection-render-key';
export {
  buildMapGeoreference,
  describeMapGeoreferenceAvailability,
  formatGeoreferenceReadme,
  getMapGeoreferenceAvailability,
  resolveMapVectorCrs,
  type MapVectorCrs,
  type MapSeam,
  type MapGeoreference,
  type MapGeoreferenceAvailability
} from './projection-georeference.utils';
