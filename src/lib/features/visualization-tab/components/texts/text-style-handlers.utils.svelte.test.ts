import { describe, expect, it, vi } from 'vitest';
import { MAX_FONT_SIZE } from '$lib/features/step-toolbar/fonts.constants';
import { makeTextStyleHandlers } from './text-style-handlers.utils';

function makeConfig() {
  return {
    defaultSize: 12,
    setColor: vi.fn(),
    emitColor: vi.fn(),
    setFontFamily: vi.fn(),
    emitFontFamily: vi.fn(),
    setBold: vi.fn(),
    emitBold: vi.fn(),
    setItalic: vi.fn(),
    emitItalic: vi.fn(),
    setSize: vi.fn(),
    emitSize: vi.fn(),
    setAlignment: vi.fn(),
    emitAlignment: vi.fn(),
    setHalo: vi.fn(),
    emitHalo: vi.fn(),
    setHaloColor: vi.fn(),
    emitHaloColor: vi.fn()
  };
}

describe('makeTextStyleHandlers', () => {
  it('updates local state and emits style changes through the configured callbacks', () => {
    const config = makeConfig();
    const handlers = makeTextStyleHandlers(config);

    handlers.onColorChange('#112233');
    handlers.onFontFamilyChange('Inter');
    handlers.onBoldChange(true);
    handlers.onItalicChange(true);
    handlers.onAlignmentChange('right');
    handlers.onHaloChange(true);
    handlers.onHaloColorChange('#ffffff');

    expect(config.setColor).toHaveBeenCalledWith('#112233');
    expect(config.emitColor).toHaveBeenCalledWith('#112233');
    expect(config.setFontFamily).toHaveBeenCalledWith('Inter');
    expect(config.emitFontFamily).toHaveBeenCalledWith('Inter');
    expect(config.setBold).toHaveBeenCalledWith(true);
    expect(config.emitBold).toHaveBeenCalledWith(true);
    expect(config.setItalic).toHaveBeenCalledWith(true);
    expect(config.emitItalic).toHaveBeenCalledWith(true);
    expect(config.setAlignment).toHaveBeenCalledWith('right');
    expect(config.emitAlignment).toHaveBeenCalledWith('right');
    expect(config.setHalo).toHaveBeenCalledWith(true);
    expect(config.emitHalo).toHaveBeenCalledWith(true);
    expect(config.setHaloColor).toHaveBeenCalledWith('#ffffff');
    expect(config.emitHaloColor).toHaveBeenCalledWith('#ffffff');
  });

  it('clamps size before updating local state and emitting the style change', () => {
    const config = makeConfig();
    const handlers = makeTextStyleHandlers(config);

    handlers.onSizeChange(999);

    expect(config.setSize).toHaveBeenCalledWith(MAX_FONT_SIZE);
    expect(config.emitSize).toHaveBeenCalledWith(MAX_FONT_SIZE);
  });
});
