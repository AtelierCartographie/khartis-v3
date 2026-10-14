export { legendActions, getLegendState } from './legend.store.svelte';
export {
  resolveLegendEntryLabel,
  resolveLegendItemLayout,
  resolveLegendSegmentTitle,
  selectRenderedLegendItems,
  type ResolvedLegendItemLayout
} from './legend-items.utils';
export {
  getRenderedLegendSegments,
  setRenderedLegendSegments,
  type RenderedLegendSegment,
  type RenderedLegendSegmentKind
} from './legend-rendered-segments.svelte';
export type { LegendItem, LegendItemLayout } from '../../types/legend.types';
