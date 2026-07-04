import {
  ANNOTATION_ROLES,
  ANNOTATION_ROLE,
  getShapeDefaultDimensions
} from '$lib/features/commons/constants';
import { AnnotationKind } from '$lib/features/commons/constants/ui.constants';
import { TextAlign } from '$lib/features/commons/types/enums';
import {
  clampToRange,
  PAGE_GRID_SIZE_PX,
  snapPointWithinBounds
} from '$lib/features/commons/utils/page-grid.utils';
import { getFormatState } from '$lib/features/step-toolbar/tools/format/format.store.svelte';
import type {
  AnnotationCoordinateSpace,
  AnnotationStyle,
  PageElementRole
} from '../../types/annotations.types';

export type PageLayout = {
  width: number;
  height: number;
  margins: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
};

type PageFrame = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

const PAGE_ELEMENT_WIDTHS: Record<PageElementRole, number> = {
  [ANNOTATION_ROLE.TITLE]: 324,
  [ANNOTATION_ROLE.SUBTITLE]: 324,
  [ANNOTATION_ROLE.SOURCE]: 216,
  [ANNOTATION_ROLE.BASEMAP_SOURCE]: 216,
  [ANNOTATION_ROLE.SIGNATURE]: 216,
  [ANNOTATION_ROLE.CREDIT]: 216,
  [ANNOTATION_ROLE.NOTE]: 216
};

const PAGE_ELEMENT_HEIGHTS: Record<PageElementRole, number> = {
  [ANNOTATION_ROLE.TITLE]: 24,
  [ANNOTATION_ROLE.SUBTITLE]: 24,
  [ANNOTATION_ROLE.SOURCE]: 24,
  [ANNOTATION_ROLE.BASEMAP_SOURCE]: 24,
  [ANNOTATION_ROLE.SIGNATURE]: 24,
  [ANNOTATION_ROLE.CREDIT]: 24,
  [ANNOTATION_ROLE.NOTE]: 24
};

const BOTTOM_RIGHT_STACK_ORDER: PageElementRole[] = [
  ANNOTATION_ROLE.CREDIT,
  ANNOTATION_ROLE.BASEMAP_SOURCE,
  ANNOTATION_ROLE.SIGNATURE,
  ANNOTATION_ROLE.SOURCE
];
const TOP_LEFT_SAFE_OFFSET = PAGE_GRID_SIZE_PX;
const RIGHT_COLUMN_SAFE_OFFSET = PAGE_GRID_SIZE_PX * 2;
const BOTTOM_RIGHT_SAFE_OFFSET = PAGE_GRID_SIZE_PX * 3;
const BOTTOM_RIGHT_STACK_STEP = PAGE_GRID_SIZE_PX * 2;
const TITLE_TOP_OFFSET = PAGE_GRID_SIZE_PX;
const SUBTITLE_TOP_OFFSET = PAGE_GRID_SIZE_PX * 3;
const NON_PAGE_ANNOTATION_LEFT_OFFSET = PAGE_GRID_SIZE_PX * 2;
const NON_PAGE_IMAGE_LEFT_OFFSET = PAGE_GRID_SIZE_PX * 6;
const NON_PAGE_ANNOTATION_TOP_OFFSET = PAGE_GRID_SIZE_PX * 2;
const NON_PAGE_ANNOTATION_ROW_STEP = PAGE_GRID_SIZE_PX * 4;
const NON_PAGE_ANNOTATION_COLUMN_STEP = PAGE_GRID_SIZE_PX * 10;

const DEFAULT_ANNOTATION_BOUNDS: Record<
  AnnotationKind,
  { width: number; height: number }
> = {
  [AnnotationKind.TEXT]: { width: 220, height: PAGE_GRID_SIZE_PX * 3 },
  [AnnotationKind.SHAPE]: { width: 56, height: 56 },
  [AnnotationKind.DRAWING]: { width: 132, height: 80 },
  [AnnotationKind.IMAGE]: { width: 120, height: 120 }
};

type MapCanvasLayout = {
  width: number;
  height: number;
};

type CoordinateLayout = {
  width: number;
  height: number;
};

export function isGridEnabled(): boolean {
  return getFormatState().gridEnabled;
}

function resolveMapFrame(layout: PageLayout): PageFrame {
  const left = layout.margins.left;
  const top = layout.margins.top;
  const right = Math.max(left, layout.width - layout.margins.right);
  const bottom = Math.max(top, layout.height - layout.margins.bottom);

  return {
    left,
    top,
    right,
    bottom,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top)
  };
}

