import {
  AnnotationKind,
  DrawingType
} from '$lib/features/commons/constants/ui.constants';
import {
  ANNOTATION_ROLES,
  ANNOTATION_ROLE,
  getShapeDefaultDimensions
} from '$lib/features/commons/constants';
import { TextAlign } from '$lib/features/commons/types/enums';
import {
  clampToRange,
  PAGE_GRID_SIZE_PX,
  snapPointToPageGrid,
  snapPointWithinBounds
} from '$lib/features/commons/utils/page-grid.utils';
import { createToolStore } from '$lib/features/commons/utils/store.utils.svelte';
import {
  PRINT_STANDARD_TOKENS,
  resolveLayoutSizingTokens
} from '$lib/features/commons/utils/layout-sizing.utils';
import {
  clampFontSize,
  CARTOGRAPHIC_FONT_FAMILY,
  normalizeFontFamily
} from '$lib/features/step-toolbar/fonts.constants';
import {
  getFormatLayoutSizingContext,
  getFormatState
} from '$lib/features/step-toolbar/tools/format/format.store.svelte';
import { basemapService } from '$lib/features/map/services/basemap.service.svelte';
import { m } from '$lib/paraglide/messages';
import { getLocale, type Locale } from '$lib/paraglide/runtime.js';
import type {
  Annotation,
  AnnotationCoordinateSpace,
  AnnotationPlacementPreview,
  AnnotationsState,
  AnnotationStyle,
  PageElementRole
} from '../../types/annotations.types';
import { resolveAnnotationCoordinateSpace } from '../../types/annotations.types';

const ANNOTATION_ID_PREFIX = 'annotation-';
const DEFAULT_NOTE_FONT_SIZE = 8;
const DEFAULT_DRAWING_SMOOTHNESS = 0;

const DEFAULT_STATE: AnnotationsState = {
  visible: true,
  items: [],
  selectedId: null,
  activeType: AnnotationKind.TEXT,
  predefinedStyle: ANNOTATION_ROLE.NOTE,
  textContent: '',
  creationMode: 'idle',
  pendingType: null,
  pendingContent: null,
  pendingStyle: null,
  previewGeometry: null,
  drawingModeType: DrawingType.LINE,
  drawingInProgress: [],
  defaultStyle: {
    font: CARTOGRAPHIC_FONT_FAMILY,
    fontSize: DEFAULT_NOTE_FONT_SIZE,
    bold: false,
    italic: false,
    underlined: false,
    textAlign: TextAlign.Center,
    opacity: 100,
    color: '#000000',
    smoothness: DEFAULT_DRAWING_SMOOTHNESS
  }
};

type AnnotationsActions = {
  setVisibility: (visible: boolean) => void;
  addAnnotation: (type: AnnotationKind, content: string) => void;
  beginPlacement: (type: AnnotationKind, content: unknown) => void;
  updatePlacement: (previewGeometry: AnnotationPlacementPreview | null) => void;
  commitPlacement: (
    previewGeometry?: AnnotationPlacementPreview | null
  ) => Annotation | null;
  cancelPlacement: () => void;
  beginDrawing: (type: DrawingType) => void;
  addDrawingPoint: (point: { x: number; y: number }) => void;
  updateDrawing: (points: { x: number; y: number }[]) => void;
  removeLastDrawingPoint: () => void;
  finishDrawing: () => Annotation | null;
  cancelDrawing: () => void;
  selectAnnotation: (id: string | null) => void;
  updateAnnotation: (id: string, updates: Partial<Annotation>) => void;
  removeAnnotation: (id: string) => void;
  setActiveType: (type: AnnotationKind) => void;
  setPredefinedStyle: (styleName: string) => void;
  setTextContent: (content: string) => void;
  updateDefaultStyle: (styleUpdates: Partial<AnnotationStyle>) => void;
  applyStyle: (styleUpdates: Partial<AnnotationStyle>) => void;
  duplicateAnnotation: (id: string) => void;
  moveAnnotation: (id: string, newPosition: { x: number; y: number }) => void;
  toggleVisibility: (id: string) => void;
  clearAll: () => void;
  toggleStyleProperty: (property: 'bold' | 'italic' | 'underlined') => void;
  setTextAlign: (align: TextAlign) => void;
  initPageElements: (options?: {
    withPlaceholders?: boolean;
    visible?: boolean;
  }) => void;
  refreshPageElementPlaceholders: () => void;
  setPageElementsVisibility: (visible: boolean) => void;
  redistributePageElements: (layout?: {
    width?: number;
    height?: number;
    margins?: {
      top: number;
      bottom: number;
      left: number;
      right: number;
    };
  }) => void;
};

