import {
  AnnotationKind,
  DrawingType
} from '$lib/features/commons/constants/ui.constants';
import {
  ANNOTATION_ROLES,
  ANNOTATION_ROLE
} from '$lib/features/commons/constants';
import { TextAlign } from '$lib/features/commons/types/enums';
import { createToolStore } from '$lib/features/commons/utils/store.utils.svelte';
import {
  getFormatState,
  PAGE_GRID_SIZE_PX
} from '$lib/features/step-toolbar/tools/format/format.store.svelte';
import { basemapService } from '$lib/features/map/services/basemap.service.svelte';
import { m } from '$lib/paraglide/messages';
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
    fontSize: 12,
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
  note: { fontSize: 12, bold: false, italic: false },
  title: { fontSize: 24, bold: true, italic: false },
  subtitle: { fontSize: 18, bold: false, italic: false },
  caption: { fontSize: 10, bold: false, italic: true }
};

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
  [ANNOTATION_ROLE.CREDIT]: 220
};

const BOTTOM_RIGHT_STACK_ORDER: PageElementRole[] = [
  ANNOTATION_ROLE.CREDIT,
  ANNOTATION_ROLE.BASEMAP_SOURCE,
  ANNOTATION_ROLE.SIGNATURE,
  ANNOTATION_ROLE.SOURCE
];
const BOTTOM_RIGHT_SAFE_OFFSET = PAGE_GRID_SIZE_PX;
const BOTTOM_RIGHT_STACK_STEP = PAGE_GRID_SIZE_PX * 2;
const NON_PAGE_ANNOTATION_TOP_OFFSET = PAGE_GRID_SIZE_PX * 2;
const NON_PAGE_ANNOTATION_RIGHT_OFFSET = PAGE_GRID_SIZE_PX * 2;
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
  const minX = margins.left;
  const maxX = Math.max(minX, width - margins.right - roleWidth);
  const minY = margins.top + 12;
  const maxY = Math.max(minY, height - margins.bottom - 4);

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
  style: AnnotationStyle
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

  return DEFAULT_ANNOTATION_BOUNDS[type];
}

function clampAnnotationPosition(
  position: { x: number; y: number },
  type: AnnotationKind,
  style: AnnotationStyle,
  layout: PageLayout
): { x: number; y: number } {
  const mapLayout = resolveMapCanvasLayout(layout);
  const bounds = getAnnotationBounds(type, style);

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
  layout: PageLayout
): { x: number; y: number } {
  const mapLayout = resolveMapCanvasLayout(layout);
  const bounds = getAnnotationBounds(type, style);
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

  const x =
    mapLayout.width -
    NON_PAGE_ANNOTATION_RIGHT_OFFSET -
    bounds.width -
    column * NON_PAGE_ANNOTATION_COLUMN_STEP;
  const y = NON_PAGE_ANNOTATION_TOP_OFFSET + row * NON_PAGE_ANNOTATION_ROW_STEP;

  return clampAnnotationPosition({ x, y }, type, style, layout);
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
  const minY = margins.top + 12;
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
      return { x: titleX, y: clamp(margins.top + 24, minY, maxY) };
    case ANNOTATION_ROLE.SUBTITLE:
      return { x: titleX, y: clamp(margins.top + 52, minY, maxY) };
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
    ANNOTATION_ROLES.includes(role as (typeof ANNOTATION_ROLES)[number]) &&
    role !== ANNOTATION_ROLE.NOTE
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
    default:
      return '';
  }
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
      const style: AnnotationStyle = {
        ...s.defaultStyle,
        ...(drawingType ? { drawingType } : {})
      };
      const nonPageItemsCount = s.items.filter(
        (item) => item.role == null
      ).length;
      const position = getNonPageAnnotationSpawnPosition(
        type,
        style,
        nonPageItemsCount,
        layout
      );
      const normalizedContent =
        type === AnnotationKind.DRAWING && drawingType
          ? createDefaultDrawingPoints(drawingType)
          : content;

      const newAnnotation: Annotation = {
        id: `${ANNOTATION_ID_PREFIX}${Date.now()}`,
        type,
        content: normalizedContent,
        position,
        style
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
    removeLastDrawingPoint: () => {
      if (s.drawingInProgress.length > 0) {
        s.drawingInProgress = s.drawingInProgress.slice(0, -1);
      }
    },
    finalizeDrawingMode: () => {
      const points = s.drawingInProgress;
      if (points.length < 2) {
        s.isDrawingMode = false;
        s.drawingInProgress = [];
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
        layout
      );

      const newAnnotation: Annotation = {
        id: `${ANNOTATION_ID_PREFIX}${Date.now()}`,
        type: AnnotationKind.DRAWING,
        content: relativePoints,
        position,
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

        const duplicate = {
          ...original,
          id: `${ANNOTATION_ID_PREFIX}${Date.now()}`,
          content: duplicatedContent,
          style: original.style ? { ...original.style } : undefined,
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
          ? { ...item, position: snapPositionToGrid(newPosition) }
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

          return {
            ...item,
            visible,
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
        style: { ...s.defaultStyle, ...el.style },
        role: el.role,
        visible
      }));

      s.items = [...s.items, ...newAnnotations];
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

        return {
          ...item,
          position: clampPageElementPosition(
            getPageElementPosition(item.role, layout),
            item.role,
            layout
          )
        };
      });
    }
  }),
  { key: 'annotations' }
);

export const annotationsActions = actions;
export const getAnnotationsState = getState;
