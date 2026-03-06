export type CarbonTooltipDirection = 'top' | 'right' | 'bottom' | 'left';

export type CarbonTooltipAlignment = 'start' | 'center' | 'end';

interface RectLike {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

interface SizeLike {
  width: number;
  height: number;
}

interface ViewportLike {
  width: number;
  height: number;
}

interface ResolveCarbonTooltipPositionOptions {
  triggerRect: RectLike;
  tooltipSize: SizeLike;
  direction: CarbonTooltipDirection;
  align: CarbonTooltipAlignment;
  viewport: ViewportLike;
  gap?: number;
  margin?: number;
}

interface ResolvedCarbonTooltipPosition {
  top: number;
  left: number;
  caretLeft?: number;
  caretTop?: number;
}

const DEFAULT_GAP = 8;
const DEFAULT_MARGIN = 8;
const HORIZONTAL_ALIGNMENT_INSET = 22;
const VERTICAL_ALIGNMENT_INSET = 16;
const CARET_SAFE_OFFSET = 12;

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}

function resolveHorizontalAnchor(
  rect: RectLike,
  align: CarbonTooltipAlignment
): number {
  if (align === 'start') {
    return rect.left + Math.min(HORIZONTAL_ALIGNMENT_INSET, rect.width / 2);
  }

  if (align === 'end') {
    return rect.right - Math.min(HORIZONTAL_ALIGNMENT_INSET, rect.width / 2);
  }

  return rect.left + rect.width / 2;
}

function resolveVerticalAnchor(
  rect: RectLike,
  align: CarbonTooltipAlignment
): number {
  if (align === 'start') {
    return rect.top + Math.min(VERTICAL_ALIGNMENT_INSET, rect.height / 2);
  }

  if (align === 'end') {
    return rect.bottom - Math.min(VERTICAL_ALIGNMENT_INSET, rect.height / 2);
  }

  return rect.top + rect.height / 2;
}

export function resolveCarbonTooltipPosition({
  triggerRect,
  tooltipSize,
  direction,
  align,
  viewport,
  gap = DEFAULT_GAP,
  margin = DEFAULT_MARGIN
}: ResolveCarbonTooltipPositionOptions): ResolvedCarbonTooltipPosition {
  const maxLeft = viewport.width - margin - tooltipSize.width;
  const maxTop = viewport.height - margin - tooltipSize.height;

  if (direction === 'top' || direction === 'bottom') {
    const anchorX = resolveHorizontalAnchor(triggerRect, align);
    const unclampedLeft = anchorX - tooltipSize.width / 2;
    const left = clamp(unclampedLeft, margin, maxLeft);
    const unclampedTop =
      direction === 'top'
        ? triggerRect.top - tooltipSize.height - gap
        : triggerRect.bottom + gap;
    const top = clamp(unclampedTop, margin, maxTop);

    return {
      top,
      left,
      caretLeft: clamp(
        anchorX - left,
        CARET_SAFE_OFFSET,
        tooltipSize.width - CARET_SAFE_OFFSET
      )
    };
  }

  const anchorY = resolveVerticalAnchor(triggerRect, align);
  const unclampedTop = anchorY - tooltipSize.height / 2;
  const top = clamp(unclampedTop, margin, maxTop);
  const unclampedLeft =
    direction === 'left'
      ? triggerRect.left - tooltipSize.width - gap
      : triggerRect.right + gap;
  const left = clamp(unclampedLeft, margin, maxLeft);

  return {
    top,
    left,
    caretTop: clamp(
      anchorY - top,
      CARET_SAFE_OFFSET,
      tooltipSize.height - CARET_SAFE_OFFSET
    )
  };
}
