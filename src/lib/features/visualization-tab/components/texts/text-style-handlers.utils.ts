import { clampFontSize } from '$lib/features/step-toolbar/fonts.constants';
import type { TextAlignment } from './text-alignment.utils';

interface TextStyleHandlerConfig {
  defaultSize: number;
  setColor: (value: string) => void;
  emitColor: (value: string) => void;
  setFontFamily: (value: string) => void;
  emitFontFamily: (value: string) => void;
  setBold: (value: boolean) => void;
  emitBold: (value: boolean) => void;
  setItalic: (value: boolean) => void;
  emitItalic: (value: boolean) => void;
  setSize: (value: number) => void;
  emitSize: (value: number) => void;
  setAlignment: (value: TextAlignment) => void;
  emitAlignment: (value: TextAlignment) => void;
  setHalo: (value: boolean) => void;
  emitHalo: (value: boolean) => void;
  setHaloColor: (value: string) => void;
  emitHaloColor: (value: string) => void;
}

export function makeTextStyleHandlers(config: TextStyleHandlerConfig) {
  function onColorChange(value: string): void {
    config.setColor(value);
    config.emitColor(value);
  }

  function onFontFamilyChange(value: string): void {
    config.setFontFamily(value);
    config.emitFontFamily(value);
  }

  function onBoldChange(value: boolean): void {
    config.setBold(value);
    config.emitBold(value);
  }

  function onItalicChange(value: boolean): void {
    config.setItalic(value);
    config.emitItalic(value);
  }

  function onSizeChange(value: number): void {
    const nextSize = clampFontSize(value, config.defaultSize);
    config.setSize(nextSize);
    config.emitSize(nextSize);
  }

  function onAlignmentChange(value: TextAlignment): void {
    config.setAlignment(value);
    config.emitAlignment(value);
  }

  function onHaloChange(value: boolean): void {
    config.setHalo(value);
    config.emitHalo(value);
  }

  function onHaloColorChange(value: string): void {
    config.setHaloColor(value);
    config.emitHaloColor(value);
  }

  return {
    onColorChange,
    onFontFamilyChange,
    onBoldChange,
    onItalicChange,
    onSizeChange,
    onAlignmentChange,
    onHaloChange,
    onHaloColorChange
  };
}
