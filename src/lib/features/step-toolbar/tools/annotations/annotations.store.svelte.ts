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
import { createToolStore } from '$lib/features/commons/utils/store.utils.svelte';
import {
  getFormatState,
  PAGE_GRID_SIZE_PX
} from '$lib/features/step-toolbar/tools/format/format.store.svelte';
import { basemapService } from '$lib/features/map/services/basemap.service.svelte';
import { m } from '$lib/paraglide/messages';
import { getLocale, type Locale } from '$lib/paraglide/runtime.js';
import type {
  Annotation,
  AnnotationsState,
  AnnotationStyle,
  PageElementRole
} from './annotations.types';

const ANNOTATION_ID_PREFIX = 'annotation-';

const DEFAULT_STATE: AnnotationsState = {
  visible: true,
  items: [],
  selectedId: null,
  activeType: AnnotationKind.TEXT,
  predefinedStyle: ANNOTATION_ROLE.NOTE,
  textContent: '',
  isDrawingMode: false,
  drawingModeType: DrawingType.LINE,
  drawingInProgress: [],
  defaultStyle: {
    font: 'Cabin',
    fontSize: 10,
    bold: false,
    italic: false,
    underlined: false,
    textAlign: TextAlign.Left,
    opacity: 100,
    color: '#000000'
  }
};

type AnnotationsActions = {
  setVisibility: (visible: boolean) => void;
  addAnnotation: (type: AnnotationKind, content: string) => void;
  startDrawingMode: (type: DrawingType) => void;
  addDrawingPoint: (point: { x: number; y: number }) => void;
  setDrawingInProgress: (points: { x: number; y: number }[]) => void;
  removeLastDrawingPoint: () => void;
  finalizeDrawingMode: () => void;
  cancelDrawingMode: () => void;
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
  note: { fontSize: 10, bold: false, italic: false },
  title: { fontSize: 18, bold: true, italic: false },
  subtitle: { fontSize: 14, bold: false, italic: false },
  caption: { fontSize: 8, bold: false, italic: true }
};

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

const PAGE_ELEMENT_WIDTHS: Record<PageElementRole, number> = {
  [ANNOTATION_ROLE.TITLE]: 320,
  [ANNOTATION_ROLE.SUBTITLE]: 320,
  [ANNOTATION_ROLE.SOURCE]: 220,
  [ANNOTATION_ROLE.BASEMAP_SOURCE]: 220,
  [ANNOTATION_ROLE.SIGNATURE]: 220,
  [ANNOTATION_ROLE.CREDIT]: 220,
  [ANNOTATION_ROLE.NOTE]: 220
};

const BOTTOM_RIGHT_STACK_ORDER: PageElementRole[] = [
  ANNOTATION_ROLE.CREDIT,
  ANNOTATION_ROLE.BASEMAP_SOURCE,
  ANNOTATION_ROLE.SIGNATURE,
  ANNOTATION_ROLE.SOURCE
];
const BOTTOM_RIGHT_SAFE_OFFSET = PAGE_GRID_SIZE_PX;
const BOTTOM_RIGHT_STACK_STEP = PAGE_GRID_SIZE_PX * 2;
const PAGE_NOTE_SAFE_OFFSET = 4;
const PAGE_NOTE_HEIGHT = 28;
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isGridEnabled(): boolean {
  return getFormatState().gridEnabled;
}

function snapToGrid(value: number): number {
  if (!isGridEnabled()) {
    return value;
  }

  return Math.round(value / PAGE_GRID_SIZE_PX) * PAGE_GRID_SIZE_PX;
}

function snapPositionToGrid(position: { x: number; y: number }): {
  x: number;
  y: number;
} {
  return {
    x: snapToGrid(position.x),
    y: snapToGrid(position.y)
  };
}

function getGridAlignedBounds(
  min: number,
  max: number
): { min: number; max: number } | null {
  const alignedMin = Math.ceil(min / PAGE_GRID_SIZE_PX) * PAGE_GRID_SIZE_PX;
  const alignedMax = Math.floor(max / PAGE_GRID_SIZE_PX) * PAGE_GRID_SIZE_PX;

  if (alignedMin > alignedMax) {
    return null;
  }

  return { min: alignedMin, max: alignedMax };
}

