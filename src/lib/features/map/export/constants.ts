import { NEUTRAL_CARTOGRAPHY_RGBA_COLORS } from '$lib/features/commons/constants/colors.constants';
import type { ExportOptions } from './types';

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  width: 1920,
  height: 1080
};
export const EXPORT_BACKGROUND_COLOR = '#ffffff';
export const JPEG_EXPORT_QUALITY = 1.0;
export const EXPORT_RENDER_TIMEOUT_MS = 10000;
export const PIXEL_RATIO_EPSILON = 0.001;
export const FROZEN_CANVAS_ATTRIBUTE = 'data-khartis-export-frozen-canvas';
export const SVG_MAP_FRAME_CLIP_ID = 'khartis-map-frame-clip';
export const EXPORT_PAGE_SELECTOR = '.page-container, .facets-page';
export const EXPORT_MAP_STAGE_SELECTOR = '.map-stage, .facets-map-stage';
export const EXPORT_MAP_SURFACE_SELECTOR = '.map-canvas, .shared-facets-canvas';
export const EXPORT_MAP_CANVAS_SELECTOR =
  '.map-canvas canvas, .shared-facets-canvas canvas, canvas';
export const SVG_DEFAULT_FILL_COLOR: [number, number, number, number] = [
  ...NEUTRAL_CARTOGRAPHY_RGBA_COLORS.svgDefaultFill
];
export const SVG_DEFAULT_STROKE_COLOR: [number, number, number, number] = [
  ...NEUTRAL_CARTOGRAPHY_RGBA_COLORS.svgDefaultStroke
];
export const SVG_TRANSPARENT_COLOR: [number, number, number, number] = [
  ...NEUTRAL_CARTOGRAPHY_RGBA_COLORS.transparent
];