export function clampPageElementPosition(
  position: { x: number; y: number },
  role: PageElementRole,
  layout: PageLayout,
  snapToGridEnabled = true
): { x: number; y: number } {
  const frame = resolveMapFrame(layout);
  const roleWidth = PAGE_ELEMENT_WIDTHS[role];
  const roleHeight = PAGE_ELEMENT_HEIGHTS[role];
  const minX = frame.left;
  const maxX = Math.max(minX, frame.right - roleWidth);
  const minY = frame.top;
  const maxY = Math.max(minY, frame.bottom - roleHeight);

  return snapPointWithinBounds(
    position,
    {
      minX,
      maxX,
      minY,
      maxY
    },
    isGridEnabled() && snapToGridEnabled
  );
}

export function resolvePageLayout(overrides?: {
  width?: number;
  height?: number;
  margins?: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
}): PageLayout {
  const format = getFormatState();

  return {
    width: overrides?.width ?? format.width,
    height: overrides?.height ?? format.height,
    margins: overrides?.margins ?? format.margins
  };
}

function resolveMapCanvasLayout(layout: PageLayout): MapCanvasLayout {
  return {
    width: Math.max(
      1,
      layout.width - layout.margins.left - layout.margins.right
    ),
    height: Math.max(
      1,
      layout.height - layout.margins.top - layout.margins.bottom
    )
  };
}

function resolveCoordinateLayout(
  layout: PageLayout,
  coordinateSpace: AnnotationCoordinateSpace
): CoordinateLayout {
  return coordinateSpace === 'page'
    ? {
        width: Math.max(1, layout.width),
        height: Math.max(1, layout.height)
      }
    : resolveMapCanvasLayout(layout);
}

function getAnnotationBounds(
  type: AnnotationKind,
  style: AnnotationStyle,
  content?: unknown
): { width: number; height: number } {
  if (type === AnnotationKind.IMAGE) {
    const resolvedSize = Number(
      style.size ?? DEFAULT_ANNOTATION_BOUNDS.image.width
    );
    const safeSize = Number.isFinite(resolvedSize)
      ? Math.max(40, resolvedSize)
      : DEFAULT_ANNOTATION_BOUNDS.image.width;
    return { width: safeSize, height: safeSize };
  }

  if (type === AnnotationKind.SHAPE) {
    const defaultDimensions = getShapeDefaultDimensions(String(content ?? ''));
    return {
      width: Math.max(24, style.shapeWidth ?? defaultDimensions.width),
      height: Math.max(24, style.shapeHeight ?? defaultDimensions.height)
    };
  }

  return DEFAULT_ANNOTATION_BOUNDS[type];
}

export function clampAnnotationPosition(
  position: { x: number; y: number },
  type: AnnotationKind,
  style: AnnotationStyle,
  layout: PageLayout,
  coordinateSpace: AnnotationCoordinateSpace,
  content?: unknown
): { x: number; y: number } {
  const coordinateLayout = resolveCoordinateLayout(layout, coordinateSpace);
  const bounds = getAnnotationBounds(type, style, content);

  const minX = 0;
  const minY = 0;
  const maxX = Math.max(minX, coordinateLayout.width - bounds.width);
  const maxY = Math.max(minY, coordinateLayout.height - bounds.height);

  return snapPointWithinBounds(
    position,
    {
      minX,
      maxX,
      minY,
      maxY
    },
    isGridEnabled()
  );
}

export function getNonPageAnnotationSpawnPosition(
  type: AnnotationKind,
  style: AnnotationStyle,
  existingAnnotationsCount: number,
  layout: PageLayout,
  coordinateSpace: AnnotationCoordinateSpace,
  content?: unknown
): { x: number; y: number } {
  const coordinateLayout = resolveCoordinateLayout(layout, coordinateSpace);
  const bounds = getAnnotationBounds(type, style, content);
  const availableVerticalSpace = Math.max(
    0,
    coordinateLayout.height - NON_PAGE_ANNOTATION_TOP_OFFSET - bounds.height
  );
  const maxRows = Math.max(
    1,
    Math.floor(availableVerticalSpace / NON_PAGE_ANNOTATION_ROW_STEP) + 1
  );
  const column = Math.floor(existingAnnotationsCount / maxRows);
  const row = existingAnnotationsCount % maxRows;
  const leftOffset =
    type === AnnotationKind.IMAGE
      ? NON_PAGE_IMAGE_LEFT_OFFSET
      : NON_PAGE_ANNOTATION_LEFT_OFFSET;

  const x = leftOffset + column * NON_PAGE_ANNOTATION_COLUMN_STEP;
  const y = NON_PAGE_ANNOTATION_TOP_OFFSET + row * NON_PAGE_ANNOTATION_ROW_STEP;

  return clampAnnotationPosition(
    { x, y },
    type,
    style,
    layout,
    coordinateSpace,
    content
  );
}

