import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_PAGE_COLOR,
  formatActions,
  formatState
} from './format.store.svelte';

describe('format.store page color defaults', () => {
  beforeEach(() => {
    formatActions.reset();
  });

  it('enables alignment grid by default for styling step', () => {
    expect(formatState.gridEnabled).toBe(true);
  });

  it('uses a white page background color by default', () => {
    expect(formatState.color).toEqual(DEFAULT_PAGE_COLOR);
  });

  it('clamps page color channels when setting a custom color', () => {
    formatActions.setColor({
      hue: 725.4,
      saturation: -20.1,
      lightness: 140.8
    });

    expect(formatState.color).toEqual({
      hue: 359,
      saturation: 0,
      lightness: 100
    });
  });

  it('falls back to white defaults when channels are invalid numbers', () => {
    formatActions.setColor({
      hue: Number.NaN,
      saturation: Number.POSITIVE_INFINITY,
      lightness: Number.NEGATIVE_INFINITY
    });

    expect(formatState.color).toEqual(DEFAULT_PAGE_COLOR);
  });

  it('restores the default white page color on reset', () => {
    formatActions.setColor({
      hue: 280,
      saturation: 70,
      lightness: 55
    });

    formatActions.reset();

    expect(formatState.color).toEqual(DEFAULT_PAGE_COLOR);
  });
});
