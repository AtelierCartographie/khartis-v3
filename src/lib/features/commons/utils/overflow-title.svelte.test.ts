import { afterEach, describe, expect, it, vi } from 'vitest';
import { overflowTitle } from './overflow-title';

function setElementSize(
  element: HTMLElement,
  size: {
    scrollWidth: number;
    clientWidth: number;
    scrollHeight?: number;
    clientHeight?: number;
  }
) {
  Object.defineProperties(element, {
    scrollWidth: { configurable: true, value: size.scrollWidth },
    clientWidth: { configurable: true, value: size.clientWidth },
    scrollHeight: { configurable: true, value: size.scrollHeight ?? 20 },
    clientHeight: { configurable: true, value: size.clientHeight ?? 20 }
  });
}

describe('overflowTitle', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('adds the title attribute only when text overflows', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });

    const element = document.createElement('p');
    setElementSize(element, { scrollWidth: 120, clientWidth: 100 });

    const action = overflowTitle(element, 'Long projection title');

    expect(element).toHaveAttribute('title', 'Long projection title');

    setElementSize(element, { scrollWidth: 100, clientWidth: 120 });
    action.update('Short title');

    expect(element).not.toHaveAttribute('title');
  });

  it('removes its title attribute on destroy', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });

    const element = document.createElement('p');
    setElementSize(element, { scrollWidth: 120, clientWidth: 100 });

    const action = overflowTitle(element, 'Long projection title');
    action.destroy();

    expect(element).not.toHaveAttribute('title');
  });
});
