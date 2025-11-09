import { createResetFunction } from '$lib/features/commons/utils/store.utils';
import { TextAlign } from '$lib/features/commons/types/enums';
import type {
  AnnotationsState,
  AnnotationStyle,
  AnnotationType
} from './annotations.types';

const DEFAULT_ANNOTATIONS_STATE: AnnotationsState = {
  items: [],
  selectedId: null,
  activeType: 'text',
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

export const annotationsState = $state<AnnotationsState>({
  ...DEFAULT_ANNOTATIONS_STATE
});

export function getAnnotationsState(): AnnotationsState {
  return annotationsState;
}

export const annotationsActions = {
  setState(newState: Partial<AnnotationsState>): void {
    Object.assign(annotationsState, newState);
  },

  addAnnotation(
    type: 'text' | 'shape' | 'drawing' | 'image',
    content: string
  ): void {
    const newAnnotation: AnnotationType = {
      id: `annotation-${Date.now()}`,
      type,
      content,
      position: { x: Math.random() * 300 + 50, y: Math.random() * 200 + 50 },
      style: { ...annotationsState.defaultStyle }
    };

    annotationsState.items = [...annotationsState.items, newAnnotation];
    annotationsState.selectedId = newAnnotation.id;
  },

  selectAnnotation(id: string | null): void {
    annotationsState.selectedId = id;
  },

  updateAnnotation(id: string, updates: Partial<AnnotationType>): void {
    annotationsState.items = annotationsState.items.map((item) =>
      item.id === id ? { ...item, ...updates } : item
    );
  },

  removeAnnotation(id: string): void {
    annotationsState.items = annotationsState.items.filter(
      (item) => item.id !== id
    );
    if (annotationsState.selectedId === id) {
      annotationsState.selectedId = null;
    }
  },

  setActiveType(type: 'text' | 'shape' | 'drawing' | 'image'): void {
    annotationsState.activeType = type;
  },

  setPredefinedStyle(styleName: string): void {
    const styles: Record<string, Partial<AnnotationStyle>> = {
      note: { fontSize: 12, bold: false, italic: false },
      title: { fontSize: 24, bold: true, italic: false },
      subtitle: { fontSize: 18, bold: false, italic: false },
      caption: { fontSize: 10, bold: false, italic: true }
    };

    const style = styles[styleName];
    if (style) {
      annotationsState.predefinedStyle = styleName;
      annotationsState.defaultStyle = {
        ...annotationsState.defaultStyle,
        ...style
      };
    }
  },

  setTextContent(content: string): void {
    annotationsState.textContent = content;
  },

  updateDefaultStyle(styleUpdates: Partial<AnnotationStyle>): void {
    annotationsState.defaultStyle = {
      ...annotationsState.defaultStyle,
      ...styleUpdates
    };
  },

  duplicateAnnotation(id: string): void {
    const original = annotationsState.items.find((item) => item.id === id);
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

      annotationsState.items = [...annotationsState.items, duplicate];
      annotationsState.selectedId = duplicate.id;
    }
  },

  moveAnnotation(id: string, newPosition: { x: number; y: number }): void {
    annotationsState.items = annotationsState.items.map((item) =>
      item.id === id ? { ...item, position: newPosition } : item
    );
  },

  toggleVisibility(id: string): void {
    const annotation = annotationsState.items.find((item) => item.id === id);
    if (annotation) {
    }
  },

  clearAll(): void {
    annotationsState.items = [];
    annotationsState.selectedId = null;
  },

  toggleStyleProperty(property: 'bold' | 'italic' | 'underlined'): void {
    const updatedStyle = { ...annotationsState.defaultStyle };

    if (property === 'bold') {
      updatedStyle.bold = !updatedStyle.bold;
    } else if (property === 'italic') {
      updatedStyle.italic = !updatedStyle.italic;
    } else if (property === 'underlined') {
      updatedStyle.underlined = !updatedStyle.underlined;
    }

    annotationsState.defaultStyle = updatedStyle;
  },

  setTextAlign(align: TextAlign): void {
    annotationsState.defaultStyle = {
      ...annotationsState.defaultStyle,
      textAlign: align
    };
  },

  reset: createResetFunction(annotationsState, DEFAULT_ANNOTATIONS_STATE)
};

export function getSelectedAnnotation() {
  if (!annotationsState.selectedId) return null;
  return (
    annotationsState.items.find(
      (item) => item.id === annotationsState.selectedId
    ) || null
  );
}

export function getVisibleAnnotations() {
  return annotationsState.items;
}

export function getAnnotationsByType(
  type: 'text' | 'shape' | 'drawing' | 'image'
) {
  return annotationsState.items.filter((item) => item.type === type);
}
