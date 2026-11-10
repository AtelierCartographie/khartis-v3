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
  pageScale: number;
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

/** Where a figure sits by default: a side of the map area and a bottom offset. */
export interface GeoIndicationAnchor {
  side: HorizontalSide;
  bottom: number;
}

export function getDefaultScaleAnchor(
  context: GeoIndicationsPlacementContext
): GeoIndicationAnchor {
  return { side: resolveDefaultScaleSide(context), bottom: DEFAULT_MARGIN_PX };
}

export function getDefaultOrientationAnchor(
  context: GeoIndicationsPlacementContext
): GeoIndicationAnchor {
  const bottom =
    DEFAULT_MARGIN_PX +
    (context.scaleEnabled && !context.scaleDragged
      ? DEFAULT_SCALE_STACK_HEIGHT_PX + DEFAULT_STACK_GAP_PX
      : 0);

  return { side: resolveDefaultOrientationSide(context), bottom };
}

export function getDefaultInsetAnchor(
  context: GeoIndicationsPlacementContext
): GeoIndicationAnchor {
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

  return { side, bottom };
}

/** Box of a figure at its default anchor, in map-area units: [x0, y0, x1, y1]. */
export function resolveAnchoredBox(
  anchor: GeoIndicationAnchor,
  size: { width: number; height: number },
  area: { width: number; height: number }
): [number, number, number, number] {
  const x0 =
    anchor.side === 'left'
      ? DEFAULT_MARGIN_PX
      : area.width - DEFAULT_MARGIN_PX - size.width;
  const y1 = area.height - anchor.bottom;
  return [x0, y1 - size.height, x0 + size.width, y1];
}

function buildAnchoredStyle(
  { side, bottom }: GeoIndicationAnchor,
  pageScale: number
): string {
  const margin = DEFAULT_MARGIN_PX * pageScale;
  const horizontal =
    side === 'left'
      ? `left: ${margin}px; right: auto;`
      : `right: ${margin}px; left: auto;`;

  return `${horizontal} top: auto; bottom: ${bottom * pageScale}px;`;
}

export function getDefaultGeoIndicationTransformOrigin(
  context: GeoIndicationsPlacementContext
): string {
  return `bottom ${resolveDefaultScaleSide(context)}`;
}

export function getDefaultScaleStyle(
  context: GeoIndicationsPlacementContext
): string {
  return buildAnchoredStyle(getDefaultScaleAnchor(context), context.pageScale);
}

export function getDefaultOrientationStyle(
  context: GeoIndicationsPlacementContext
): string {
  return buildAnchoredStyle(
    getDefaultOrientationAnchor(context),
    context.pageScale
  );
}

export function getDefaultInsetStyle(
  context: GeoIndicationsPlacementContext
): string {
  return buildAnchoredStyle(getDefaultInsetAnchor(context), context.pageScale);
}
