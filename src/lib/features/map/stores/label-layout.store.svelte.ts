import type { Layer } from '@deck.gl/core';

import {
  persistenceRegistry,
  SavePriority
} from '$lib/features/project-management/core';

import {
  normalizeLabelText,
  parseLabelLayouts,
  roundLabelOffset,
  type LabelLayout,
  type LabelLayouts,
  type LabelOffset,
  type LabelTextOverride
} from '../utils/label-layout.utils';

const PERSISTENCE_KEY = 'labelLayouts';

export interface DraggedLabel {
  vizId: string;
  featureKey: string;
}

const EMPTY_LAYOUT: LabelLayout = { offsets: {}, texts: {} };

function hasOwn(record: object | undefined, key: string): boolean {
  return !!record && Object.prototype.hasOwnProperty.call(record, key);
}

/**
 * Manual label positions and texts per visualization, plus the transient state of a
 * drag: the dragged label is left out of the thematic layers and drawn by
 * `dragPreview`, so a pointer move never rebuilds them.
 */
function createLabelLayoutStore() {
  let layouts = $state.raw<LabelLayouts>({});
  let version = $state(0);
  let draggedLabel = $state.raw<DraggedLabel | null>(null);
  let dragPreview = $state.raw<Layer[] | null>(null);

  function writeLayout(vizId: string, layout: LabelLayout): void {
    const next = { ...layouts };
    if (
      Object.keys(layout.offsets).length === 0 &&
      Object.keys(layout.texts).length === 0
    ) {
      delete next[vizId];
    } else {
      next[vizId] = layout;
    }
    layouts = next;
    version += 1;
    persistenceRegistry.notifyChange(PERSISTENCE_KEY, SavePriority.DEBOUNCED);
  }

  function setOffset(
    vizId: string,
    featureKey: string,
    offset: LabelOffset
  ): void {
    const layout = layouts[vizId] ?? EMPTY_LAYOUT;
    writeLayout(vizId, {
      ...layout,
      offsets: { ...layout.offsets, [featureKey]: roundLabelOffset(offset) }
    });
  }

  function clearOffset(vizId: string, featureKey: string): void {
    const layout = layouts[vizId];
    if (!layout || !hasOwn(layout.offsets, featureKey)) return;
    const offsets = { ...layout.offsets };
    delete offsets[featureKey];
    writeLayout(vizId, { ...layout, offsets });
  }

  /** Blank fields fall back to the data value. */
  function setText(
    vizId: string,
    featureKey: string,
    override: LabelTextOverride
  ): void {
    const layout = layouts[vizId] ?? EMPTY_LAYOUT;
    const primary = normalizeLabelText(override.primary);
    const secondary = normalizeLabelText(override.secondary);
    const texts = { ...layout.texts };
    if (primary || secondary) {
      texts[featureKey] = {
        ...(primary && { primary }),
        ...(secondary && { secondary })
      };
    } else if (hasOwn(texts, featureKey)) {
      delete texts[featureKey];
    } else {
      return;
    }
    writeLayout(vizId, { ...layout, texts });
  }

  // Drag state is never saved: it only lives while the pointer is down.
  function beginDrag(label: DraggedLabel, preview: Layer[]): void {
    draggedLabel = label;
    dragPreview = preview;
    version += 1;
  }

  function updateDragPreview(preview: Layer[]): void {
    if (draggedLabel) {
      dragPreview = preview;
    }
  }

  function endDrag(): void {
    if (!draggedLabel && !dragPreview) return;
    draggedLabel = null;
    dragPreview = null;
    version += 1;
  }

  function restoreFromSerialized(data: unknown): void {
    layouts = parseLabelLayouts(data);
    draggedLabel = null;
    dragPreview = null;
    version += 1;
  }

  function reset(): void {
    layouts = {};
    draggedLabel = null;
    dragPreview = null;
    version += 1;
    persistenceRegistry.notifyChange(PERSISTENCE_KEY, SavePriority.DEBOUNCED);
  }

  return {
    get version(): number {
      return version;
    },
    get layouts(): LabelLayouts {
      return layouts;
    },
    get draggedLabel(): DraggedLabel | null {
      return draggedLabel;
    },
    get dragPreview(): Layer[] | null {
      return dragPreview;
    },
    getOffset(vizId: string, featureKey: string): LabelOffset | undefined {
      const offsets = layouts[vizId]?.offsets;
      return hasOwn(offsets, featureKey) ? offsets?.[featureKey] : undefined;
    },
    getText(vizId: string, featureKey: string): LabelTextOverride | undefined {
      const texts = layouts[vizId]?.texts;
      return hasOwn(texts, featureKey) ? texts?.[featureKey] : undefined;
    },
    setOffset,
    clearOffset,
    setText,
    beginDrag,
    updateDragPreview,
    endDrag,
    restoreFromSerialized,
    reset
  };
}

export const labelLayoutStore = createLabelLayoutStore();

persistenceRegistry.register<LabelLayouts>({
  key: PERSISTENCE_KEY,
  serialize: () => labelLayoutStore.layouts,
  deserialize: (data) => labelLayoutStore.restoreFromSerialized(data),
  reset: () => labelLayoutStore.reset(),
  priority: SavePriority.DEBOUNCED
});
