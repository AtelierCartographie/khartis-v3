import { afterEach, describe, expect, it } from 'vitest';
import { horizontalWheelScroll } from './horizontal-wheel-scroll';

function createRail(scrollWidth: number, clientWidth: number): HTMLElement {
  const node = document.createElement('div');
  Object.defineProperty(node, 'scrollWidth', { value: scrollWidth });
  Object.defineProperty(node, 'clientWidth', { value: clientWidth });
  node.scrollLeft = 0;
  document.body.appendChild(node);
  return node;
}

function wheel(node: HTMLElement, deltaY: number, shiftKey = false): boolean {
  const event = new WheelEvent('wheel', { deltaY, shiftKey, cancelable: true });
  node.dispatchEvent(event);
  return event.defaultPrevented;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('horizontalWheelScroll', () => {
  it('translates vertical wheel into horizontal scrolling when content overflows', () => {
    const node = createRail(400, 100);
    const action = horizontalWheelScroll(node);

    const prevented = wheel(node, 120);

    expect(node.scrollLeft).toBe(120);
    expect(prevented).toBe(true);
    action.destroy();
  });

  it('lets the wheel pass through at the start and end edges', () => {
    const node = createRail(400, 100);
    const action = horizontalWheelScroll(node);

    expect(wheel(node, -100)).toBe(false);
    expect(node.scrollLeft).toBe(0);

    node.scrollLeft = node.scrollWidth - node.clientWidth;
    expect(wheel(node, 100)).toBe(false);

    action.destroy();
  });

  it('ignores shift+wheel and non-overflowing rails', () => {
    const overflowing = createRail(400, 100);
    const overflowAction = horizontalWheelScroll(overflowing);
    overflowing.scrollLeft = 50;
    expect(wheel(overflowing, 100, true)).toBe(false);
    overflowAction.destroy();

    const fitting = createRail(100, 100);
    const fitAction = horizontalWheelScroll(fitting);
    expect(wheel(fitting, 120)).toBe(false);
    expect(fitting.scrollLeft).toBe(0);
    fitAction.destroy();
  });

  it('stops handling wheel events after destroy', () => {
    const node = createRail(400, 100);
    const action = horizontalWheelScroll(node);
    action.destroy();

    wheel(node, 120);

    expect(node.scrollLeft).toBe(0);
  });
});
