import { describe, expect, it } from 'vitest';
import {
  computeFlippedPosition,
  computeFlippedScrollablePosition
} from './dropdown-position.utils';

describe('computeFlippedPosition', () => {
  it('places the dropdown below the trigger when there is enough space', () => {
    expect(
      computeFlippedPosition({
        triggerRect: {
          top: 100,
          bottom: 132,
          left: 24,
          width: 160
        },
        dropdownHeight: 200,
        viewportWidth: 800,
        viewportHeight: 600
      })
    ).toEqual({
      top: 132,
      left: 24,
      width: 160
    });
  });

  it('flips the dropdown above the trigger using viewport coordinates', () => {
    expect(
      computeFlippedPosition({
        triggerRect: {
          top: 420,
          bottom: 452,
          left: 96,
          width: 180
        },
        dropdownHeight: 240,
        viewportWidth: 800,
        viewportHeight: 600
      })
    ).toEqual({
      top: 180,
      left: 96,
      width: 180
    });
  });

  it('clamps the flipped dropdown inside the viewport margin', () => {
    expect(
      computeFlippedPosition({
        triggerRect: {
          top: 40,
          bottom: 72,
          left: -24,
          width: 220
        },
        dropdownHeight: 100,
        viewportWidth: 200,
        viewportHeight: 120
      })
    ).toEqual({
      top: 12,
      left: 8,
      width: 220
    });
  });
});

describe('computeFlippedScrollablePosition', () => {
  it('keeps a scrollable dropdown below when the visible height fits', () => {
    expect(
      computeFlippedScrollablePosition({
        triggerRect: {
          top: 50,
          bottom: 82,
          left: 20,
          width: 300
        },
        dropdownHeight: 400,
        viewportWidth: 500,
        viewportHeight: 300,
        margin: 16,
        width: 370
      })
    ).toEqual({
      top: 82,
      left: 20,
      width: 370,
      maxHeight: 202,
      openUpward: false
    });
  });

  it('flips a scrollable dropdown upward and reports the available height', () => {
    expect(
      computeFlippedScrollablePosition({
        triggerRect: {
          top: 220,
          bottom: 252,
          left: 240,
          width: 300
        },
        dropdownHeight: 400,
        viewportWidth: 420,
        viewportHeight: 300,
        margin: 16,
        width: 370
      })
    ).toEqual({
      top: 16,
      left: 34,
      width: 370,
      maxHeight: 204,
      openUpward: true
    });
  });
});
