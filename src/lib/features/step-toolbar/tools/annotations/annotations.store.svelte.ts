import { AnnotationKind } from '$lib/features/commons/constants/ui.constants';
import { TextAlign } from '$lib/features/commons/types/enums';
import { createToolStore } from '$lib/features/commons/utils/store.utils.svelte';
import type {
  Annotation,
  AnnotationsState,
  AnnotationStyle
} from './annotations.types';

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
};

const PREDEFINED_STYLES: Record<string, Partial<AnnotationStyle>> = {
  note: { fontSize: 12, bold: false, italic: false },
  title: { fontSize: 24, bold: true, italic: false },
  subtitle: { fontSize: 18, bold: false, italic: false },
  caption: { fontSize: 10, bold: false, italic: true }
};

const { actions, getState } = createToolStore<
  AnnotationsState,
  AnnotationsActions
>(DEFAULT_STATE, (s) => ({
  addAnnotation: (type: AnnotationKind, content: string) => {
    const newAnnotation: Annotation = {
      id: `annotation-${Date.now()}`,
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
    s.defaultStyle = { ...s.defaultStyle, ...styleUpdates };
  },
  duplicateAnnotation: (id: string) => {
    const original = s.items.find((item) => item.id === id);
    if (original) {
      const duplicate = {
        ...original,
        id: `annotation-${Date.now()}`,
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
  }
}));

export const annotationsActions = actions;
export const getAnnotationsState = getState;
