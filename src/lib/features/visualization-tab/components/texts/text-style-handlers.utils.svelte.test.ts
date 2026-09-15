import { describe, expect, it, vi } from 'vitest';
import { makeTextStyleHandlers } from './text-style-handlers.utils';

function makeConfig() {
  return {
    setFontFamily: vi.fn(),
    emitFontFamily: vi.fn(),
    setBold: vi.fn(),
    emitBold: vi.fn(),
    setItalic: vi.fn(),
    emitItalic: vi.fn(),
    setAlignment: vi.fn(),
    emitAlignment: vi.fn()
  };
}

describe('makeTextStyleHandlers', () => {
  it('updates local state and emits style changes through the configured callbacks', () => {
    const config = makeConfig();
    const handlers = makeTextStyleHandlers(config);

    handlers.onFontFamilyChange('Inter');
    handlers.onBoldChange(true);
    handlers.onItalicChange(true);
    handlers.onAlignmentChange('right');

    expect(config.setFontFamily).toHaveBeenCalledWith('Inter');
    expect(config.emitFontFamily).toHaveBeenCalledWith('Inter');
    expect(config.setBold).toHaveBeenCalledWith(true);
    expect(config.emitBold).toHaveBeenCalledWith(true);
    expect(config.setItalic).toHaveBeenCalledWith(true);
    expect(config.emitItalic).toHaveBeenCalledWith(true);
    expect(config.setAlignment).toHaveBeenCalledWith('right');
    expect(config.emitAlignment).toHaveBeenCalledWith('right');
  });
});
