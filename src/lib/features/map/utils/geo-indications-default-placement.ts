import { LegendPosition } from '$lib/features/commons/constants/ui.constants';

const DEFAULT_MARGIN_PX = 24;
const DEFAULT_SCALE_STACK_HEIGHT_PX = 40;
const DEFAULT_ORIENTATION_STACK_HEIGHT_PX = 40;
const DEFAULT_STACK_GAP_PX = 12;

type HorizontalSide = 'left' | 'right';

export interface GeoIndicationsPlacementContext {
  legendVisible: boolean;
  legendPosition: LegendPosition;
  legendDragged: boolean;
  scaleEnabled: boolean;
  scaleDragged: boolean;
  orientationEnabled: boolean;
  orientationDragged: boolean;
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

function resolveDefaultScaleSide(
  context: GeoIndicationsPlacementContext
): HorizontalSide {
  return legendOccupiesLeftSide(context) ? 'right' : 'left';
}

function resolveDefaultOrientationSide(
  context: GeoIndicationsPlacementContext
): HorizontalSide {
  return resolveDefaultScaleSide(context);
}

function resolveDefaultInsetSide(
  context: GeoIndicationsPlacementContext
): HorizontalSide {
  return resolveDefaultScaleSide(context);
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
  return buildAnchoredStyle(
    resolveDefaultScaleSide(context),
    'auto',
    DEFAULT_MARGIN_PX
  );
}

export function getDefaultOrientationStyle(
  context: GeoIndicationsPlacementContext
): string {
  const bottom =
    DEFAULT_MARGIN_PX +
    (context.scaleEnabled && !context.scaleDragged
      ? DEFAULT_SCALE_STACK_HEIGHT_PX + DEFAULT_STACK_GAP_PX
      : 0);

  return buildAnchoredStyle(
    resolveDefaultOrientationSide(context),
    'auto',
    bottom
  );
}

export function getDefaultInsetStyle(
  context: GeoIndicationsPlacementContext
): string {
  const side = resolveDefaultInsetSide(context);
  const scaleSide = resolveDefaultScaleSide(context);
  const needsScaleOffset =
    side === scaleSide && context.scaleEnabled && !context.scaleDragged;
  const needsOrientationOffset =
    side === resolveDefaultOrientationSide(context) &&
    context.orientationEnabled &&
    !context.orientationDragged;
  const bottom =
    DEFAULT_MARGIN_PX +
    (needsScaleOffset
      ? DEFAULT_SCALE_STACK_HEIGHT_PX + DEFAULT_STACK_GAP_PX
      : 0) +
    (needsOrientationOffset
      ? DEFAULT_ORIENTATION_STACK_HEIGHT_PX + DEFAULT_STACK_GAP_PX
      : 0);

  return buildAnchoredStyle(side, 'auto', bottom);
}
