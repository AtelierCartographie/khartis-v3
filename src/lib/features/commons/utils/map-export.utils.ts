// Kept while PR #424 edits two of the importers: once it is merged, they import
// from `$lib/features/map/export/*` and this file goes away.
export type {
  MapExportPlacement,
  MapExportRequest
} from '$lib/features/map/export/types';
export {
  exportMapToJpg,
  exportMapToSvg
} from '$lib/features/map/export/export-map';
export {
  measureMapPage,
  type MeasuredFont,
  type MeasuredMapPage,
  type MeasuredPageLegend,
  type MeasuredPageText,
  type PageBox
} from '$lib/features/map/export/measure-page';
