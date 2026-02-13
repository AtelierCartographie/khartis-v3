import { AnnotationKind } from '$lib/features/commons/constants/ui.constants';
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
  predefinedStyle: 'default',
  textContent: '',
  defaultStyle: {
    font: 'cabin',
    fontSize: 14,
    bold: false,
    italic: false,
    underlined: false,
    textAlign: TextAlign.Left,
    opacity: 100,
    color: '#ffffff'
  }
};

type AnnotationsActions = {
  setVisibility: (visible: boolean) => void;
  addAnnotation: (type: AnnotationKind, content: string) => void;
  selectAnnotation: (id: string | null) => void;
  updateAnnotation: (id: string, updates: Partial<Annotation>) => void;
  removeAnnotation: (id: string) => void;
  setActiveType: (type: AnnotationKind) => void;
  setPredefinedStyle: (styleName: string) => void;
  setTextContent: (content: string) => void;
  updateDefaultStyle: (styleUpdates: Partial<AnnotationStyle>) => void;
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
  title: 320,
  subtitle: 320,
  source: 220,
  basemap_source: 220,
  signature: 220,
  credit: 220
};

const BOTTOM_RIGHT_STACK_ORDER: PageElementRole[] = [
  'credit',
  'basemap_source',
  'signature',
  'source'
];
const BOTTOM_RIGHT_SAFE_OFFSET = PAGE_GRID_SIZE_PX;
const BOTTOM_RIGHT_STACK_STEP = PAGE_GRID_SIZE_PX * 2;

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
    case 'title':
      return { x: titleX, y: clamp(margins.top + 24, minY, maxY) };
    case 'subtitle':
      return { x: titleX, y: clamp(margins.top + 52, minY, maxY) };
    default:
      return { x: titleX, y: clamp(margins.top + 24, minY, maxY) };
  }
}

function isEmptyContent(content: unknown): boolean {
  return typeof content !== 'string' || content.trim().length === 0;
}

function getPageElementDefaultContent(
  role: PageElementRole,
  basemapSource: string,
  withPlaceholders: boolean
): string {
  switch (role) {
    case 'title':
      return withPlaceholders ? m.annotations_style_title() : '';
    case 'subtitle':
      return withPlaceholders ? m.annotations_style_subtitle() : '';
    case 'source':
      return withPlaceholders ? m.source() : '';
    case 'basemap_source':
      return basemapSource || (withPlaceholders ? m.basemap_source() : '');
    case 'signature':
      return withPlaceholders ? m.annotations_note() : '';
    case 'credit':
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
>(DEFAULT_STATE, (s) => ({
  setVisibility: (visible: boolean) => {
    s.visible = visible;
    if (!visible) {
      s.selectedId = null;
    }
  },
  addAnnotation: (type: AnnotationKind, content: string) => {
    const position = snapPositionToGrid({
      x: Math.random() * 300 + 50,
      y: Math.random() * 200 + 50
    });
    const newAnnotation: Annotation = {
      id: `${ANNOTATION_ID_PREFIX}${Date.now()}`,
      type,
      content,
      position,
      style: { ...s.defaultStyle }
    };
    s.items = [...s.items, newAnnotation];
    s.selectedId = newAnnotation.id;
  },
  selectAnnotation: (id: string | null) => {
    s.selectedId = id;
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
  setPredefinedStyle: (styleName: string) => {
    const style = PREDEFINED_STYLES[styleName];
    if (style) {
      s.predefinedStyle = styleName;
      s.defaultStyle = { ...s.defaultStyle, ...style };
    }
  },
  setTextContent: (content: string) => {
    s.textContent = content;
  },
  updateDefaultStyle: (styleUpdates: Partial<AnnotationStyle>) => {
    const normalizedUpdates: Partial<AnnotationStyle> = { ...styleUpdates };
    if (styleUpdates.opacity !== undefined) {
      normalizedUpdates.opacity = normalizeOpacityPercent(styleUpdates.opacity);
    }

    s.defaultStyle = { ...s.defaultStyle, ...normalizedUpdates };
  },
  duplicateAnnotation: (id: string) => {
    const original = s.items.find((item) => item.id === id);
    if (original) {
      const duplicate = {
        ...original,
        id: `${ANNOTATION_ID_PREFIX}${Date.now()}`,
        content: original.content + ' (copie)',
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
    const basemapSource = basemapService.currentBasemap?.metadata?.source || '';

    const hasPageElements = s.items.some((item) => item.role != null);
    if (hasPageElements) {
      s.items = s.items.map((item) => {
        if (!item.role) {
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
      { role: 'title', style: { ...PREDEFINED_STYLES.title } },
      { role: 'subtitle', style: { ...PREDEFINED_STYLES.subtitle } },
      { role: 'source', style: { ...PREDEFINED_STYLES.caption } },
      { role: 'basemap_source', style: { ...PREDEFINED_STYLES.caption } },
      { role: 'signature', style: { ...PREDEFINED_STYLES.caption } },
      { role: 'credit', style: { ...PREDEFINED_STYLES.caption } }
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
    s.items = s.items.map((item) => (item.role ? { ...item, visible } : item));
  },
  redistributePageElements: (layoutOverrides) => {
    const layout = resolvePageLayout(layoutOverrides);
    s.items = s.items.map((item) => {
      if (!item.role) {
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
}));

export const annotationsActions = actions;
export const getAnnotationsState = getState;
