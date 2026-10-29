import {
  StylingTools,
  VisualizationTools
} from '$lib/features/commons/types/global';

export const DOM_IDS = {
  STEP_TOOLBAR: 'khartis-step-toolbar',
  ZOOM_TOOLBAR: 'khartis-zoom-toolbar',
  TOOL_POPOVER: 'khartis-tool-popover',
  COLOR_PICKER: 'khartis-color-picker',
  COLOR_PICKER_DROPDOWN: 'khartis-color-picker-dropdown',
  COLORBLINDNESS_NOTIFICATION: 'khartis-colorblindness-notification'
} as const;

export const CSS_CLASSES = {
  NAV_ITEM: 'nav-item',
  SELECTED: 'selected',
  SCROLL_VIEWPORT: 'scroll-viewport',
  STEP_HEADER: 'step-header',
  STEP_TITLE: 'step-title',
  STEP_CONTAINER: 'step-container',
  TOOLS_GRID: 'tools-grid',
  TOOL_POPOVER: 'tool-popover',
  POPOVER_FRAME: 'popover-frame',
  TOOL_BUTTON_WRAPPER: 'tool-button-wrapper',
  NOTIFICATION_BADGE: 'notification-badge'
} as const;

export const TEST_IDS = {
  STEP_DATA: 'step-data',
  STEP_VISUALIZATIONS: 'step-visualizations',
  STEP_STYLING: 'step-styling'
} as const;

export const POPOVER_DIMENSIONS = {
  DEFAULT_LIST_WIDTH: 320,
  PROJECTION_GRID_WIDTH: '648px',
  /** Space kept between a tool window and the map view edges or zoom toolbar. */
  VIEWPORT_MARGIN: 16,
  /** On tall screens a full-height window stops here, centred on the toolbar. */
  FILL_MAX_HEIGHT: 880,
  DROPDOWN_MAX_HEIGHT: '11rem'
} as const;

export type ToolPopoverSizing = 'fill' | 'fit';

/**
 * Tools whose content outgrows the window or grows while in use (layers,
 * more suggestions). They take the whole free height so the window never
 * resizes under the user; the others fit their content.
 */
export const FILL_HEIGHT_TOOLS: ReadonlySet<string> = new Set([
  VisualizationTools.Layers,
  VisualizationTools.Projection,
  StylingTools.Legend,
  StylingTools.GeoIndications,
  StylingTools.Annotations
]);

export const STORAGE_KEYS = {
  PROJECTION_TOOL_OPENED: 'khartis_projection_tool_opened',
  FACETS_TOOL_OPENED: 'khartis_facets_tool_opened',
  STORAGE_VALUE_OPENED: '1'
} as const;
