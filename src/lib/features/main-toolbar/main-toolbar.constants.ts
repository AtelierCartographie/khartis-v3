import { ToolbarState, ToolbarStep } from '$lib/features/commons/types/global';

export enum SearchSource {
  ALL = 'all'
}

export enum VizSubTab {
  CHOOSE = 'choose',
  CONFIGURE = 'configure',
  CUSTOMIZE = 'customize'
}

export const MAIN_TOOLBAR_COMPACT_WIDTH_PX = 434;
export const MAIN_TOOLBAR_COLLAPSED_WIDTH_PX = 50;
export const MAIN_TOOLBAR_FULL_MIN_WIDTH_PX = 400;
export const MAIN_TOOLBAR_FULL_MAX_WIDTH_PX = 800;
export const MAIN_TOOLBAR_FULL_RATIO = 0.5;

export function getMainToolbarFullWidthPx(windowWidth: number): number {
  if (!Number.isFinite(windowWidth) || windowWidth <= 0) {
    return MAIN_TOOLBAR_FULL_MIN_WIDTH_PX;
  }
  return Math.min(
    MAIN_TOOLBAR_FULL_MAX_WIDTH_PX,
    Math.max(
      MAIN_TOOLBAR_FULL_MIN_WIDTH_PX,
      windowWidth * MAIN_TOOLBAR_FULL_RATIO
    )
  );
}

export function getMainToolbarMaxWidthPx(
  windowWidth: number,
  isMobile: boolean
): number {
  if (isMobile) return 0;
  return getMainToolbarFullWidthPx(windowWidth);
}

export function getMainToolbarActualWidthPx(
  toolbarState: ToolbarState,
  selectedStep: ToolbarStep,
  windowWidth: number,
  isMobile: boolean
): number {
  if (isMobile) return 0;
  if (selectedStep === ToolbarStep.Styling) return 0;

  switch (toolbarState) {
    case ToolbarState.Full:
      return getMainToolbarFullWidthPx(windowWidth);
    case ToolbarState.Compact:
      return MAIN_TOOLBAR_COMPACT_WIDTH_PX;
    case ToolbarState.Collapsed:
      return MAIN_TOOLBAR_COLLAPSED_WIDTH_PX;
    default:
      return MAIN_TOOLBAR_COMPACT_WIDTH_PX;
  }
}
