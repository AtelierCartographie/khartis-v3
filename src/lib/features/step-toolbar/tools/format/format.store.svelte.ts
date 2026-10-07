import {
  DEFAULT_MARGINS,
  FormatMode,
  PAGE_PRESETS,
  PageModel
} from '$lib/features/commons/constants/ui.constants';
import type { LayoutSizingContext } from '$lib/features/commons/utils/layout-sizing.utils';
import {
  createReadonlyStateFacade,
  createToolStore
} from '$lib/features/commons/utils/store.utils.svelte';
import type { FormatState } from '../../types/format.types';

const HUE_MAX = 359;
const PERCENTAGE_MAX = 100;

export const DEFAULT_PAGE_COLOR: FormatState['color'] = {
  hue: 0,
  saturation: 0,
  lightness: 100
};

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeColorChannel(
  value: number,
  min: number,
  max: number,
  fallback: number
): number {
  const rounded = Math.round(value);

  if (!Number.isFinite(rounded)) {
    return fallback;
  }

  return clampNumber(rounded, min, max);
}

function normalizePageColor(color: FormatState['color']): FormatState['color'] {
  return {
    hue: normalizeColorChannel(color.hue, 0, HUE_MAX, DEFAULT_PAGE_COLOR.hue),
    saturation: normalizeColorChannel(
      color.saturation,
      0,
      PERCENTAGE_MAX,
      DEFAULT_PAGE_COLOR.saturation
    ),
    lightness: normalizeColorChannel(
      color.lightness,
      0,
      PERCENTAGE_MAX,
      DEFAULT_PAGE_COLOR.lightness
    )
  };
}

const DEFAULT_STATE: FormatState = {
  mode: FormatMode.PRESET,
  model: PageModel.A4_LANDSCAPE,
  width: PAGE_PRESETS[PageModel.A4_LANDSCAPE].width,
  height: PAGE_PRESETS[PageModel.A4_LANDSCAPE].height,
  color: { ...DEFAULT_PAGE_COLOR },
  margins: { ...DEFAULT_MARGINS },
  gridEnabled: true
};

type FormatActions = {
  setMode: (mode: FormatMode) => void;
  setModel: (model: PageModel) => void;
  setSize: (width: number, height: number) => void;
  setColor: (color: {
    hue: number;
    saturation: number;
    lightness: number;
  }) => void;
  setMargins: (margins: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  }) => void;
  toggleGrid: () => void;
};

export type PageResize = {
  id: number;
  from: { width: number; height: number };
  to: { width: number; height: number };
};

// Kept out of the persisted state: only a page resize the user asked for
// moves the layout items, never a project being restored or switched.
let lastPageResize = $state<PageResize | null>(null);

function recordPageResize(
  from: { width: number; height: number },
  to: { width: number; height: number }
): void {
  if (from.width === to.width && from.height === to.height) {
    return;
  }
  lastPageResize = { id: (lastPageResize?.id ?? 0) + 1, from, to };
}

export function getLastPageResize(): PageResize | null {
  return lastPageResize;
}

// Same rule for the map frame: only a margin edit the user makes crops the
// map, never margins restored with a project.
let marginsEditId = $state(0);

export function getMarginsEditId(): number {
  return marginsEditId;
}

const { state, actions, getState } = createToolStore<
  FormatState,
  FormatActions
>(
  DEFAULT_STATE,
  (s) => ({
    setMode: (mode: FormatMode) => {
      s.mode = mode;
    },
    setModel: (model: PageModel) => {
      s.model = model;
      const preset = PAGE_PRESETS[model];
      if (preset) {
        recordPageResize(
          { width: s.width, height: s.height },
          { width: preset.width, height: preset.height }
        );
        s.width = preset.width;
        s.height = preset.height;
      }
    },
    setSize: (width: number, height: number) => {
      const next = { width: Math.max(1, width), height: Math.max(1, height) };
      recordPageResize({ width: s.width, height: s.height }, next);
      s.width = next.width;
      s.height = next.height;
    },
    setColor: (color) => {
      s.color = normalizePageColor(color);
    },
    setMargins: (margins) => {
      s.margins = margins;
      marginsEditId += 1;
    },
    toggleGrid: () => {
      s.gridEnabled = !s.gridEnabled;
    }
  }),
  { key: 'format' }
);

export const formatState = createReadonlyStateFacade(state);
export const formatActions = actions;
export const getFormatState = getState;

export function getFormatLayoutSizingContext(
  format: FormatState = getState()
): LayoutSizingContext {
  return {
    width: format.width,
    height: format.height,
    model: format.mode === FormatMode.PRESET ? format.model : 'custom'
  };
}
