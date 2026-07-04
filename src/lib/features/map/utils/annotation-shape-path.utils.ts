import {
  getShapeDefaultDimensions,
  isShapeAspectRatioLocked,
  SHAPE_TYPE
} from '$lib/features/commons/constants';
import type { Annotation } from '$lib/features/step-toolbar/tools/annotations';

export const MIN_SHAPE_SIZE = 24;

const SHAPE_VIEWBOX_PADDING = 8;

export type AnnotationShapeBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type AnnotationShapeRenderData = {
  type: string;
  path?: string;
  cx?: number;
  cy?: number;
  r?: number;
};

export function getShapeDefaultSize(shapeType: string): {
  width: number;
  height: number;
} {
  return getShapeDefaultDimensions(shapeType);
}

export function getShapeViewBox(shapeType: string): string {
  const { width, height } = getShapeDefaultSize(shapeType);

  return `${-SHAPE_VIEWBOX_PADDING} ${-SHAPE_VIEWBOX_PADDING} ${width + SHAPE_VIEWBOX_PADDING * 2} ${height + SHAPE_VIEWBOX_PADDING * 2}`;
}

export function renderShape(
  item: Annotation,
  shapeType: string
): AnnotationShapeRenderData {
  const { width, height } = getShapeDefaultSize(shapeType);
  const centerX = width / 2;
  const centerY = height / 2;

  switch (shapeType) {
    case SHAPE_TYPE.ARROW: {
      const curvature = item.style?.curvature ?? 50;
      const shaftEnd = width * 0.7;
      const headTop = centerY - height * 0.28;
      const headBottom = centerY + height * 0.28;
      const curveOffset = ((curvature - 50) / 50) * height * 0.35;
      const controlY = centerY - curveOffset;
      const shaft =
        Math.abs(curvature - 50) < 2
          ? `M 0,${centerY} L ${shaftEnd},${centerY}`
          : `M 0,${centerY} Q ${width * 0.35},${controlY} ${shaftEnd},${centerY}`;
      const head = `M ${shaftEnd},${headTop} L ${width},${centerY} L ${shaftEnd},${headBottom} Z`;

      return { type: SHAPE_TYPE.ARROW, path: `${shaft} ${head}` };
    }
    case SHAPE_TYPE.LINE:
      return {
        type: 'path',
        path: `M 0,${centerY} L ${width},${centerY}`
      };
    case SHAPE_TYPE.RECTANGLE:
      return {
        type: 'path',
        path: `M 0,0 L ${width},0 L ${width},${height} L 0,${height} Z`
      };
    case SHAPE_TYPE.CIRCLE:
      return {
        type: SHAPE_TYPE.CIRCLE,
        cx: centerX,
        cy: centerY,
        r: Math.min(width, height) / 2
      };
    case SHAPE_TYPE.TRIANGLE:
      return {
        type: 'path',
        path: `M ${centerX},0 L ${width},${height} L 0,${height} Z`
      };
    case SHAPE_TYPE.STAR:
      return {
        type: 'path',
        path: createStarPath(
          centerX,
          centerY,
          5,
          Math.min(width, height) / 2,
          Math.min(width, height) / 4
        )
      };
    default:
      return {
        type: SHAPE_TYPE.CIRCLE,
        cx: centerX,
        cy: centerY,
        r: Math.min(width, height) / 2
      };
  }
}

export function createStarPath(
  cx: number,
  cy: number,
  spikes: number,
  outerRadius: number,
  innerRadius: number
): string {
  let path = '';
  const step = Math.PI / spikes;

  for (let i = 0; i < 2 * spikes; i++) {
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = i * step - Math.PI / 2;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    path += i === 0 ? `M ${x},${y}` : ` L ${x},${y}`;
  }
  return path + ' Z';
}