export function getPageNoteSpawnPosition(
  bottomRightItemsCount: number,
  layout: PageLayout
): { x: number; y: number } {
  const frame = resolveMapFrame(layout);
  const noteWidth = PAGE_ELEMENT_WIDTHS[ANNOTATION_ROLE.NOTE];
  const baseY = frame.bottom - BOTTOM_RIGHT_SAFE_OFFSET;

  return clampPageElementPosition(
    {
      x: frame.right - noteWidth - RIGHT_COLUMN_SAFE_OFFSET,
      y: baseY - bottomRightItemsCount * BOTTOM_RIGHT_STACK_STEP
    },
    ANNOTATION_ROLE.NOTE,
    layout
  );
}

export function getPageElementPosition(
  role: PageElementRole,
  layout: PageLayout
): { x: number; y: number } {
  const frame = resolveMapFrame(layout);
  const roleWidth = PAGE_ELEMENT_WIDTHS[role];
  const roleHeight = PAGE_ELEMENT_HEIGHTS[role];
  const minX = frame.left;
  const maxX = Math.max(minX, frame.right - roleWidth);
  const titleX = clampToRange(frame.left + TOP_LEFT_SAFE_OFFSET, minX, maxX);
  const rightColumnX = clampToRange(
    frame.right - roleWidth - RIGHT_COLUMN_SAFE_OFFSET,
    minX,
    maxX
  );
  const minY = frame.top;
  const maxY = Math.max(minY, frame.bottom - roleHeight);
  const bottomStackIndex = BOTTOM_RIGHT_STACK_ORDER.indexOf(role);

  if (bottomStackIndex !== -1) {
    const baseY = frame.bottom - BOTTOM_RIGHT_SAFE_OFFSET;
    return {
      x: rightColumnX,
      y: clampToRange(
        baseY - bottomStackIndex * BOTTOM_RIGHT_STACK_STEP,
        minY,
        maxY
      )
    };
  }

  switch (role) {
    case ANNOTATION_ROLE.TITLE:
      return {
        x: titleX,
        y: clampToRange(frame.top + TITLE_TOP_OFFSET, minY, maxY)
      };
    case ANNOTATION_ROLE.SUBTITLE:
      return {
        x: titleX,
        y: clampToRange(frame.top + SUBTITLE_TOP_OFFSET, minY, maxY)
      };
    case ANNOTATION_ROLE.NOTE:
      return {
        x: rightColumnX,
        y: clampToRange(frame.bottom - BOTTOM_RIGHT_SAFE_OFFSET, minY, maxY)
      };
    default:
      return {
        x: titleX,
        y: clampToRange(frame.top + PAGE_GRID_SIZE_PX * 2, minY, maxY)
      };
  }
}

export function isBottomRightPageElementRole(role: PageElementRole): boolean {
  return BOTTOM_RIGHT_STACK_ORDER.includes(role);
}

function isTopLeftPageElementRole(role: PageElementRole): boolean {
  return role === ANNOTATION_ROLE.TITLE || role === ANNOTATION_ROLE.SUBTITLE;
}

export function shouldSnapAutoPageElement(role: PageElementRole): boolean {
  return isPageElementRole(role);
}

export function reconcileAutoPageElementStyle(
  role: PageElementRole,
  positionMode: 'auto' | 'manual' | undefined,
  style: AnnotationStyle | undefined
): AnnotationStyle | undefined {
  const nextStyle = { ...(style ?? {}) };

  if (
    positionMode !== 'manual' &&
    isBottomRightPageElementRole(role) &&
    (nextStyle.textAlign === undefined ||
      nextStyle.textAlign === TextAlign.Left)
  ) {
    nextStyle.textAlign = TextAlign.Right;
  }

  if (
    positionMode !== 'manual' &&
    isTopLeftPageElementRole(role) &&
    (nextStyle.textAlign === undefined ||
      nextStyle.textAlign === TextAlign.Center)
  ) {
    nextStyle.textAlign = TextAlign.Left;
  }

  return Object.keys(nextStyle).length > 0 ? nextStyle : undefined;
}

export function isPageElementRole(role: unknown): role is PageElementRole {
  return (
    typeof role === 'string' &&
    ANNOTATION_ROLES.includes(role as (typeof ANNOTATION_ROLES)[number])
  );
}
