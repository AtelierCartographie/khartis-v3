import type { TextAlignment } from './text-alignment.utils';

interface TextStyleHandlerConfig {
  setFontFamily: (value: string) => void;
  emitFontFamily: (value: string) => void;
  setBold: (value: boolean) => void;
  emitBold: (value: boolean) => void;
  setItalic: (value: boolean) => void;
  emitItalic: (value: boolean) => void;
  setAlignment: (value: TextAlignment) => void;
  emitAlignment: (value: TextAlignment) => void;
}

export function makeTextStyleHandlers(config: TextStyleHandlerConfig) {
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

  function onAlignmentChange(value: TextAlignment): void {
    config.setAlignment(value);
    config.emitAlignment(value);
  }

  return {
    onFontFamilyChange,
    onBoldChange,
    onItalicChange,
    onAlignmentChange
  };
}
