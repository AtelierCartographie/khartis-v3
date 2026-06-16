import { describe, expect, it } from 'vitest';

import { FillMode } from '$lib/features/commons/constants/visualization.constants';
import {
  FILL_MODES_STANDARD,
  FILL_MODES_WITH_DENSITY,
  buildFillModeItems
} from './fill-mode-presets';

describe('fill-mode-presets', () => {
  it('buildFillModeItems returns one entry per mode', () => {
    const items = buildFillModeItems(FILL_MODES_STANDARD);
    expect(items.length).toBe(FILL_MODES_STANDARD.length);
  });

  it('buildFillModeItems attaches a carbon icon, an i18n label, and the default icon size', () => {
    const items = buildFillModeItems(FILL_MODES_WITH_DENSITY);
    items.forEach((item) => {
      expect(item.icon).toBeDefined();
      expect(typeof item.label).toBe('string');
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.iconSize).toBe(16);
    });
  });

  it('buildFillModeItems preserves the order of the input modes', () => {
    const reordered = buildFillModeItems([
      FillMode.CATEGORIES,
      FillMode.NONE,
      FillMode.UNIQUE
    ]);
    expect(reordered.map((item) => item.label)).toEqual([
      expect.any(String),
      expect.any(String),
      expect.any(String)
    ]);
    expect(reordered.length).toBe(3);
  });
});
