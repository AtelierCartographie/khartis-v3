import { describe, expect, it, vi } from 'vitest';
import {
  createLayerConfigSelectedIdHandler,
  createLayerConfigValueHandler
} from './layer-config-handlers.utils';

describe('layer-config handlers utils', () => {
  it('emits keyed value updates through the latest onchange handler', () => {
    const firstOnChange = vi.fn();
    const secondOnChange = vi.fn();
    let onchange = firstOnChange;
    const handleColorChange = createLayerConfigValueHandler<string>(
      () => onchange,
      'color'
    );

    handleColorChange('#ffffff');
    onchange = secondOnChange;
    handleColorChange('#000000');

    expect(firstOnChange).toHaveBeenCalledWith({ color: '#ffffff' });
    expect(secondOnChange).toHaveBeenCalledWith({ color: '#000000' });
  });

  it('maps selectedId events into keyed updates', () => {
    const onchange = vi.fn();
    const handleRepresentationChange = createLayerConfigSelectedIdHandler(
      () => onchange,
      'representation',
      (selectedId) => selectedId.toUpperCase()
    );

    handleRepresentationChange(
      new CustomEvent('select', { detail: { selectedId: 'shading' } })
    );

    expect(onchange).toHaveBeenCalledWith({ representation: 'SHADING' });
  });
});