const PREDEFINED_STYLES: Record<string, Partial<AnnotationStyle>> = {
  note: {
    fontSize: DEFAULT_NOTE_FONT_SIZE,
    bold: false,
    italic: false
  },
  title: {
    fontSize: PRINT_STANDARD_TOKENS.annotations.titleFontSize,
    bold: true,
    italic: false,
    textAlign: TextAlign.Left
  },
  subtitle: {
    fontSize: PRINT_STANDARD_TOKENS.annotations.subtitleFontSize,
    bold: false,
    italic: false,
    textAlign: TextAlign.Left
  },
  caption: {
    fontSize: PRINT_STANDARD_TOKENS.annotations.captionFontSize,
    bold: false,
    italic: true
  }
};

function normalizeAnnotationStyleUpdates(
  styleUpdates: Partial<AnnotationStyle>
): Partial<AnnotationStyle> {
  const normalizedUpdates: Partial<AnnotationStyle> = { ...styleUpdates };
  if (styleUpdates.opacity !== undefined) {
    normalizedUpdates.opacity = normalizeOpacityPercent(styleUpdates.opacity);
  }
  if (styleUpdates.font !== undefined) {
    normalizedUpdates.font =
      normalizeFontFamily(styleUpdates.font) ?? CARTOGRAPHIC_FONT_FAMILY;
  }
  if (styleUpdates.fontSize !== undefined) {
    normalizedUpdates.fontSize = clampFontSize(
      styleUpdates.fontSize,
      DEFAULT_NOTE_FONT_SIZE
    );
  }
  return normalizedUpdates;
}

function getPredefinedStyleForItem(item: Annotation): string | null {
  if (item.type !== AnnotationKind.TEXT) {
    return null;
  }

  switch (item.role) {
    case ANNOTATION_ROLE.TITLE:
      return ANNOTATION_ROLE.TITLE;
    case ANNOTATION_ROLE.SUBTITLE:
      return ANNOTATION_ROLE.SUBTITLE;
    case ANNOTATION_ROLE.SOURCE:
    case ANNOTATION_ROLE.BASEMAP_SOURCE:
    case ANNOTATION_ROLE.SIGNATURE:
    case ANNOTATION_ROLE.CREDIT:
      return 'caption';
    case ANNOTATION_ROLE.NOTE:
      return ANNOTATION_ROLE.NOTE;
    default:
      return null;
  }
}

