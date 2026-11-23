export { legendActions, getLegendState } from './legend.store.svelte';
export {
  clearLegendItemCentering,
  getPendingLegendItemCentering,
  requestLegendItemFocus,
  setSelectedLegendItem
} from './legend-focus.svelte';
export {
  resolveLegendEntryLabel,
  resolveLegendItemLayout,
  selectRenderedLegendItems,
  type ResolvedLegendItemLayout
} from './legend-items.utils';
export {
  setRenderedLegendSegments,
  type RenderedLegendSegmentKind
} from './legend-rendered-segments.svelte';
export type { LegendItem } from '../../types/legend.types';
