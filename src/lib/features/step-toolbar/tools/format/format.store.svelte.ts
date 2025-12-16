import {
  DEFAULT_MARGINS,
  FormatMode,
  PAGE_PRESETS,
  PageModel
} from '$lib/features/commons/constants/ui.constants';
import { createResetFunction } from '$lib/features/commons/utils/store.utils';
import type { FormatState } from './format.types';

const DEFAULT_FORMAT_STATE: FormatState = {
  mode: FormatMode.PRESET,
  model: PageModel.A4_LANDSCAPE,
  width: PAGE_PRESETS[PageModel.A4_LANDSCAPE].width,
  height: PAGE_PRESETS[PageModel.A4_LANDSCAPE].height,
  color: { hue: 180, saturation: 50, lightness: 50 },
  margins: { ...DEFAULT_MARGINS },
  gridEnabled: true
};

export const formatState = $state<FormatState>({ ...DEFAULT_FORMAT_STATE });

export const formatActions = {
  setState(newState: Partial<FormatState>): void {
    Object.assign(formatState, newState);
  },

  setMode(mode: FormatMode): void {
    formatState.mode = mode;
  },

  setModel(model: PageModel): void {
    formatState.model = model;

    const preset = PAGE_PRESETS[model];
    if (preset) {
      formatState.width = preset.width;
      formatState.height = preset.height;
    }
  },

  setSize(width: number, height: number): void {
    formatState.width = Math.max(1, width);
    formatState.height = Math.max(1, height);
  },

  setColor(color: {
    hue: number;
    saturation: number;
    lightness: number;
  }): void {
    formatState.color = color;
  },

  setMargins(margins: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  }): void {
    formatState.margins = margins;
  },

  toggleGrid(): void {
    formatState.gridEnabled = !formatState.gridEnabled;
  },

  reset: createResetFunction(formatState, DEFAULT_FORMAT_STATE)
};

export function getFormatState(): FormatState {
  return formatState;
}
