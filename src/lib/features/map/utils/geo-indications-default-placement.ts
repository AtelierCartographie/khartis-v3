import { LegendPosition } from '$lib/features/commons/constants/ui.constants';

const DEFAULT_MARGIN_PX = 16;
const DEFAULT_SCALE_STACK_HEIGHT_PX = 54;
const DEFAULT_STACK_GAP_PX = 12;

type HorizontalSide = 'left' | 'right';

export interface GeoIndicationsPlacementContext {
  legendVisible: boolean;
  legendPosition: LegendPosition;
  legendDragged: boolean;
  scaleEnabled: boolean;
  scaleDragged: boolean;
}

function legendOccupiesLeftSide(
  context: GeoIndicationsPlacementContext
): boolean {
  return (
    context.legendVisible &&
    !context.legendDragged &&
    (context.legendPosition === LegendPosition.TOP_LEFT ||
      context.legendPosition === LegendPosition.BOTTOM_LEFT)
  );
}

function legendOccupiesRightSide(
  context: GeoIndicationsPlacementContext
): boolean {
  return (
    context.legendVisible &&
    !context.legendDragged &&
    (context.legendPosition === LegendPosition.TOP_RIGHT ||
      context.legendPosition === LegendPosition.BOTTOM_RIGHT ||
      context.legendPosition === LegendPosition.BOTTOM_CENTER)
  );
}

function resolveDefaultScaleSide(
  context: GeoIndicationsPlacementContext
): HorizontalSide {
  return legendOccupiesLeftSide(context) ? 'right' : 'left';
}

function resolveDefaultOrientationSide(
  context: GeoIndicationsPlacementContext
): HorizontalSide {
  return legendOccupiesRightSide(context) ? 'left' : 'right';
}

function resolveDefaultInsetSide(
  context: GeoIndicationsPlacementContext
): HorizontalSide {
  return legendOccupiesRightSide(context) ? 'left' : 'right';
}

function buildAnchoredStyle(
  side: HorizontalSide,
  top: number | 'auto',
  bottom: number | 'auto'
): string {
  const horizontal =
    side === 'left'
      ? `left: ${DEFAULT_MARGIN_PX}px; right: auto;`
      : `right: ${DEFAULT_MARGIN_PX}px; left: auto;`;
  const verticalTop = top === 'auto' ? 'top: auto;' : `top: ${top}px;`;
  const verticalBottom =
    bottom === 'auto' ? 'bottom: auto;' : `bottom: ${bottom}px;`;

  return `${horizontal} ${verticalTop} ${verticalBottom}`;
}

export function getDefaultScaleStyle(
  context: GeoIndicationsPlacementContext
): string {
  return buildAnchoredStyle(resolveDefaultScaleSide(context), 'auto', 16);
}

export function getDefaultOrientationStyle(
  context: GeoIndicationsPlacementContext
): string {
  return buildAnchoredStyle(resolveDefaultOrientationSide(context), 16, 'auto');
}

export function getDefaultInsetStyle(
  context: GeoIndicationsPlacementContext
): string {
  const side = resolveDefaultInsetSide(context);
  const scaleSide = resolveDefaultScaleSide(context);
  const needsScaleOffset =
    side === scaleSide && context.scaleEnabled && !context.scaleDragged;
  const bottom =
    DEFAULT_MARGIN_PX +
    (needsScaleOffset
      ? DEFAULT_SCALE_STACK_HEIGHT_PX + DEFAULT_STACK_GAP_PX
      : 0);

  return buildAnchoredStyle(side, 'auto', bottom);
}