export function resolveResizedShapeBounds(
  item: Annotation,
  handle: string,
  dx: number,
  dy: number,
  startBounds: AnnotationShapeBounds
): AnnotationShapeBounds {
  const shapeType = String(item.content ?? '');
  const preserveAspectRatio = isShapeAspectRatioLocked(shapeType);
  const startRight = startBounds.x + startBounds.width;
  const startBottom = startBounds.y + startBounds.height;
  const startCenterX = startBounds.x + startBounds.width / 2;
  const startCenterY = startBounds.y + startBounds.height / 2;

  let nextX = startBounds.x;
  let nextY = startBounds.y;
  let nextWidth = startBounds.width;
  let nextHeight = startBounds.height;

  switch (handle) {
    case 'nw':
      nextWidth = Math.max(MIN_SHAPE_SIZE, startBounds.width - dx);
      nextHeight = Math.max(MIN_SHAPE_SIZE, startBounds.height - dy);
      nextX = startRight - nextWidth;
      nextY = startBottom - nextHeight;
      break;
    case 'n':
      nextHeight = Math.max(MIN_SHAPE_SIZE, startBounds.height - dy);
      nextY = startBottom - nextHeight;
      break;
    case 'ne':
      nextWidth = Math.max(MIN_SHAPE_SIZE, startBounds.width + dx);
      nextHeight = Math.max(MIN_SHAPE_SIZE, startBounds.height - dy);
      nextY = startBottom - nextHeight;
      break;
    case 'e':
      nextWidth = Math.max(MIN_SHAPE_SIZE, startBounds.width + dx);
      break;
    case 'se':
      nextWidth = Math.max(MIN_SHAPE_SIZE, startBounds.width + dx);
      nextHeight = Math.max(MIN_SHAPE_SIZE, startBounds.height + dy);
      break;
    case 's':
      nextHeight = Math.max(MIN_SHAPE_SIZE, startBounds.height + dy);
      break;
    case 'sw':
      nextWidth = Math.max(MIN_SHAPE_SIZE, startBounds.width - dx);
      nextHeight = Math.max(MIN_SHAPE_SIZE, startBounds.height + dy);
      nextX = startRight - nextWidth;
      break;
    case 'w':
      nextWidth = Math.max(MIN_SHAPE_SIZE, startBounds.width - dx);
      nextX = startRight - nextWidth;
      break;
  }

  if (!preserveAspectRatio) {
    return {
      x: nextX,
      y: nextY,
      width: nextWidth,
      height: nextHeight
    };
  }

  const aspectRatio = startBounds.width / Math.max(startBounds.height, 1);
  const horizontalHandle = handle === 'e' || handle === 'w';
  const verticalHandle = handle === 'n' || handle === 's';
  const widthRatio = nextWidth / startBounds.width;
  const heightRatio = nextHeight / startBounds.height;
  const scale = Math.max(
    MIN_SHAPE_SIZE / Math.max(startBounds.width, startBounds.height),
    horizontalHandle
      ? widthRatio
      : verticalHandle
        ? heightRatio
        : Math.max(widthRatio, heightRatio)
  );

  nextWidth = Math.max(MIN_SHAPE_SIZE, startBounds.width * scale);
  nextHeight = Math.max(
    MIN_SHAPE_SIZE,
    nextWidth / Math.max(aspectRatio, 0.01)
  );

  if (verticalHandle) {
    nextWidth = Math.max(
      MIN_SHAPE_SIZE,
      startBounds.height * scale * aspectRatio
    );
    nextHeight = Math.max(MIN_SHAPE_SIZE, startBounds.height * scale);
  }

  switch (handle) {
    case 'e':
      nextX = startBounds.x;
      nextY = startCenterY - nextHeight / 2;
      break;
    case 'w':
      nextX = startRight - nextWidth;
      nextY = startCenterY - nextHeight / 2;
      break;
    case 'n':
      nextX = startCenterX - nextWidth / 2;
      nextY = startBottom - nextHeight;
      break;
    case 's':
      nextX = startCenterX - nextWidth / 2;
      nextY = startBounds.y;
      break;
    case 'nw':
      nextX = startRight - nextWidth;
      nextY = startBottom - nextHeight;
      break;
    case 'ne':
      nextX = startBounds.x;
      nextY = startBottom - nextHeight;
      break;
    case 'se':
      nextX = startBounds.x;
      nextY = startBounds.y;
      break;
    case 'sw':
      nextX = startRight - nextWidth;
      nextY = startBounds.y;
      break;
  }

  return {
    x: nextX,
    y: nextY,
    width: nextWidth,
    height: nextHeight
  };
}
