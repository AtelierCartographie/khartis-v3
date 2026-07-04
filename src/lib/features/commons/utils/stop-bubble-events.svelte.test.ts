import { describe, expect, it } from 'vitest';
import { stopBubbleEvents } from './stop-bubble-events';

describe('stopBubbleEvents', () => {
  it('stops configured events from bubbling until destroyed', () => {
    const parent = document.createElement('div');
    const child = document.createElement('button');
    parent.appendChild(child);
    let parentClicks = 0;
    parent.addEventListener('click', () => {
      parentClicks += 1;
    });

    const action = stopBubbleEvents(child);

    child.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(parentClicks).toBe(0);

    action.destroy();
    child.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(parentClicks).toBe(1);
  });

  it('updates the capture option without leaving duplicate listeners', () => {
    const parent = document.createElement('div');
    const child = document.createElement('button');
    parent.appendChild(child);
    let parentKeyups = 0;
    parent.addEventListener('keyup', () => {
      parentKeyups += 1;
    });

    const action = stopBubbleEvents(child);
    action.update({ capture: true });
    action.update({ capture: false });

    child.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    expect(parentKeyups).toBe(0);

    action.destroy();
    child.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    expect(parentKeyups).toBe(1);
  });
});
