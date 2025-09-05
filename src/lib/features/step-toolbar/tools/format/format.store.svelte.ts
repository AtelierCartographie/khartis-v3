import { toolActions, toolState } from '../tools-store/tools.store.svelte';
import type { FormatState } from './format.types';

export function getFormatState(): FormatState {
  return toolState.format;
}

export const formatActions = {
  setState(newState: Partial<FormatState>): void {
    toolActions.updateFormat(newState);
  },

  setMode(mode: 'preset' | 'custom'): void {
    toolActions.updateFormat({ mode });
  },

  setModel(model: string): void {
    const updates: Partial<FormatState> = { model };

    const presets = {
      'page-a4-landscape': { width: 842, height: 595 },
      'page-a4-portrait': { width: 595, height: 842 },
      'page-a3-landscape': { width: 1191, height: 842 },
      'page-a3-portrait': { width: 842, height: 1191 }
    };

    const preset = presets[model as keyof typeof presets];
    if (preset) {
      toolActions.updateFormat({
        ...updates,
        width: preset.width,
        height: preset.height
      });
    } else {
      toolActions.updateFormat(updates);
    }
  },

  setSize(width: number, height: number): void {
    toolActions.updateFormat({
      width: Math.max(1, width),
      height: Math.max(1, height)
    });
  },

  setColor(color: {
    hue: number;
    saturation: number;
    lightness: number;
  }): void {
    toolActions.updateFormat({ color });
  },

  setMargins(margins: Partial<{ top: number; bottom: number; left: number; right: number }>): void {
    const currentState = getFormatState();
    toolActions.updateFormat({
      margins: { ...currentState.margins, ...margins }
    });
  },

  setGridEnabled(enabled: boolean): void {
    toolActions.updateFormat({ gridEnabled: enabled });
  },

  reset(): void {
    toolActions.updateFormat({
      mode: 'preset',
      model: 'page-a4-landscape',
      width: 842,
      height: 595,
      color: { hue: 180, saturation: 50, lightness: 50 },
      margins: { top: 32, bottom: 32, left: 32, right: 32 },
      gridEnabled: true
    });
  }
};
