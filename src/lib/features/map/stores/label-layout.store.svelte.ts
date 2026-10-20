import type { Layer } from '@deck.gl/core';

import {
  persistenceRegistry,
  SavePriority
} from '$lib/features/project-management/core';

import {
  parseLabelLayouts,
  roundLabelOffset,
  type LabelLayouts,
  type LabelOffset
} from '../utils/label-layout.utils';

const PERSISTENCE_KEY = 'labelLayouts';

export interface DraggedLabel {
  vizId: string;
  featureKey: string;
}

/**
 * Manual label positions per visualization, plus the transient state of a
 * drag: the dragged label is left out of the thematic layers and drawn by
 * `dragPreview`, so a pointer move never rebuilds them.
 */
function createLabelLayoutStore() {
  let layouts = $state.raw<LabelLayouts>({});
  let version = $state(0);
  let draggedLabel = $state.raw<DraggedLabel | null>(null);
  let dragPreview = $state.raw<Layer[] | null>(null);

  function writeOffsets(
    vizId: string,
    offsets: Record<string, LabelOffset>
  ): void {
    const next = { ...layouts };
    if (Object.keys(offsets).length === 0) {
      delete next[vizId];
    } else {
      next[vizId] = offsets;
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
    writeOffsets(vizId, {
      ...layouts[vizId],
      [featureKey]: roundLabelOffset(offset)
    });
  }

  function clearOffset(vizId: string, featureKey: string): void {
    const offsets = layouts[vizId];
    if (
      !offsets ||
      !Object.prototype.hasOwnProperty.call(offsets, featureKey)
    ) {
      return;
    }
    const next = { ...offsets };
    delete next[featureKey];
    writeOffsets(vizId, next);
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
      const offsets = layouts[vizId];
      return offsets &&
        Object.prototype.hasOwnProperty.call(offsets, featureKey)
        ? offsets[featureKey]
        : undefined;
    },
    setOffset,
    clearOffset,
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
