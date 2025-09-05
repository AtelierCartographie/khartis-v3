import { TextAlign } from '$lib/features/commons/types/enums';
import {
  toolActions,
  toolState
} from '../tools-store/tools.store.svelte';
import type {
  AnnotationsState,
  AnnotationStyle,
  AnnotationType
} from './annotations.types';

export function getAnnotationsState(): AnnotationsState {
  return toolState.annotations;
}

export const annotationsActions = {
  setState(newState: Partial<AnnotationsState>): void {
    toolActions.updateAnnotations(newState);
  },

  addAnnotation(
    type: 'text' | 'shape' | 'drawing' | 'image',
    content: string
  ): void {
    const currentState = getAnnotationsState();
    const newAnnotation: AnnotationType = {
      id: `annotation-${Date.now()}`,
      type,
      content,
      position: { x: Math.random() * 300 + 50, y: Math.random() * 200 + 50 },
      style: { ...currentState.defaultStyle }
    };

    const updatedItems = [...currentState.items, newAnnotation];
    toolActions.updateAnnotations({
      items: updatedItems,
      selectedId: newAnnotation.id
    });

  },

  selectAnnotation(id: string | null): void {
    toolActions.updateAnnotations({ selectedId: id });
  },

  updateAnnotation(id: string, updates: Partial<AnnotationType>): void {
    const currentState = getAnnotationsState();
    const updatedItems = currentState.items.map((item) =>
      item.id === id ? { ...item, ...updates } : item
    );

    if (updatedItems.length > 0) {
      toolActions.updateAnnotations({ items: updatedItems });
    } else {
    }
  },

  removeAnnotation(id: string): void {
    const currentState = getAnnotationsState();
    const annotation = currentState.items.find((item) => item.id === id);
    const updatedItems = currentState.items.filter((item) => item.id !== id);

    const updates: Partial<AnnotationsState> = { items: updatedItems };
    if (currentState.selectedId === id) {
      updates.selectedId = null;
    }

    toolActions.updateAnnotations(updates);

  },

  setActiveType(type: 'text' | 'shape' | 'drawing' | 'image'): void {
    toolActions.updateAnnotations({ activeType: type });
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
      const currentState = getAnnotationsState();
      const updatedDefaultStyle = { ...currentState.defaultStyle, ...style };

      toolActions.updateAnnotations({
        predefinedStyle: styleName,
        defaultStyle: updatedDefaultStyle
      });

    }
  },

  setTextContent(content: string): void {
    toolActions.updateAnnotations({ textContent: content });
  },

  updateDefaultStyle(styleUpdates: Partial<AnnotationStyle>): void {
    const currentState = getAnnotationsState();
    const updatedDefaultStyle = {
      ...currentState.defaultStyle,
      ...styleUpdates
    };
    toolActions.updateAnnotations({ defaultStyle: updatedDefaultStyle });
  },

  duplicateAnnotation(id: string): void {
    const currentState = getAnnotationsState();
    const original = currentState.items.find((item) => item.id === id);
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

      const updatedItems = [...currentState.items, duplicate];
      toolActions.updateAnnotations({
        items: updatedItems,
        selectedId: duplicate.id
      });

    }
  },

  moveAnnotation(id: string, newPosition: { x: number; y: number }): void {
    const currentState = getAnnotationsState();
    const updatedItems = currentState.items.map((item) =>
      item.id === id ? { ...item, position: newPosition } : item
    );

    toolActions.updateAnnotations({ items: updatedItems });
  },

  toggleVisibility(id: string): void {
    const currentState = getAnnotationsState();
    const annotation = currentState.items.find((item) => item.id === id);
    if (annotation) {
    }
  },

  clearAll(): void {
    const currentState = getAnnotationsState();
    toolActions.updateAnnotations({
      items: [],
      selectedId: null
    });
  },

  toggleStyleProperty(property: 'bold' | 'italic' | 'underlined'): void {
    const currentState = getAnnotationsState();
    const updatedStyle = { ...currentState.defaultStyle };

    if (property === 'bold') {
      updatedStyle.bold = !updatedStyle.bold;
    } else if (property === 'italic') {
      updatedStyle.italic = !updatedStyle.italic;
    } else if (property === 'underlined') {
      updatedStyle.underlined = !updatedStyle.underlined;
    }

    toolActions.updateAnnotations({ defaultStyle: updatedStyle });
  },

  setTextAlign(align: TextAlign): void {
    const currentState = getAnnotationsState();
    const updatedStyle = { ...currentState.defaultStyle, textAlign: align };
    toolActions.updateAnnotations({ defaultStyle: updatedStyle });
  },

  reset(): void {
    toolActions.resetTool('annotations');
  }
};

export function getSelectedAnnotation() {
  const currentState = getAnnotationsState();
  if (!currentState.selectedId) return null;
  return (
    currentState.items.find((item) => item.id === currentState.selectedId) ||
    null
  );
}

export function getVisibleAnnotations() {
  const currentState = getAnnotationsState();
  return currentState.items;
}

export function getAnnotationsByType(
  type: 'text' | 'shape' | 'drawing' | 'image'
) {
  const currentState = getAnnotationsState();
  return currentState.items.filter((item) => item.type === type);
}
