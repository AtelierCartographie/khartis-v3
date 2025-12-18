import {
  DEFAULT_MARGINS,
  FormatMode,
  PAGE_PRESETS,
  PageModel
} from '$lib/features/commons/constants/ui.constants';
import { createToolStore } from '$lib/features/commons/utils/store.utils.svelte';
import type { FormatState } from './format.types';

const DEFAULT_STATE: FormatState = {
  mode: FormatMode.PRESET,
  model: PageModel.A4_LANDSCAPE,
  width: PAGE_PRESETS[PageModel.A4_LANDSCAPE].width,
  height: PAGE_PRESETS[PageModel.A4_LANDSCAPE].height,
  color: { hue: 180, saturation: 50, lightness: 50 },
  margins: { ...DEFAULT_MARGINS },
  gridEnabled: true
};

const CONTAINER_PADDING = 80;
const MIN_MAP_SIZE = 200;

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
  fitToContainer: (containerWidth: number, containerHeight: number) => void;
};

const { state, actions, getState } = createToolStore<
  FormatState,
  FormatActions
>(DEFAULT_STATE, (s) => ({
  setMode: (mode: FormatMode) => {
    s.mode = mode;
  },
  setModel: (model: PageModel) => {
    s.model = model;
    const preset = PAGE_PRESETS[model];
    if (preset) {
      s.width = preset.width;
      s.height = preset.height;
    }
  },
  setSize: (width: number, height: number) => {
    s.width = Math.max(1, width);
    s.height = Math.max(1, height);
  },
  setColor: (color) => {
    s.color = color;
  },
  setMargins: (margins) => {
    s.margins = margins;
  },
  toggleGrid: () => {
    s.gridEnabled = !s.gridEnabled;
  },
  fitToContainer: (containerWidth: number, containerHeight: number) => {
    const preset = PAGE_PRESETS[s.model];
    if (!preset) return;

    const aspectRatio = preset.width / preset.height;
    const availableWidth = Math.max(0, containerWidth - CONTAINER_PADDING);
    const availableHeight = Math.max(0, containerHeight - CONTAINER_PADDING);

    if (availableWidth <= 0 || availableHeight <= 0) return;

    let newWidth: number;
    let newHeight: number;

    if (availableWidth / availableHeight > aspectRatio) {
      newHeight = availableHeight;
      newWidth = newHeight * aspectRatio;
    } else {
      newWidth = availableWidth;
      newHeight = newWidth / aspectRatio;
    }

    newWidth = Math.max(MIN_MAP_SIZE, Math.min(newWidth, availableWidth));
    newHeight = Math.max(MIN_MAP_SIZE, Math.min(newHeight, availableHeight));

    s.width = Math.round(newWidth);
    s.height = Math.round(newHeight);
  }
}));

export const formatState = state;
export const formatActions = actions;
export const getFormatState = getState;
