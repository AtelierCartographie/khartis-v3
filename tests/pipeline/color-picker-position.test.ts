import { describe, expect, it } from 'vitest';

import { resolveColorPickerDropdownPosition } from '$lib/features/commons/utils/color-picker-position';

describe('resolveColorPickerDropdownPosition', () => {
  it('keeps the dropdown below the trigger when there is enough vertical space', () => {
    expect(
      resolveColorPickerDropdownPosition({
        triggerRect: {
          top: 96,
          left: 40,
          right: 340,
          bottom: 136,
          width: 300,
          height: 40
        },
        dropdownHeight: 360,
        viewport: {
          width: 1280,
          height: 900
        }
      })
    ).toEqual({
      top: 136,
      left: 40,
      width: 370,
      maxHeight: 748,
      openUpward: false
    });
  });

  it('shifts the dropdown left when the trigger is near the right edge', () => {
    expect(
      resolveColorPickerDropdownPosition({
        triggerRect: {
          top: 180,
          left: 560,
          right: 760,
          bottom: 220,
          width: 200,
          height: 40
        },
        dropdownHeight: 360,
        viewport: {
          width: 800,
          height: 700
        }
      })
    ).toEqual({
      top: 220,
      left: 414,
      width: 370,
      maxHeight: 464,
      openUpward: false
    });
  });

  it('opens upward when there is not enough space below and more room above', () => {
    expect(
      resolveColorPickerDropdownPosition({
        triggerRect: {
          top: 600,
          left: 120,
          right: 420,
          bottom: 640,
          width: 300,
          height: 40
        },
        dropdownHeight: 360,
        viewport: {
          width: 960,
          height: 760
        }
      })
    ).toEqual({
      top: 240,
      left: 120,
      width: 370,
      maxHeight: 584,
      openUpward: true
    });
  });

  it('clamps width and height on small viewports', () => {
    expect(
      resolveColorPickerDropdownPosition({
        triggerRect: {
          top: 180,
          left: 280,
          right: 360,
          bottom: 220,
          width: 80,
          height: 40
        },
        dropdownHeight: 500,
        viewport: {
          width: 320,
          height: 400
        }
      })
    ).toEqual({
      top: 220,
      left: 16,
      width: 288,
      maxHeight: 164,
      openUpward: false
    });
  });
});
