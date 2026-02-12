import { AnnotationKind } from '$lib/features/commons/constants/ui.constants';
import { TextAlign } from '$lib/features/commons/types/enums';
import { createToolStore } from '$lib/features/commons/utils/store.utils.svelte';
import { getFormatState } from '$lib/features/step-toolbar/tools/format/format.store.svelte';
import { basemapService } from '$lib/features/map/services/basemap.service.svelte';
import type {
  Annotation,
  AnnotationsState,
  AnnotationStyle,
  PageElementRole
} from './annotations.types';

const ANNOTATION_ID_PREFIX = 'annotation-';

const DEFAULT_STATE: AnnotationsState = {
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
    color: '#000000'
  }
};

type AnnotationsActions = {
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
  initPageElements: () => void;
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
  const titleX = margins.left + 4;
  const rightColumnX = Math.max(margins.left, width - margins.right - 220);
  const bottomY = height - margins.bottom;

  switch (role) {
    case 'title':
      return { x: titleX, y: margins.top + 24 };
    case 'subtitle':
      return { x: titleX, y: margins.top + 52 };
    case 'source':
      return { x: rightColumnX, y: bottomY - 46 };
    case 'basemap_source':
      return { x: rightColumnX, y: bottomY - 32 };
    case 'signature':
      return { x: rightColumnX, y: bottomY - 18 };
    case 'credit':
      return { x: rightColumnX, y: bottomY - 4 };
    default:
      return { x: titleX, y: margins.top + 24 };
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
  addAnnotation: (type: AnnotationKind, content: string) => {
    const newAnnotation: Annotation = {
      id: `${ANNOTATION_ID_PREFIX}${Date.now()}`,
      type,
      content,
      position: { x: Math.random() * 300 + 50, y: Math.random() * 200 + 50 },
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
        position: {
          x: original.position.x + 20,
          y: original.position.y + 20
        }
      };
      s.items = [...s.items, duplicate];
      s.selectedId = duplicate.id;
    }
  },
  moveAnnotation: (id: string, newPosition: { x: number; y: number }) => {
    s.items = s.items.map((item) =>
      item.id === id ? { ...item, position: newPosition } : item
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
  initPageElements: () => {
    // Guard: don't create if page elements already exist
    const hasPageElements = s.items.some((item) => item.role != null);
    if (hasPageElements) return;

    const layout = resolvePageLayout();

    const basemapSource = basemapService.currentBasemap?.metadata?.source || '';

    const pageElements: {
      role: PageElementRole;
      content: string;
      style: Partial<AnnotationStyle>;
      position: { x: number; y: number };
    }[] = [
      {
        role: 'title',
        content: '',
        style: { ...PREDEFINED_STYLES.title },
        position: getPageElementPosition('title', layout)
      },
      {
        role: 'subtitle',
        content: '',
        style: { ...PREDEFINED_STYLES.subtitle },
        position: getPageElementPosition('subtitle', layout)
      },
      {
        role: 'source',
        content: '',
        style: { ...PREDEFINED_STYLES.caption },
        position: getPageElementPosition('source', layout)
      },
      {
        role: 'basemap_source',
        content: basemapSource,
        style: { ...PREDEFINED_STYLES.caption },
        position: getPageElementPosition('basemap_source', layout)
      },
      {
        role: 'signature',
        content: '',
        style: { ...PREDEFINED_STYLES.caption },
        position: getPageElementPosition('signature', layout)
      },
      {
        role: 'credit',
        content: 'Réalisé avec Khartis',
        style: { ...PREDEFINED_STYLES.caption },
        position: getPageElementPosition('credit', layout)
      }
    ];

    const newAnnotations: Annotation[] = pageElements.map((el, index) => ({
      id: `page-element-${el.role}-${Date.now()}-${index}`,
      type: AnnotationKind.TEXT,
      content: el.content,
      position: el.position,
      style: { ...s.defaultStyle, ...el.style },
      role: el.role
    }));

    s.items = [...s.items, ...newAnnotations];
  },
  redistributePageElements: (layoutOverrides) => {
    const layout = resolvePageLayout(layoutOverrides);
    s.items = s.items.map((item) => {
      if (!item.role) {
        return item;
      }

      return {
        ...item,
        position: getPageElementPosition(item.role, layout)
      };
    });
  }
}));

export const annotationsActions = actions;
export const getAnnotationsState = getState;
