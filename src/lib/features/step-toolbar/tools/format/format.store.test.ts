import { beforeEach, describe, expect, it } from 'vitest';
import {
  FormatMode,
  PAGE_PRESETS,
  PageModel
} from '$lib/features/commons/constants/ui.constants';
import {
  DEFAULT_PAGE_COLOR,
  formatActions,
  formatState
} from './format.store.svelte';

describe('format.store page dimensions', () => {
  beforeEach(() => {
    formatActions.reset();
  });

  it('starts with A4 landscape preset dimensions by default', () => {
    expect(formatState.width).toBe(PAGE_PRESETS[PageModel.A4_LANDSCAPE].width);
    expect(formatState.height).toBe(
      PAGE_PRESETS[PageModel.A4_LANDSCAPE].height
    );
  });

  it('updates dimensions to the selected preset when model changes', () => {
    formatActions.setModel(PageModel.A3_LANDSCAPE);

    expect(formatState.width).toBe(PAGE_PRESETS[PageModel.A3_LANDSCAPE].width);
    expect(formatState.height).toBe(
      PAGE_PRESETS[PageModel.A3_LANDSCAPE].height
    );
  });

  it('produces different dimensions when switching between A4 and A3', () => {
    formatActions.setModel(PageModel.A4_LANDSCAPE);
    const a4Width = formatState.width;
    const a4Height = formatState.height;

    formatActions.setModel(PageModel.A3_LANDSCAPE);

    expect(formatState.width).not.toBe(a4Width);
    expect(formatState.height).not.toBe(a4Height);
  });

  it('scales page to fill a wide container maintaining preset aspect ratio', () => {
    // A4 landscape: 842×595 — aspect ratio ≈ 1.415
    // Container 2000×400: height-constrained → height=400, width=round(400*842/595)
    formatActions.setModel(PageModel.A4_LANDSCAPE);
    const { width: pw, height: ph } = PAGE_PRESETS[PageModel.A4_LANDSCAPE];

    formatActions.fitToContainer(2000, 400);

    const expectedWidth = Math.round(400 * (pw / ph));
    expect(formatState.height).toBe(400);
    expect(formatState.width).toBe(expectedWidth);
  });

  it('scales page to fill a square container maintaining preset aspect ratio', () => {
    // A4 landscape: 842×595 — aspect ratio ≈ 1.415
    // Container 600×600: width-constrained → width=600, height=round(600*595/842)
    formatActions.setModel(PageModel.A4_LANDSCAPE);
    const { width: pw, height: ph } = PAGE_PRESETS[PageModel.A4_LANDSCAPE];

    formatActions.fitToContainer(600, 600);

    const expectedHeight = Math.round(600 * (ph / pw));
    expect(formatState.width).toBe(600);
    expect(formatState.height).toBe(expectedHeight);
  });

  it('keeps correct aspect ratio after switching model then fitting to container', () => {
    formatActions.setModel(PageModel.A3_PORTRAIT);
    formatActions.fitToContainer(800, 800);

    const { width: pw, height: ph } = PAGE_PRESETS[PageModel.A3_PORTRAIT];
    const expectedAspect = pw / ph;
    const actualAspect = formatState.width / formatState.height;

    expect(actualAspect).toBeCloseTo(expectedAspect, 1);
  });

  it('restores default model dimensions on reset', () => {
    formatActions.setModel(PageModel.A3_PORTRAIT);
    formatActions.reset();

    expect(formatState.width).toBe(PAGE_PRESETS[PageModel.A4_LANDSCAPE].width);
    expect(formatState.height).toBe(
      PAGE_PRESETS[PageModel.A4_LANDSCAPE].height
    );
  });
});

describe('format.store margins', () => {
  beforeEach(() => {
    formatActions.reset();
  });

  it('has non-zero default margins', () => {
    expect(formatState.margins.top).toBeGreaterThan(0);
    expect(formatState.margins.bottom).toBeGreaterThan(0);
    expect(formatState.margins.left).toBeGreaterThan(0);
    expect(formatState.margins.right).toBeGreaterThan(0);
  });

  it('updates all margin sides when setMargins is called', () => {
    const newMargins = { top: 8, bottom: 16, left: 12, right: 12 };
    formatActions.setMargins(newMargins);

    expect(formatState.margins).toEqual(newMargins);
  });

  it('restores default margins on reset', () => {
    formatActions.setMargins({ top: 0, bottom: 0, left: 0, right: 0 });
    formatActions.reset();

    expect(formatState.margins.top).toBeGreaterThan(0);
  });
});

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

describe('format.store setMode', () => {
  beforeEach(() => {
    formatActions.reset();
  });

  it('starts in preset mode by default', () => {
    expect(formatState.mode).toBe(FormatMode.PRESET);
  });

  it('switches to custom mode', () => {
    formatActions.setMode(FormatMode.CUSTOM);

    expect(formatState.mode).toBe(FormatMode.CUSTOM);
  });

  it('returns to preset mode after switching to custom', () => {
    formatActions.setMode(FormatMode.CUSTOM);
    formatActions.setMode(FormatMode.PRESET);

    expect(formatState.mode).toBe(FormatMode.PRESET);
  });
});

describe('format.store setSize', () => {
  beforeEach(() => {
    formatActions.reset();
  });

  it('sets custom page dimensions', () => {
    formatActions.setSize(1200, 800);

    expect(formatState.width).toBe(1200);
    expect(formatState.height).toBe(800);
  });

  it('clamps width and height to minimum 1', () => {
    formatActions.setSize(0, -50);

    expect(formatState.width).toBe(1);
    expect(formatState.height).toBe(1);
  });

  it('accepts very large dimensions without clamping', () => {
    formatActions.setSize(9999, 7000);

    expect(formatState.width).toBe(9999);
    expect(formatState.height).toBe(7000);
  });
});

describe('format.store toggleGrid', () => {
  beforeEach(() => {
    formatActions.reset();
  });

  it('disables the grid after one toggle', () => {
    formatActions.toggleGrid();

    expect(formatState.gridEnabled).toBe(false);
  });

  it('re-enables the grid after two toggles', () => {
    formatActions.toggleGrid();
    formatActions.toggleGrid();

    expect(formatState.gridEnabled).toBe(true);
  });

  it('resets grid to enabled on reset', () => {
    formatActions.toggleGrid();
    formatActions.reset();

    expect(formatState.gridEnabled).toBe(true);
  });
});
