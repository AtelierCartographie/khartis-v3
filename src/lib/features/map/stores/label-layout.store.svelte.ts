import type { Layer } from '@deck.gl/core';

import {
  persistenceRegistry,
  SavePriority
} from '$lib/features/project-management/core';

import {
  DEFAULT_LABEL_LEADER_STYLE,
  parseLabelLayouts,
  roundLabelOffset,
  type LabelLayout,
  type LabelLayouts,
  type LabelLeaderStyle,
  type LabelOffset
} from '../utils/label-layout.utils';

const PERSISTENCE_KEY = 'labelLayouts';

export interface DraggedLabel {
  vizId: string;
  featureKey: string;
}

/**
 * Manual label positions and leader style per visualization, plus the
 * transient state of a drag: the dragged label is left out of the thematic
 * layers and drawn by `dragPreview`, so a pointer move never rebuilds them.
 */
function createLabelLayoutStore() {
  let layouts = $state.raw<LabelLayouts>({});
  let version = $state(0);
  let draggedLabel = $state.raw<DraggedLabel | null>(null);
  let dragPreview = $state.raw<Layer[] | null>(null);

  function notifyPersistence(): void {
    persistenceRegistry.notifyChange(PERSISTENCE_KEY, SavePriority.DEBOUNCED);
  }

  function writeLayout(vizId: string, layout: LabelLayout): void {
    const isDefault =
      Object.keys(layout.offsets).length === 0 &&
      layout.leaderStyle === DEFAULT_LABEL_LEADER_STYLE;
    const next = { ...layouts };
    if (isDefault) {
      delete next[vizId];
    } else {
      next[vizId] = layout;
    }
    layouts = next;
    version += 1;
    notifyPersistence();
  }

  function readLayout(vizId: string): LabelLayout {
    return (
      layouts[vizId] ?? {
        leaderStyle: DEFAULT_LABEL_LEADER_STYLE,
        offsets: {}
      }
    );
  }

  function setOffset(
    vizId: string,
    featureKey: string,
    offset: LabelOffset
  ): void {
    const layout = readLayout(vizId);
    writeLayout(vizId, {
      ...layout,
      offsets: { ...layout.offsets, [featureKey]: roundLabelOffset(offset) }
    });
  }

  function clearOffset(vizId: string, featureKey: string): void {
    const layout = readLayout(vizId);
    if (!Object.prototype.hasOwnProperty.call(layout.offsets, featureKey)) {
      return;
    }
    const offsets = { ...layout.offsets };
    delete offsets[featureKey];
    writeLayout(vizId, { ...layout, offsets });
  }

  function clearOffsets(vizId: string): void {
    const layout = readLayout(vizId);
    if (Object.keys(layout.offsets).length === 0) return;
    writeLayout(vizId, { ...layout, offsets: {} });
  }

  function setLeaderStyle(vizId: string, leaderStyle: LabelLeaderStyle): void {
    const layout = readLayout(vizId);
    if (layout.leaderStyle === leaderStyle) return;
    writeLayout(vizId, { ...layout, leaderStyle });
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
    notifyPersistence();
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
    getLayout(vizId: string): LabelLayout {
      return readLayout(vizId);
    },
    getOffset(vizId: string, featureKey: string): LabelOffset | undefined {
      const offsets = layouts[vizId]?.offsets;
      return offsets &&
        Object.prototype.hasOwnProperty.call(offsets, featureKey)
        ? offsets[featureKey]
        : undefined;
    },
    countOffsets(vizId: string): number {
      return Object.keys(layouts[vizId]?.offsets ?? {}).length;
    },
    setOffset,
    clearOffset,
    clearOffsets,
    setLeaderStyle,
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
