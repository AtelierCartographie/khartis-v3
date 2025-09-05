import type { FormatState } from './format.types';

const DEFAULT_STATE: FormatState = {
  mode: 'preset',
  model: 'page-a4-landscape',
  width: 842,
  height: 595,
  color: { hue: 180, saturation: 50, lightness: 50 },
  margins: { top: 32, bottom: 32, left: 32, right: 32 },
  gridEnabled: true
};

export const formatState = $state<FormatState>({ ...DEFAULT_STATE });

export const formatActions = {
  setState(newState: Partial<FormatState>): void {
    Object.assign(formatState, newState);
    console.log('[Format] 🔄 State updated:', newState);
  },

  setMode(mode: 'preset' | 'custom'): void {
    formatState.mode = mode;
    console.log('[Format] 📄 Mode changed to:', mode);
  },

  setModel(model: string): void {
    formatState.model = model;
    console.log('[Format] 📐 Model changed to:', model);

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
      console.log(
        '[Format] 📏 Size updated to:',
        preset.width,
        'x',
        preset.height,
        'px'
      );
    }
  },

  setSize(width: number, height: number): void {
    formatState.width = Math.max(1, width);
    formatState.height = Math.max(1, height);
    console.log(
      '[Format] 📏 Custom size set to:',
      formatState.width,
      'x',
      formatState.height,
      'px'
    );
  },

  setColor(color: {
    hue: number;
    saturation: number;
    lightness: number;
  }): void {
    formatState.color = color;
    console.log('[Format] 🎨 Background color set to:', color);
  },

  setMargins(margins: Partial<typeof DEFAULT_STATE.margins>): void {
    formatState.margins = { ...formatState.margins, ...margins };
    console.log('[Format] 📐 Margins updated:', formatState.margins);
  },

  setGridEnabled(enabled: boolean): void {
    formatState.gridEnabled = enabled;
    console.log('[Format] 🔲 Grid', enabled ? 'enabled' : 'disabled');
  },

  reset(): void {
    console.log('[Format] 🔄 Reset to default state');
    Object.assign(formatState, DEFAULT_STATE);
  }
};
