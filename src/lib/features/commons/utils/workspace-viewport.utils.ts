export interface WorkspacePanOffset {
  x: number;
  y: number;
}

export interface WorkspaceViewportBounds {
  bleedX: number;
  bleedY: number;
  maxOffsetX: number;
  maxOffsetY: number;
  overflowX: boolean;
  overflowY: boolean;
  hasOverflow: boolean;
}

export interface ResolveWorkspaceViewportBoundsParams {
  viewportWidth: number;
  viewportHeight: number;
  pageWidth: number;
  pageHeight: number;
  pageZoomScale: number;
}

const WORKSPACE_BLEED_RATIO = 0.2;
const MIN_WORKSPACE_BLEED_PX = 96;
const MAX_WORKSPACE_BLEED_PX = 220;
const FREE_DRAG_RANGE_RATIO = 0.4;

export const DEFAULT_WORKSPACE_VIEWPORT_BOUNDS: WorkspaceViewportBounds = {
  bleedX: MIN_WORKSPACE_BLEED_PX,
  bleedY: MIN_WORKSPACE_BLEED_PX,
  maxOffsetX: MIN_WORKSPACE_BLEED_PX,
  maxOffsetY: MIN_WORKSPACE_BLEED_PX,
  overflowX: false,
  overflowY: false,
  hasOverflow: false
};

export const WORKSPACE_PAN_INTERACTIVE_SELECTOR = [
  'button',
  'input',
  'textarea',
  'select',
  'option',
  'a',
  '[role="button"]',
  '[role="link"]',
  '[role="textbox"]',
  '[role="combobox"]',
  '[contenteditable="true"]',
  '.resize-handle',
  '.rotate-handle'
].join(', ');

export const WORKSPACE_PAN_DRAG_SURFACE_SELECTOR = [
  '.main-map-container',
  '.map-stage',
  '.map-canvas',
  '.page-grid',
  '.page-container',
  'canvas'
].join(', ');

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function resolveWorkspaceBleed(size: number): number {
  return clamp(
    size * WORKSPACE_BLEED_RATIO,
    MIN_WORKSPACE_BLEED_PX,
    MAX_WORKSPACE_BLEED_PX
  );
}

export function resolveWorkspaceViewportBounds({
  viewportWidth,
  viewportHeight,
  pageWidth,
  pageHeight,
  pageZoomScale
}: ResolveWorkspaceViewportBoundsParams): WorkspaceViewportBounds {
  if (
    viewportWidth <= 0 ||
    viewportHeight <= 0 ||
    pageWidth <= 0 ||
    pageHeight <= 0 ||
    pageZoomScale <= 0
  ) {
    return DEFAULT_WORKSPACE_VIEWPORT_BOUNDS;
  }

  const scaledPageWidth = pageWidth * pageZoomScale;
  const scaledPageHeight = pageHeight * pageZoomScale;
  const bleedX = resolveWorkspaceBleed(viewportWidth);
  const bleedY = resolveWorkspaceBleed(viewportHeight);
  const overflowX = scaledPageWidth > viewportWidth;
  const overflowY = scaledPageHeight > viewportHeight;

  const overflowOffsetX = Math.max(0, (scaledPageWidth - viewportWidth) / 2);
  const overflowOffsetY = Math.max(0, (scaledPageHeight - viewportHeight) / 2);
  const freeRangeX = viewportWidth * FREE_DRAG_RANGE_RATIO;
  const freeRangeY = viewportHeight * FREE_DRAG_RANGE_RATIO;

  return {
    bleedX,
    bleedY,
    maxOffsetX: Math.max(freeRangeX, overflowOffsetX + bleedX),
    maxOffsetY: Math.max(freeRangeY, overflowOffsetY + bleedY),
    overflowX,
    overflowY,
    hasOverflow: overflowX || overflowY
  };
}

export function clampWorkspacePanOffset(
  offset: WorkspacePanOffset,
  bounds: WorkspaceViewportBounds
): WorkspacePanOffset {
  return {
    x: clamp(offset.x, -bounds.maxOffsetX, bounds.maxOffsetX),
    y: clamp(offset.y, -bounds.maxOffsetY, bounds.maxOffsetY)
  };
}

const FIT_PADDING_PX = 30;
const MIN_FIT_ZOOM_PERCENT = 20;
const MAX_FIT_ZOOM_PERCENT = 500;

export interface ResolveFitZoomParams {
  viewportWidth: number;
  viewportHeight: number;
  pageWidth: number;
  pageHeight: number;
  paddingPx?: number;
}

export function resolveFitToWorkspaceZoom({
  viewportWidth,
  viewportHeight,
  pageWidth,
  pageHeight,
  paddingPx = FIT_PADDING_PX
}: ResolveFitZoomParams): number {
  if (
    viewportWidth <= 0 ||
    viewportHeight <= 0 ||
    pageWidth <= 0 ||
    pageHeight <= 0
  ) {
    return 100;
  }

  const availableWidth = Math.max(1, viewportWidth - paddingPx * 2);
  const availableHeight = Math.max(1, viewportHeight - paddingPx * 2);

  const ratio = Math.min(
    availableWidth / pageWidth,
    availableHeight / pageHeight
  );

  const percent = Math.round(ratio * 100);

  return clamp(percent, MIN_FIT_ZOOM_PERCENT, MAX_FIT_ZOOM_PERCENT);
}

export const WORKSPACE_FIT_EVENT = 'khartis:workspace-fit';

export function dispatchWorkspaceFit(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(WORKSPACE_FIT_EVENT));
}

export function isWorkspacePanTarget(target: EventTarget | null): boolean {
  const element = target instanceof Element ? target : null;

  if (!element) {
    return false;
  }

  if (element.closest('[data-workspace-pan-ignore="true"]')) {
    return false;
  }

  if (element.closest(WORKSPACE_PAN_INTERACTIVE_SELECTOR)) {
    return false;
  }

  return Boolean(element.closest(WORKSPACE_PAN_DRAG_SURFACE_SELECTOR));
}
