export interface TooltipAnchor {
  x: number;
  y: number;
}

export interface TooltipViewportOrigin {
  left: number;
  top: number;
}

export interface TooltipSize {
  width: number;
  height: number;
}

export interface TooltipViewportSize {
  width: number;
  height: number;
}

export interface ResolveTooltipViewportPositionParams {
  anchor: TooltipAnchor;
  viewportOrigin?: TooltipViewportOrigin | null;
  tooltipSize: TooltipSize;
  viewportSize: TooltipViewportSize;
  offsetX: number;
  offsetY: number;
  padding: number;
}

export interface TooltipViewportPosition {
  left: number;
  top: number;
}

export function resolveTooltipViewportPosition({
  anchor,
  viewportOrigin,
  tooltipSize,
  viewportSize,
  offsetX,
  offsetY,
  padding
}: ResolveTooltipViewportPositionParams): TooltipViewportPosition {
  const originLeft = viewportOrigin?.left ?? 0;
  const originTop = viewportOrigin?.top ?? 0;

  let left = originLeft + anchor.x + offsetX;
  let top = originTop + anchor.y + offsetY;

  if (left + tooltipSize.width > viewportSize.width - padding) {
    left = originLeft + anchor.x - tooltipSize.width - offsetX;
  }

  if (top + tooltipSize.height > viewportSize.height - padding) {
    top = originTop + anchor.y - tooltipSize.height - offsetY;
  }

  return {
    left: Math.max(padding, left),
    top: Math.max(padding, top)
  };
}
