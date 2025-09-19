import type { FormatState } from './format.types';

const DEFAULT_FORMAT_STATE: FormatState = {
  mode: 'preset',
  model: 'page-a4-landscape',
  width: 842,
  height: 595,
  color: { hue: 180, saturation: 50, lightness: 50 },
  margins: { top: 32, bottom: 32, left: 32, right: 32 },
  gridEnabled: true
};

export const formatState = $state<FormatState>({ ...DEFAULT_FORMAT_STATE });

export const formatActions = {
  setState(newState: Partial<FormatState>): void {
    Object.assign(formatState, newState);
  },

  setMode(mode: 'preset' | 'custom'): void {
    formatState.mode = mode;
  },

  setModel(model: string): void {
    formatState.model = model;

    const presets = {
      'page-a4-landscape': { width: 842, height: 595 },
      'page-a4-portrait': { width: 595, height: 842 },
      'page-a3-landscape': { width: 1191, height: 842 },
      'page-a3-portrait': { width: 842, height: 1191 }
    };

    const preset = presets[model as keyof typeof presets];
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

  reset(): void {
    Object.assign(formatState, DEFAULT_FORMAT_STATE);
  }
};

export function getFormatState(): FormatState {
  return formatState;
}
