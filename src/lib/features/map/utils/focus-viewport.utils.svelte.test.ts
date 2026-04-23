import { afterEach, describe, expect, it } from 'vitest';
import { getElementCenteringDelta } from './focus-viewport.utils';

function createDomRect(
  left: number,
  top: number,
  width: number,
  height: number
): DOMRect {
  return {
    x: left,
    y: top,
    width,
    height,
    top,
    left,
    right: left + width,
    bottom: top + height,
    toJSON() {
      return this;
    }
  } as DOMRect;
}

function bindElementBox(
  element: HTMLElement,
  box: { left: number; top: number; width: number; height: number }
): void {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => createDomRect(box.left, box.top, box.width, box.height)
  });
}

function createBox(
  tagName: keyof HTMLElementTagNameMap,
  box: { left: number; top: number; width: number; height: number }
): HTMLElement {
  const element = document.createElement(tagName);
  bindElementBox(element, box);

  return element;
}

function appendToolPopover(box: {
  left: number;
  top: number;
  width: number;
  height: number;
}): HTMLElement {
  const popoverRoot = document.createElement('div');
  const popover = createBox('div', box);

  popoverRoot.id = 'khartis-tool-popover';
  popover.className = 'bx--popover';
  popoverRoot.appendChild(popover);
  document.body.appendChild(popoverRoot);

  return popover;
}

describe('focus viewport utils', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('places the focused element edge 30px to the right of the open tool popover', () => {
    const viewport = createBox('div', {
      left: 0,
      top: 0,
      width: 1000,
      height: 600
    });
    const toolbar = createBox('div', {
      left: 0,
      top: 0,
      width: 100,
      height: 600
    });
    const target = createBox('div', {
      left: 680,
      top: 80,
      width: 40,
      height: 40
    });

    toolbar.id = 'khartis-step-toolbar';
    document.body.appendChild(viewport);
    document.body.appendChild(toolbar);
    appendToolPopover({
      left: 100,
      top: 80,
      width: 320,
      height: 460
    });

    expect(getElementCenteringDelta(viewport, target)).toEqual({
      x: -230,
      y: 200
    });
  });

  it('keeps the horizontal center when no tool popover is open', () => {
    const viewport = createBox('div', {
      left: 0,
      top: 0,
      width: 1000,
      height: 600
    });
    const toolbar = createBox('div', {
      left: 0,
      top: 0,
      width: 100,
      height: 600
    });
    const target = createBox('div', {
      left: 680,
      top: 80,
      width: 40,
      height: 40
    });

    toolbar.id = 'khartis-step-toolbar';
    document.body.appendChild(viewport);
    document.body.appendChild(toolbar);

    expect(getElementCenteringDelta(viewport, target)).toEqual({
      x: -150,
      y: 200
    });
  });

  it('clamps the target point inside the visible focus area', () => {
    const viewport = createBox('div', {
      left: 0,
      top: 0,
      width: 400,
      height: 300
    });
    const target = createBox('div', {
      left: 280,
      top: 30,
      width: 40,
      height: 40
    });

    document.body.appendChild(viewport);
    appendToolPopover({
      left: 0,
      top: 0,
      width: 390,
      height: 300
    });

    expect(getElementCenteringDelta(viewport, target)).toEqual({
      x: 95,
      y: 100
    });
  });
});
