import { describe, expect, it } from 'vitest';
import { resolveColorPickerDropdownPosition } from './color-picker-position';

describe('resolveColorPickerDropdownPosition', () => {
  it('matches the width of its dropdown trigger', () => {
    expect(
      resolveColorPickerDropdownPosition({
        triggerRect: {
          top: 50,
          bottom: 82,
          left: 20,
          right: 332,
          width: 312,
          height: 32
        },
        dropdownHeight: 200,
        viewport: {
          width: 1440,
          height: 900
        }
      }).width
    ).toBe(312);
  });

  it('keeps the color picker below when the constrained height fits', () => {
    expect(
      resolveColorPickerDropdownPosition({
        triggerRect: {
          top: 50,
          bottom: 82,
          left: 20,
          right: 50,
          width: 30,
          height: 32
        },
        dropdownHeight: 400,
        viewport: {
          width: 500,
          height: 300
        }
      })
    ).toEqual({
      top: 82,
      left: 20,
      width: 240,
      maxHeight: 202,
      openUpward: false
    });
  });

  it('flips the color picker upward and clamps it to the viewport', () => {
    expect(
      resolveColorPickerDropdownPosition({
        triggerRect: {
          top: 220,
          bottom: 252,
          left: 240,
          right: 270,
          width: 30,
          height: 32
        },
        dropdownHeight: 400,
        viewport: {
          width: 420,
          height: 300
        }
      })
    ).toEqual({
      top: 16,
      left: 164,
      width: 240,
      maxHeight: 204,
      openUpward: true
    });
  });
});
