import { ToolbarState } from '$lib/features/commons/types/global';

export const MAIN_TOOLBAR_ID = 'khartis-main-toolbar';

export const TOOLBAR_WIDTHS = {
  [ToolbarState.Collapsed]: '50px',
  [ToolbarState.Compact]: '434px',
  [ToolbarState.Full]: '50vw'
} as const satisfies Record<ToolbarState, string>;

export const FULL_TOOLBAR_PANEL_WIDTH = 'clamp(400px, 50vw, 800px)';

export function resolveToolbarWidth(toolbarState: ToolbarState): string {
  return TOOLBAR_WIDTHS[toolbarState] ?? TOOLBAR_WIDTHS[ToolbarState.Full];
}

export function resolveToolbarPanelWidth(toolbarState: ToolbarState): string {
  if (toolbarState === ToolbarState.Full) {
    return FULL_TOOLBAR_PANEL_WIDTH;
  }

  return resolveToolbarWidth(toolbarState);
}

export function resolveToolbarPanelWidthFromClassName(
  toolbarClassName = ''
): string {
  if (toolbarClassName.includes(ToolbarState.Collapsed)) {
    return TOOLBAR_WIDTHS[ToolbarState.Collapsed];
  }

  if (toolbarClassName.includes(ToolbarState.Full)) {
    return FULL_TOOLBAR_PANEL_WIDTH;
  }

  return TOOLBAR_WIDTHS[ToolbarState.Compact];
}
