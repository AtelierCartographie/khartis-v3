import { describe, expect, it } from 'vitest';
import { clampPageInsets, MIN_PAGE_AREA_SIZE } from './page-insets.utils';

const A4_LANDSCAPE = { width: 842, height: 595 };
const DEFAULT = { top: 32, bottom: 32, left: 32, right: 32 };

describe('clampPageInsets', () => {
  it('should keep margins unchanged when the remaining area stays large enough', () => {
    const next = { top: 80, bottom: 40, left: 10, right: 0 };
    expect(clampPageInsets(next, DEFAULT, A4_LANDSCAPE)).toEqual(next);
  });

  it('should cap the edited margin so the area keeps its minimum size when it is too large', () => {
    const result = clampPageInsets(
      { ...DEFAULT, top: 5000 },
      DEFAULT,
      A4_LANDSCAPE
    );
    expect(result).toEqual({
      ...DEFAULT,
      top: A4_LANDSCAPE.height - MIN_PAGE_AREA_SIZE - DEFAULT.bottom
    });
  });

  it('should shrink the edited side, not the opposite one, when the bottom margin is too large', () => {
    const result = clampPageInsets(
      { ...DEFAULT, bottom: 5000 },
      DEFAULT,
      A4_LANDSCAPE
    );
    expect(result.top).toBe(DEFAULT.top);
    expect(result.bottom).toBe(
      A4_LANDSCAPE.height - MIN_PAGE_AREA_SIZE - DEFAULT.top
    );
  });

  it('should bound margins on both axes when the page shrinks under them', () => {
    const margins = { top: 300, bottom: 300, left: 400, right: 400 };
    const page = { width: 595, height: 420 };
    const result = clampPageInsets(margins, margins, page);
    expect(page.height - result.top - result.bottom).toBe(MIN_PAGE_AREA_SIZE);
    expect(page.width - result.left - result.right).toBe(MIN_PAGE_AREA_SIZE);
  });

  it('should reject negative and non-finite margins when they are entered', () => {
    const result = clampPageInsets(
      { top: -20, bottom: Number.NaN, left: 12.6, right: 0 },
      DEFAULT,
      A4_LANDSCAPE
    );
    expect(result).toEqual({ top: 0, bottom: 0, left: 13, right: 0 });
  });
});