function clampPageElementPosition(
  position: { x: number; y: number },
  role: PageElementRole,
  layout: PageLayout
): { x: number; y: number } {
  const { width, height, margins } = layout;
  const roleWidth = PAGE_ELEMENT_WIDTHS[role];
  const isFreePageNote = role === ANNOTATION_ROLE.NOTE;
  const minX = isFreePageNote ? PAGE_NOTE_SAFE_OFFSET : margins.left;
  const maxX = Math.max(
    minX,
    isFreePageNote
      ? width - roleWidth - PAGE_NOTE_SAFE_OFFSET
      : width - margins.right - roleWidth
  );
  const minY = isFreePageNote
    ? PAGE_NOTE_SAFE_OFFSET
    : role === ANNOTATION_ROLE.TITLE || role === ANNOTATION_ROLE.SUBTITLE
      ? 12
      : margins.top + 12;
  const maxY = Math.max(
    minY,
    isFreePageNote
      ? height - PAGE_NOTE_HEIGHT - PAGE_NOTE_SAFE_OFFSET
      : height - margins.bottom - 4
  );

  if (!isGridEnabled()) {
    return {
      x: clamp(position.x, minX, maxX),
      y: clamp(position.y, minY, maxY)
    };
  }

  const xGridBounds = getGridAlignedBounds(minX, maxX);
  const yGridBounds = getGridAlignedBounds(minY, maxY);

  return {
    x: xGridBounds
      ? clamp(snapToGrid(position.x), xGridBounds.min, xGridBounds.max)
      : clamp(position.x, minX, maxX),
    y: yGridBounds
      ? clamp(snapToGrid(position.y), yGridBounds.min, yGridBounds.max)
      : clamp(position.y, minY, maxY)
  };
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
  content?: unknown
): { x: number; y: number } {
  const mapLayout = resolveMapCanvasLayout(layout);
  const bounds = getAnnotationBounds(type, style, content);

  const minX = 0;
  const minY = 0;
  const maxX = Math.max(minX, mapLayout.width - bounds.width);
  const maxY = Math.max(minY, mapLayout.height - bounds.height);

  if (!isGridEnabled()) {
    return {
      x: clamp(position.x, minX, maxX),
      y: clamp(position.y, minY, maxY)
    };
  }

  const xGridBounds = getGridAlignedBounds(minX, maxX);
  const yGridBounds = getGridAlignedBounds(minY, maxY);

  return {
    x: xGridBounds
      ? clamp(snapToGrid(position.x), xGridBounds.min, xGridBounds.max)
      : clamp(position.x, minX, maxX),
    y: yGridBounds
      ? clamp(snapToGrid(position.y), yGridBounds.min, yGridBounds.max)
      : clamp(position.y, minY, maxY)
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
  content?: unknown
): { x: number; y: number } {
  const mapLayout = resolveMapCanvasLayout(layout);
  const bounds = getAnnotationBounds(type, style, content);
  const availableVerticalSpace = Math.max(
    0,
    mapLayout.height - NON_PAGE_ANNOTATION_TOP_OFFSET - bounds.height
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

  return clampAnnotationPosition({ x, y }, type, style, layout, content);
}

function getPageNoteSpawnPosition(
  existingNotesCount: number,
  layout: PageLayout
): { x: number; y: number } {
  const noteWidth = PAGE_ELEMENT_WIDTHS[ANNOTATION_ROLE.NOTE];
  const minX = PAGE_NOTE_SAFE_OFFSET;
  const maxX = Math.max(minX, layout.width - noteWidth - PAGE_NOTE_SAFE_OFFSET);
  const topY = PAGE_NOTE_SAFE_OFFSET;
  const bottomY = Math.max(
    topY,
    layout.height - PAGE_NOTE_HEIGHT - PAGE_NOTE_SAFE_OFFSET
  );
  const slots = [
    {
      x: clamp(layout.width - noteWidth - PAGE_NOTE_SAFE_OFFSET, minX, maxX),
      y: topY
    },
    {
      x: clamp((layout.width - noteWidth) / 2, minX, maxX),
      y: topY
    },
    {
      x: clamp(layout.margins.left + 4, minX, maxX),
      y: bottomY
    },
    {
      x: clamp((layout.width - noteWidth) / 2, minX, maxX),
      y: bottomY
    }
  ];

  return snapPositionToGrid(slots[existingNotesCount % slots.length]);
}

function getPageElementPosition(
  role: PageElementRole,
  layout: PageLayout
): { x: number; y: number } {
  const { width, height, margins } = layout;
  const roleWidth = PAGE_ELEMENT_WIDTHS[role];
  const minX = margins.left;
  const maxX = Math.max(minX, width - margins.right - roleWidth);
  const titleX = clamp(margins.left + 4, minX, maxX);
  const rightColumnX = clamp(width - margins.right - roleWidth, minX, maxX);
  const bottomY = height - margins.bottom;
  const minY =
    role === ANNOTATION_ROLE.TITLE || role === ANNOTATION_ROLE.SUBTITLE
      ? 12
      : margins.top + 12;
  const maxY = Math.max(minY, bottomY - 4);
  const bottomStackIndex = BOTTOM_RIGHT_STACK_ORDER.indexOf(role);

  if (bottomStackIndex !== -1) {
    const baseY = bottomY - BOTTOM_RIGHT_SAFE_OFFSET;
    return {
      x: rightColumnX,
      y: clamp(baseY - bottomStackIndex * BOTTOM_RIGHT_STACK_STEP, minY, maxY)
    };
  }

  switch (role) {
    case ANNOTATION_ROLE.TITLE:
      return { x: titleX, y: clamp(24, minY, maxY) };
    case ANNOTATION_ROLE.SUBTITLE:
      return { x: titleX, y: clamp(52, minY, maxY) };
    default:
      return { x: titleX, y: clamp(margins.top + 24, minY, maxY) };
  }
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
      const shapeDimensions =
        type === AnnotationKind.SHAPE
          ? getShapeDefaultDimensions(String(content))
          : null;
      const style: AnnotationStyle = {
        ...s.defaultStyle,
        ...(drawingType ? { drawingType } : {}),
        ...(shapeDimensions
          ? {
              shapeWidth: shapeDimensions.width,
              shapeHeight: shapeDimensions.height
            }
          : {})
      };
      const nonPageItemsCount = s.items.filter(
        (item) => item.role == null
      ).length;
      const pageNoteCount = s.items.filter(
        (item) =>
          item.type === AnnotationKind.TEXT &&
          item.role === ANNOTATION_ROLE.NOTE
      ).length;
      const normalizedContent =
        type === AnnotationKind.DRAWING && drawingType
          ? createDefaultDrawingPoints(drawingType)
          : content;
      const isFreePageNote = type === AnnotationKind.TEXT;
      const position = isFreePageNote
        ? getPageNoteSpawnPosition(pageNoteCount, layout)
        : getNonPageAnnotationSpawnPosition(
            type,
            style,
            nonPageItemsCount,
            layout,
            normalizedContent
          );

      const newAnnotation: Annotation = {
        id: `${ANNOTATION_ID_PREFIX}${Date.now()}`,
        type,
        content: normalizedContent,
        position,
        positionMode: 'manual',
        style,
        ...(isFreePageNote ? { role: ANNOTATION_ROLE.NOTE } : {})
      };
      s.items = [...s.items, newAnnotation];
      s.selectedId = newAnnotation.id;
      if (type === AnnotationKind.TEXT) {
        s.textContent = '';
      }
    },
    selectAnnotation: (id: string | null) => {
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
      s.activeType = type;
    },
    startDrawingMode: (type: DrawingType) => {
      s.isDrawingMode = true;
      s.drawingModeType = type;
      s.drawingInProgress = [];
      s.selectedId = null;
    },
    addDrawingPoint: (point: { x: number; y: number }) => {
      s.drawingInProgress = [...s.drawingInProgress, point];
    },
    setDrawingInProgress: (points: { x: number; y: number }[]) => {
      s.drawingInProgress = [...points];
    },
    removeLastDrawingPoint: () => {
      if (s.drawingInProgress.length > 0) {
        s.drawingInProgress = s.drawingInProgress.slice(0, -1);
      }
    },
    finalizeDrawingMode: () => {
      const points = normalizeDrawingPoints(s.drawingInProgress);
      if (points.length < getMinimumDrawingPoints(s.drawingModeType)) {
        s.drawingInProgress = points;
        return;
      }

      const minX = Math.min(...points.map((p) => p.x));
      const minY = Math.min(...points.map((p) => p.y));
      const relativePoints = points.map((p) => ({
        x: p.x - minX,
        y: p.y - minY
      }));

      const layout = resolvePageLayout();
      const style: AnnotationStyle = {
        ...s.defaultStyle,
        drawingType: s.drawingModeType
      };
      const position = clampAnnotationPosition(
        { x: minX, y: minY },
        AnnotationKind.DRAWING,
        style,
        layout,
        relativePoints
      );

      const newAnnotation: Annotation = {
        id: `${ANNOTATION_ID_PREFIX}${Date.now()}`,
        type: AnnotationKind.DRAWING,
        content: relativePoints,
        position,
        positionMode: 'manual',
        style
      };

      s.items = [...s.items, newAnnotation];
      s.selectedId = newAnnotation.id;
      s.isDrawingMode = false;
      s.drawingInProgress = [];
    },
    cancelDrawingMode: () => {
      s.isDrawingMode = false;
      s.drawingInProgress = [];
    },
    setPredefinedStyle: (styleName: string) => {
      const style = PREDEFINED_STYLES[styleName];
      if (style) {
        s.predefinedStyle = styleName;
        s.defaultStyle = { ...s.defaultStyle, ...style };

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
    },
    updateDefaultStyle: (styleUpdates: Partial<AnnotationStyle>) => {
      const normalizedUpdates: Partial<AnnotationStyle> = { ...styleUpdates };
      if (styleUpdates.opacity !== undefined) {
        normalizedUpdates.opacity = normalizeOpacityPercent(
          styleUpdates.opacity
        );
      }

      s.defaultStyle = { ...s.defaultStyle, ...normalizedUpdates };
    },
    applyStyle: (styleUpdates: Partial<AnnotationStyle>) => {
      const normalizedUpdates: Partial<AnnotationStyle> = { ...styleUpdates };
      if (styleUpdates.opacity !== undefined) {
        normalizedUpdates.opacity = normalizeOpacityPercent(
          styleUpdates.opacity
        );
      }

      s.defaultStyle = { ...s.defaultStyle, ...normalizedUpdates };

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
          id: `${ANNOTATION_ID_PREFIX}${Date.now()}`,
          content: duplicatedContent,
          style: original.style ? { ...original.style } : undefined,
          positionMode: 'manual',
          position: snapPositionToGrid({
            x: original.position.x + 20,
            y: original.position.y + 20
          })
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
              position: snapPositionToGrid(newPosition),
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
    },
    toggleStyleProperty: (property: 'bold' | 'italic' | 'underlined') => {
      s.defaultStyle = {
        ...s.defaultStyle,
        [property]: !s.defaultStyle[property]
      };
    },
    setTextAlign: (align: TextAlign) => {
      s.defaultStyle = { ...s.defaultStyle, textAlign: align };
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
                  layout
                );

          return {
            ...item,
            visible,
            positionMode,
            position,
            content:
              withPlaceholders && isEmptyContent(item.content)
                ? defaultContent
                : item.content
          };
        });
        return;
      }

      const pageElements: {
        role: PageElementRole;
        style: Partial<AnnotationStyle>;
      }[] = [
        { role: ANNOTATION_ROLE.TITLE, style: { ...PREDEFINED_STYLES.title } },
        {
          role: ANNOTATION_ROLE.SUBTITLE,
          style: { ...PREDEFINED_STYLES.subtitle }
        },
        {
          role: ANNOTATION_ROLE.SOURCE,
          style: { ...PREDEFINED_STYLES.caption }
        },
        {
          role: ANNOTATION_ROLE.BASEMAP_SOURCE,
          style: { ...PREDEFINED_STYLES.caption }
        },
        {
          role: ANNOTATION_ROLE.SIGNATURE,
          style: { ...PREDEFINED_STYLES.caption }
        },
        {
          role: ANNOTATION_ROLE.CREDIT,
          style: { ...PREDEFINED_STYLES.caption }
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
          layout
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

        if (item.positionMode === 'manual') {
          return {
            ...item,
            position: clampPageElementPosition(item.position, item.role, layout)
          };
        }

        return {
          ...item,
          positionMode: item.positionMode ?? 'auto',
          position: clampPageElementPosition(
            getPageElementPosition(item.role, layout),
            item.role,
            layout
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
      isDrawingMode: _isDrawingMode,
      drawingInProgress: _drawingInProgress,
      ...persisted
    }) => persisted
  }
);

export const annotationsActions = actions;
export const getAnnotationsState = getState;
