export { legendActions, getLegendState } from './legend.store.svelte';
export { requestLegendItemFocus } from './legend-focus.svelte';
export {
  resolveLegendEntryLabel,
  resolveLegendItemLayout,
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