type PageLayout = {
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

type DrawingPoint = {
  x: number;
  y: number;
};

type MapCanvasLayout = {
  width: number;
  height: number;
};

type CoordinateLayout = {
  width: number;
  height: number;
};

type PageElementMessageBundle = {
  annotations_placeholder_title: () => string;
  annotations_placeholder_subtitle: () => string;
  annotations_placeholder_source: () => string;
  annotations_placeholder_note: () => string;
  basemap_source: () => string;
  map_export_signature: () => string;
};

const PAGE_ELEMENT_MESSAGE_BUNDLES = {
  en: {
    annotations_placeholder_title: () =>
      String(m.annotations_placeholder_title({}, { locale: 'en' })),
    annotations_placeholder_subtitle: () =>
      String(m.annotations_placeholder_subtitle({}, { locale: 'en' })),
    annotations_placeholder_source: () =>
      String(m.annotations_placeholder_source({}, { locale: 'en' })),
    annotations_placeholder_note: () =>
      String(m.annotations_placeholder_note({}, { locale: 'en' })),
    basemap_source: () => String(m.basemap_source({}, { locale: 'en' })),
    map_export_signature: () =>
      String(m.map_export_signature({}, { locale: 'en' }))
  },
  fr: {
    annotations_placeholder_title: () =>
      String(m.annotations_placeholder_title({}, { locale: 'fr' })),
    annotations_placeholder_subtitle: () =>
      String(m.annotations_placeholder_subtitle({}, { locale: 'fr' })),
    annotations_placeholder_source: () =>
      String(m.annotations_placeholder_source({}, { locale: 'fr' })),
    annotations_placeholder_note: () =>
      String(m.annotations_placeholder_note({}, { locale: 'fr' })),
    basemap_source: () => String(m.basemap_source({}, { locale: 'fr' })),
    map_export_signature: () =>
      String(m.map_export_signature({}, { locale: 'fr' }))
  }
} satisfies Record<'en' | 'fr', PageElementMessageBundle>;

function isGridEnabled(): boolean {
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

function clampPageElementPosition(
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

function resolvePageLayout(overrides?: {
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

function clampAnnotationPosition(
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

function cloneStyle(
  style: AnnotationStyle | null | undefined
): AnnotationStyle {
  return style ? { ...style } : {};
}

function createAnnotationId(): string {
  return `${ANNOTATION_ID_PREFIX}${Date.now()}`;
}

function buildPendingStyle(
  type: AnnotationKind,
  baseStyle: AnnotationStyle,
  content?: unknown
): AnnotationStyle {
  const nextStyle: AnnotationStyle = { ...baseStyle };

  if (type === AnnotationKind.DRAWING) {
    nextStyle.drawingType = resolveDrawingType(content, baseStyle.drawingType);
  }

  if (type === AnnotationKind.SHAPE) {
    const defaultDimensions = getShapeDefaultDimensions(String(content ?? ''));
    nextStyle.shapeWidth = defaultDimensions.width;
    nextStyle.shapeHeight = defaultDimensions.height;
  }

  return nextStyle;
}

function clearCreationState(state: AnnotationsState): void {
  state.creationMode = 'idle';
  state.pendingType = null;
  state.pendingContent = null;
  state.pendingStyle = null;
  state.previewGeometry = null;
  state.drawingInProgress = [];
}

// Convert a page-space position (origin = page top-left, margins included) to a
// map-area-local position (origin = map frame top-left, margins excluded), the
// space data-anchored `'map'` annotations live in. `annotation-overlay` re-adds
// the margins in `getRenderedPosition`, so the on-screen placement is identical.
function toMapAreaLocalPosition(
  position: { x: number; y: number },
  layout: PageLayout
): { x: number; y: number } {
  return {
    x: position.x - layout.margins.left,
    y: position.y - layout.margins.top
  };
}

// Marks drawn directly on the map — shapes (rectangle/circle/triangle), vector
// arrows/lines and freehand drawings. Text notes (page-elements, `role`) and
// imported images stay page-anchored, so they are excluded here.
const MAP_ANCHORABLE_SHAPE_KINDS: ReadonlySet<AnnotationKind> = new Set([
  AnnotationKind.SHAPE,
  AnnotationKind.DRAWING
]);

// Drawn-on-the-map shapes (no `role`) are created in `'map'` space so they stay
// glued to the basemap. The WGS84 anchor is written by `annotation-overlay` on
// first render (it owns the projection helpers); a `'map'` annotation without an
// anchor renders exactly like the historical page placement, which is also the
// composite-projection fallback.
function anchorShapeToMap(
  annotation: Annotation,
  layout: PageLayout
): Annotation {
  if (annotation.role || !MAP_ANCHORABLE_SHAPE_KINDS.has(annotation.type)) {
    return annotation;
  }

  return {
    ...annotation,
    coordinateSpace: 'map',
    position: toMapAreaLocalPosition(annotation.position, layout)
  };
}

function createPlacedAnnotation(
  previewGeometry: AnnotationPlacementPreview,
  style: AnnotationStyle
): Annotation {
  return {
    id: createAnnotationId(),
    type: previewGeometry.type,
    content: previewGeometry.content,
    position: previewGeometry.position,
    coordinateSpace: previewGeometry.coordinateSpace,
    positionMode: 'manual',
    style: {
      ...style,
      ...(previewGeometry.style ?? {}),
      ...(previewGeometry.type === AnnotationKind.SHAPE
        ? {
            shapeWidth: previewGeometry.size.width,
            shapeHeight: previewGeometry.size.height
          }
        : {})
    }
  };
}

function resolveDrawingType(
  content: unknown,
  fallbackType?: DrawingType
): DrawingType {
  if (content === DrawingType.ZONE) {
    return DrawingType.ZONE;
  }

  if (content === DrawingType.LINE) {
    return DrawingType.LINE;
  }

  return fallbackType ?? DrawingType.LINE;
}

function createDefaultDrawingPoints(type: DrawingType): DrawingPoint[] {
  if (type === DrawingType.ZONE) {
    return [
      { x: 0, y: 0 },
      { x: 132, y: 0 },
      { x: 112, y: 72 },
      { x: 24, y: 72 }
    ];
  }

  return [
    { x: 0, y: 8 },
    { x: 44, y: 0 },
    { x: 92, y: 12 },
    { x: 132, y: 4 }
  ];
}

function getNonPageAnnotationSpawnPosition(
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

function getPageNoteSpawnPosition(
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

function getPageElementPosition(
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

function isBottomRightPageElementRole(role: PageElementRole): boolean {
  return BOTTOM_RIGHT_STACK_ORDER.includes(role);
}

function isTopLeftPageElementRole(role: PageElementRole): boolean {
  return role === ANNOTATION_ROLE.TITLE || role === ANNOTATION_ROLE.SUBTITLE;
}

function shouldSnapAutoPageElement(role: PageElementRole): boolean {
  return isPageElementRole(role);
}

function reconcileAutoPageElementStyle(
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

function isEmptyContent(content: unknown): boolean {
  return typeof content !== 'string' || content.trim().length === 0;
}

function isPageElementRole(role: unknown): role is PageElementRole {
  return (
    typeof role === 'string' &&
    ANNOTATION_ROLES.includes(role as (typeof ANNOTATION_ROLES)[number])
  );
}

function getPageElementDefaultContent(
  role: PageElementRole,
  basemapSource: string,
  withPlaceholders: boolean
): string {
  switch (role) {
    case ANNOTATION_ROLE.TITLE:
      return withPlaceholders ? m.annotations_placeholder_title() : '';
    case ANNOTATION_ROLE.SUBTITLE:
      return withPlaceholders ? m.annotations_placeholder_subtitle() : '';
    case ANNOTATION_ROLE.SOURCE:
      return withPlaceholders ? m.annotations_placeholder_source() : '';
    case ANNOTATION_ROLE.BASEMAP_SOURCE:
      return basemapSource || (withPlaceholders ? m.basemap_source() : '');
    case ANNOTATION_ROLE.SIGNATURE:
      return withPlaceholders ? m.annotations_placeholder_note() : '';
    case ANNOTATION_ROLE.CREDIT:
      return m.map_export_signature();
    case ANNOTATION_ROLE.NOTE:
      return withPlaceholders ? m.annotations_placeholder_note() : '';
    default:
      return '';
  }
}

function resolvePageElementMessageBundle(
  locale: Locale
): PageElementMessageBundle {
  return locale === 'en'
    ? PAGE_ELEMENT_MESSAGE_BUNDLES.en
    : PAGE_ELEMENT_MESSAGE_BUNDLES.fr;
}

function getPageElementDefaultContentForLocale(
  role: PageElementRole,
  basemapSource: string,
  withPlaceholders: boolean,
  locale: Locale
): string {
  const bundle = resolvePageElementMessageBundle(locale);

  switch (role) {
    case ANNOTATION_ROLE.TITLE:
      return withPlaceholders ? bundle.annotations_placeholder_title() : '';
    case ANNOTATION_ROLE.SUBTITLE:
      return withPlaceholders ? bundle.annotations_placeholder_subtitle() : '';
    case ANNOTATION_ROLE.SOURCE:
      return withPlaceholders ? bundle.annotations_placeholder_source() : '';
    case ANNOTATION_ROLE.BASEMAP_SOURCE:
      return basemapSource || (withPlaceholders ? bundle.basemap_source() : '');
    case ANNOTATION_ROLE.SIGNATURE:
      return withPlaceholders ? bundle.annotations_placeholder_note() : '';
    case ANNOTATION_ROLE.CREDIT:
      return bundle.map_export_signature();
    case ANNOTATION_ROLE.NOTE:
      return withPlaceholders ? bundle.annotations_placeholder_note() : '';
    default:
      return '';
  }
}

function getKnownPageElementDefaultContents(
  role: PageElementRole,
  basemapSource: string,
  withPlaceholders: boolean
): Set<string> {
  return new Set(
    (Object.keys(PAGE_ELEMENT_MESSAGE_BUNDLES) as Array<'en' | 'fr'>).map(
      (locale) =>
        getPageElementDefaultContentForLocale(
          role,
          basemapSource,
          withPlaceholders,
          locale
        )
    )
  );
}

function normalizeOpacityPercent(
  opacity: number | undefined
): number | undefined {
  if (opacity === undefined) {
    return undefined;
  }

  const rawValue = Number(opacity);
  if (!Number.isFinite(rawValue)) {
    return undefined;
  }

  const percentValue = rawValue <= 1 ? rawValue * 100 : rawValue;
  return Math.max(0, Math.min(100, percentValue));
}

function getMinimumDrawingPoints(type: DrawingType): number {
  return type === DrawingType.ZONE ? 3 : 2;
}

function normalizeDrawingPoints(points: DrawingPoint[]): DrawingPoint[] {
  const normalized: DrawingPoint[] = [];

  for (const point of points) {
    const previous = normalized[normalized.length - 1];
    if (
      previous &&
      Math.abs(previous.x - point.x) < 1 &&
      Math.abs(previous.y - point.y) < 1
    ) {
      continue;
    }

    normalized.push({
      x: Math.round(point.x * 100) / 100,
      y: Math.round(point.y * 100) / 100
    });
  }

  return normalized;
}

const { actions, getState } = createToolStore<
  AnnotationsState,
  AnnotationsActions
>(
  DEFAULT_STATE,
  (s) => ({
    setVisibility: (visible: boolean) => {
      s.visible = visible;
      if (!visible) {
        s.selectedId = null;
        clearCreationState(s);
      }
    },
    addAnnotation: (type: AnnotationKind, content: string) => {
      if (type === AnnotationKind.TEXT && isEmptyContent(content)) {
        return;
      }

      const layout = resolvePageLayout();
      const drawingType =
        type === AnnotationKind.DRAWING
          ? resolveDrawingType(content, s.defaultStyle.drawingType)
          : null;
      const style = buildPendingStyle(type, s.defaultStyle, content);
      const nonPageItemsCount = s.items.filter(
        (item) => item.role == null
      ).length;
      const bottomRightItemsCount = s.items.filter(
        (item) =>
          isPageElementRole(item.role) &&
          (isBottomRightPageElementRole(item.role) ||
            item.role === ANNOTATION_ROLE.NOTE)
      ).length;
      const normalizedContent =
        type === AnnotationKind.DRAWING && drawingType
          ? createDefaultDrawingPoints(drawingType)
          : content;
      const isFreePageNote = type === AnnotationKind.TEXT;
      const position = isFreePageNote
        ? getPageNoteSpawnPosition(bottomRightItemsCount, layout)
        : getNonPageAnnotationSpawnPosition(
            type,
            style,
            nonPageItemsCount,
            layout,
            'page',
            normalizedContent
          );

      const newAnnotation: Annotation = {
        id: createAnnotationId(),
        type,
        content: normalizedContent,
        position,
        coordinateSpace: 'page',
        positionMode: 'manual',
        style,
        ...(isFreePageNote ? { role: ANNOTATION_ROLE.NOTE } : {})
      };
      s.items = [...s.items, newAnnotation];
      s.selectedId = newAnnotation.id;
      s.activeType = type;
      clearCreationState(s);
    },
    beginPlacement: (type: AnnotationKind, content: unknown) => {
      if (type === AnnotationKind.TEXT && isEmptyContent(content)) {
        return;
      }

      clearCreationState(s);
      s.creationMode = 'placing';
      s.pendingType = type;
      s.pendingContent = content;
      s.pendingStyle = buildPendingStyle(type, s.defaultStyle, content);
      s.previewGeometry = null;
      s.selectedId = null;
      s.activeType = type;
    },
    updatePlacement: (previewGeometry: AnnotationPlacementPreview | null) => {
      if (s.creationMode !== 'placing') {
        return;
      }

      s.previewGeometry = previewGeometry;
    },
    commitPlacement: (previewGeometry?: AnnotationPlacementPreview | null) => {
      if (s.creationMode !== 'placing' || !s.pendingType || !s.pendingStyle) {
        return null;
      }

      const resolvedPreview = previewGeometry ?? s.previewGeometry;
      if (!resolvedPreview) {
        return null;
      }

      const newAnnotation = anchorShapeToMap(
        createPlacedAnnotation(
          {
            ...resolvedPreview,
            content: resolvedPreview.content ?? s.pendingContent
          },
          s.pendingStyle
        ),
        resolvePageLayout()
      );

      s.items = [...s.items, newAnnotation];
      s.selectedId = newAnnotation.id;
      s.activeType = newAnnotation.type;
      clearCreationState(s);

      return newAnnotation;
    },
    cancelPlacement: () => {
      clearCreationState(s);
    },
    selectAnnotation: (id: string | null) => {
      clearCreationState(s);
      s.selectedId = id;
      if (id) {
        const item = s.items.find((i) => i.id === id);
        if (item) {
          s.activeType = item.type;
          const predefinedStyle = getPredefinedStyleForItem(item);
          if (predefinedStyle) {
            s.predefinedStyle = predefinedStyle;
          }
          if (item.style) {
            s.defaultStyle = { ...s.defaultStyle, ...item.style };
          }
        }
      }
    },
    updateAnnotation: (id: string, updates: Partial<Annotation>) => {
      s.items = s.items.map((item) =>
        item.id === id ? { ...item, ...updates } : item
      );
    },
    removeAnnotation: (id: string) => {
      s.items = s.items.filter((item) => item.id !== id);
      if (s.selectedId === id) {
        s.selectedId = null;
      }
    },
    setActiveType: (type: AnnotationKind) => {
      clearCreationState(s);
      if (s.selectedId) {
        const selectedItem = s.items.find((item) => item.id === s.selectedId);
        if (selectedItem?.type !== type) {
          s.selectedId = null;
        }
      }
      s.activeType = type;
    },
    beginDrawing: (type: DrawingType) => {
      clearCreationState(s);
      s.creationMode = 'drawing';
      s.pendingType = AnnotationKind.DRAWING;
      s.pendingContent = type;
      s.pendingStyle = buildPendingStyle(
        AnnotationKind.DRAWING,
        s.defaultStyle,
        type
      );
      s.drawingModeType = type;
      s.selectedId = null;
      s.activeType = AnnotationKind.DRAWING;
    },
    addDrawingPoint: (point: { x: number; y: number }) => {
      if (s.creationMode !== 'drawing') {
        return;
      }

      s.drawingInProgress = [...s.drawingInProgress, point];
    },
    updateDrawing: (points: { x: number; y: number }[]) => {
      if (s.creationMode !== 'drawing') {
        return;
      }

      s.drawingInProgress = [...points];
    },
    removeLastDrawingPoint: () => {
      if (s.creationMode === 'drawing' && s.drawingInProgress.length > 0) {
        s.drawingInProgress = s.drawingInProgress.slice(0, -1);
      }
    },
    finishDrawing: () => {
      const points = normalizeDrawingPoints(s.drawingInProgress);
      if (points.length < getMinimumDrawingPoints(s.drawingModeType)) {
        s.drawingInProgress = points;
        return null;
      }

      const minX = Math.min(...points.map((p) => p.x));
      const minY = Math.min(...points.map((p) => p.y));
      const relativePoints = points.map((p) => ({
        x: p.x - minX,
        y: p.y - minY
      }));

      const layout = resolvePageLayout();
      const style: AnnotationStyle = {
        ...cloneStyle(s.pendingStyle ?? s.defaultStyle),
        drawingType: s.drawingModeType
      };
      const position = clampAnnotationPosition(
        { x: minX, y: minY },
        AnnotationKind.DRAWING,
        style,
        layout,
        'page',
        relativePoints
      );

      const newAnnotation = anchorShapeToMap(
        {
          id: createAnnotationId(),
          type: AnnotationKind.DRAWING,
          content: relativePoints,
          position,
          coordinateSpace: 'page',
          positionMode: 'manual',
          style
        },
        layout
      );

      s.items = [...s.items, newAnnotation];
      s.selectedId = newAnnotation.id;
      s.activeType = AnnotationKind.DRAWING;
      clearCreationState(s);

      return newAnnotation;
    },
    cancelDrawing: () => {
      clearCreationState(s);
    },
    setPredefinedStyle: (styleName: string) => {
      const style = PREDEFINED_STYLES[styleName];
      if (style) {
        s.predefinedStyle = styleName;
        s.defaultStyle = { ...s.defaultStyle, ...style };
        if (s.pendingStyle) {
          s.pendingStyle = { ...s.pendingStyle, ...style };
        }

        if (s.selectedId) {
          s.items = s.items.map((item) =>
            item.id === s.selectedId
              ? { ...item, style: { ...(item.style ?? {}), ...style } }
              : item
          );
        }
      }
    },
    setTextContent: (content: string) => {
      s.textContent = content;
      if (
        s.creationMode === 'placing' &&
        s.pendingType === AnnotationKind.TEXT
      ) {
        s.pendingContent = content;
      }
    },
    updateDefaultStyle: (styleUpdates: Partial<AnnotationStyle>) => {
      const normalizedUpdates = normalizeAnnotationStyleUpdates(styleUpdates);
      s.defaultStyle = { ...s.defaultStyle, ...normalizedUpdates };
      if (s.pendingStyle) {
        s.pendingStyle = { ...s.pendingStyle, ...normalizedUpdates };
      }
    },
    applyStyle: (styleUpdates: Partial<AnnotationStyle>) => {
      const normalizedUpdates = normalizeAnnotationStyleUpdates(styleUpdates);
      s.defaultStyle = { ...s.defaultStyle, ...normalizedUpdates };
      if (s.pendingStyle) {
        s.pendingStyle = { ...s.pendingStyle, ...normalizedUpdates };
      }

      if (s.selectedId) {
        s.items = s.items.map((item) =>
          item.id === s.selectedId
            ? {
                ...item,
                style: { ...(item.style ?? {}), ...normalizedUpdates }
              }
            : item
        );
      }
    },
    duplicateAnnotation: (id: string) => {
      const original = s.items.find((item) => item.id === id);
      if (original) {
        const duplicatedContent =
          original.type === AnnotationKind.TEXT &&
          typeof original.content === 'string'
            ? `${original.content}${m.copy_suffix()}`
            : Array.isArray(original.content)
              ? original.content.map((point) =>
                  typeof point === 'object' && point !== null
                    ? { ...point }
                    : point
                )
              : original.content;

        const duplicate: Annotation = {
          ...original,
          id: createAnnotationId(),
          content: duplicatedContent,
          style: original.style ? { ...original.style } : undefined,
          coordinateSpace: resolveAnnotationCoordinateSpace(original),
          positionMode: 'manual',
          position: snapPointToPageGrid(
            {
              x: original.position.x + 20,
              y: original.position.y + 20
            },
            isGridEnabled()
          )
        };
        s.items = [...s.items, duplicate];
        s.selectedId = duplicate.id;
      }
    },
    moveAnnotation: (id: string, newPosition: { x: number; y: number }) => {
      s.items = s.items.map((item) =>
        item.id === id
          ? {
              ...item,
              coordinateSpace: resolveAnnotationCoordinateSpace(item),
              position: isPageElementRole(item.role)
                ? clampPageElementPosition(
                    newPosition,
                    item.role,
                    resolvePageLayout()
                  )
                : snapPointToPageGrid(newPosition, isGridEnabled()),
              positionMode: 'manual'
            }
          : item
      );
    },
    toggleVisibility: (id: string) => {
      s.items = s.items.map((item) =>
        item.id === id ? { ...item, visible: !item.visible } : item
      );
    },
    clearAll: () => {
      s.items = [];
      s.selectedId = null;
      clearCreationState(s);
    },
    toggleStyleProperty: (property: 'bold' | 'italic' | 'underlined') => {
      const nextValue = !s.defaultStyle[property];
      s.defaultStyle = {
        ...s.defaultStyle,
        [property]: nextValue
      };
      if (s.pendingStyle) {
        s.pendingStyle = {
          ...s.pendingStyle,
          [property]: nextValue
        };
      }
    },
    setTextAlign: (align: TextAlign) => {
      s.defaultStyle = { ...s.defaultStyle, textAlign: align };
      if (s.pendingStyle) {
        s.pendingStyle = { ...s.pendingStyle, textAlign: align };
      }
    },
    initPageElements: (options) => {
      const withPlaceholders = options?.withPlaceholders ?? false;
      const visible = options?.visible ?? true;
      const layout = resolvePageLayout();
      const basemapSource =
        basemapService.currentBasemap?.metadata?.source || '';

      const hasPageElements = s.items.some((item) =>
        isPageElementRole(item.role)
      );
      if (hasPageElements) {
        s.items = s.items.map((item) => {
          if (!isPageElementRole(item.role)) {
            return item;
          }

          const defaultContent = getPageElementDefaultContent(
            item.role,
            basemapSource,
            withPlaceholders
          );
          const positionMode = item.positionMode ?? 'auto';
          const position =
            positionMode === 'manual'
              ? clampPageElementPosition(item.position, item.role, layout)
              : clampPageElementPosition(
                  getPageElementPosition(item.role, layout),
                  item.role,
                  layout,
                  shouldSnapAutoPageElement(item.role)
                );
          const style = reconcileAutoPageElementStyle(
            item.role,
            positionMode,
            item.style
          );

          return {
            ...item,
            visible,
            positionMode,
            position,
            style,
            content:
              withPlaceholders && isEmptyContent(item.content)
                ? defaultContent
                : item.content
          };
        });
        return;
      }

      const fmt = getFormatState();
      const tokens = resolveLayoutSizingTokens(
        getFormatLayoutSizingContext(fmt)
      );

      const pageElements: {
        role: PageElementRole;
        style: Partial<AnnotationStyle>;
      }[] = [
        {
          role: ANNOTATION_ROLE.TITLE,
          style: {
            ...PREDEFINED_STYLES.title,
            fontSize: tokens.annotations.titleFontSize
          }
        },
        {
          role: ANNOTATION_ROLE.SUBTITLE,
          style: {
            ...PREDEFINED_STYLES.subtitle,
            fontSize: tokens.annotations.subtitleFontSize
          }
        },
        {
          role: ANNOTATION_ROLE.SOURCE,
          style: {
            ...PREDEFINED_STYLES.caption,
            fontSize: tokens.annotations.captionFontSize,
            textAlign: TextAlign.Right
          }
        },
        {
          role: ANNOTATION_ROLE.BASEMAP_SOURCE,
          style: {
            ...PREDEFINED_STYLES.caption,
            fontSize: tokens.annotations.captionFontSize,
            textAlign: TextAlign.Right
          }
        },
        {
          role: ANNOTATION_ROLE.SIGNATURE,
          style: {
            ...PREDEFINED_STYLES.caption,
            fontSize: tokens.annotations.captionFontSize,
            textAlign: TextAlign.Right
          }
        },
        {
          role: ANNOTATION_ROLE.CREDIT,
          style: {
            ...PREDEFINED_STYLES.caption,
            fontSize: tokens.annotations.captionFontSize,
            textAlign: TextAlign.Right
          }
        }
      ];

      const timestamp = Date.now();

      const newAnnotations: Annotation[] = pageElements.map((el, index) => ({
        id: `page-element-${el.role}-${timestamp}-${index}`,
        type: AnnotationKind.TEXT,
        content: getPageElementDefaultContent(
          el.role,
          basemapSource,
          withPlaceholders
        ),
        position: clampPageElementPosition(
          getPageElementPosition(el.role, layout),
          el.role,
          layout,
          shouldSnapAutoPageElement(el.role)
        ),
        positionMode: 'auto',
        style: { ...s.defaultStyle, ...el.style },
        role: el.role,
        visible
      }));

      s.items = [...s.items, ...newAnnotations];
    },
    refreshPageElementPlaceholders: () => {
      const basemapSource =
        basemapService.currentBasemap?.metadata?.source || '';
      const locale = getLocale();

      s.items = s.items.map((item) => {
        if (!isPageElementRole(item.role) || typeof item.content !== 'string') {
          return item;
        }

        const knownContents = getKnownPageElementDefaultContents(
          item.role,
          basemapSource,
          true
        );

        if (!knownContents.has(item.content)) {
          return item;
        }

        return {
          ...item,
          content: getPageElementDefaultContentForLocale(
            item.role,
            basemapSource,
            true,
            locale
          )
        };
      });
    },
    setPageElementsVisibility: (visible: boolean) => {
      s.items = s.items.map((item) =>
        isPageElementRole(item.role) ? { ...item, visible } : item
      );
    },
    redistributePageElements: (layoutOverrides) => {
      const layout = resolvePageLayout(layoutOverrides);
      s.items = s.items.map((item) => {
        if (!isPageElementRole(item.role)) {
          return item;
        }

        const style = reconcileAutoPageElementStyle(
          item.role,
          item.positionMode,
          item.style
        );

        if (item.positionMode === 'manual') {
          return {
            ...item,
            style,
            position: clampPageElementPosition(item.position, item.role, layout)
          };
        }

        return {
          ...item,
          positionMode: item.positionMode ?? 'auto',
          style,
          position: clampPageElementPosition(
            getPageElementPosition(item.role, layout),
            item.role,
            layout,
            shouldSnapAutoPageElement(item.role)
          )
        };
      });
    }
  }),
  {
    key: 'annotations',
    serializeFilter: ({
      selectedId: _selectedId,
      textContent: _textContent,
      creationMode: _creationMode,
      pendingType: _pendingType,
      pendingContent: _pendingContent,
      pendingStyle: _pendingStyle,
      previewGeometry: _previewGeometry,
      drawingInProgress: _drawingInProgress,
      activeType: _activeType,
      ...persisted
    }) => persisted
  }
);

export const annotationsActions = actions;
export const getAnnotationsState = getState;
