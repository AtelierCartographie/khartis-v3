import { describe, expect, it } from 'vitest';
import { clampDropdownToViewport } from './dropdown-position.utils';

describe('clampDropdownToViewport', () => {
  it('leaves an in-viewport position unchanged', () => {
    const pos = { top: 200, left: 300, width: 240 };
    expect(clampDropdownToViewport(pos, 300, 1280, 800)).toEqual(pos);
  });

  it('clamps a position that overflows the bottom edge', () => {
    const result = clampDropdownToViewport(
      { top: 750, left: 300, width: 240 },
      300,
      1280,
      800
    );
    expect(result.top).toBe(800 - 300 - 8);
  });

  it('clamps a negative top (trigger scrolled above the viewport)', () => {
    const result = clampDropdownToViewport(
      { top: -120, left: 300, width: 240 },
      300,
      1280,
      800
    );
    expect(result.top).toBe(8);
  });

  it('clamps a position that overflows the right edge', () => {
    const result = clampDropdownToViewport(
      { top: 200, left: 1200, width: 240 },
      300,
      1280,
      800
    );
    expect(result.left).toBe(1280 - 240 - 8);
  });

  it('keeps the dropdown on-screen even when the trigger is far off-screen left', () => {
    const result = clampDropdownToViewport(
      { top: 200, left: -500, width: 240 },
      300,
      1280,
      800
    );
    expect(result.left).toBe(8);
  });
});
