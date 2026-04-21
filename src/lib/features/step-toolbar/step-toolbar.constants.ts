export const DOM_IDS = {
  STEP_TOOLBAR: 'khartis-step-toolbar',
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
  POPOVER_SCROLL: 'popover-scroll',
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
  DEFAULT_GRID_WIDTH: '790px',
  MAX_HEIGHT: 'min(max(488px, 58vh), calc(100dvh - 80px))',
  DROPDOWN_MAX_HEIGHT: '11rem'
} as const;

export const STORAGE_KEYS = {
  PROJECTION_TOOL_OPENED: 'khartis_projection_tool_opened',
  FACETS_TOOL_OPENED: 'khartis_facets_tool_opened',
  STORAGE_VALUE_OPENED: '1'
} as const;
