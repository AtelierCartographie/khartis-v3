import type { TooltipEntry } from '../types';

export interface MapTooltipState {
  /** Whether a tooltip should be visible */
  visible: boolean;
  /** Screen coordinates (relative to viewport) */
  x: number;
  y: number;
  /** Data entries to display */
  entries: TooltipEntry[];
  /** Whether the tooltip is pinned (clicked) vs following hover */
  pinned: boolean;
  /** Layer ID that the tooltip is associated with (for highlight) */
  layerId: string | null;
  /** Row index in the picked layer */
  rowIndex: number;
}

const INITIAL_STATE: MapTooltipState = {
  visible: false,
  x: 0,
  y: 0,
  entries: [],
  pinned: false,
  layerId: null,
  rowIndex: -1
};

function createMapTooltipStore() {
  let state = $state<MapTooltipState>({ ...INITIAL_STATE });

  function showAtHover(
    x: number,
    y: number,
    entries: TooltipEntry[],
    layerId: string | null,
    rowIndex: number
  ): void {
    if (state.pinned) return;
    state = {
      visible: true,
      x,
      y,
      entries,
      pinned: false,
      layerId,
      rowIndex
    };
  }

  function pin(): void {
    if (!state.visible) return;
    state = { ...state, pinned: true };
  }

  function pinAt(
    x: number,
    y: number,
    entries: TooltipEntry[],
    layerId: string | null,
    rowIndex: number
  ): void {
    state = {
      visible: true,
      x,
      y,
      entries,
      pinned: true,
      layerId,
      rowIndex
    };
  }

  function hide(): void {
    if (state.pinned) return;
    state = { ...INITIAL_STATE };
  }

  function unpin(): void {
    state = { ...INITIAL_STATE };
  }

  return {
    get state(): MapTooltipState {
      return state;
    },
    get visible(): boolean {
      return state.visible;
    },
    get pinned(): boolean {
      return state.pinned;
    },
    showAtHover,
    pin,
    pinAt,
    hide,
    unpin
  };
}

export const mapTooltipStore = createMapTooltipStore();
