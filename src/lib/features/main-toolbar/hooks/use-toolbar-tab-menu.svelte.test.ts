import { tick } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useToolbarTabMenu } from './use-toolbar-tab-menu.svelte';

function createMenuEvent(
  currentTarget: HTMLButtonElement
): MouseEvent & { stopPropagation: ReturnType<typeof vi.fn> } {
  return {
    currentTarget,
    stopPropagation: vi.fn()
  } as unknown as MouseEvent & { stopPropagation: ReturnType<typeof vi.fn> };
}

describe('useToolbarTabMenu', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('opens the requested tab menu and closes it with Escape', async () => {
    const hook = useToolbarTabMenu();
    const button = document.createElement('button');
    button.getBoundingClientRect = () =>
      ({
        bottom: 42,
        left: 24
      }) as DOMRect;

    const event = createMenuEvent(button);

    hook.registerMenuButton(button, 'tab-a');
    hook.toggle('tab-a', event);

    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(hook.openTabId).toBe('tab-a');
    expect(hook.position).toEqual({ top: 46, left: 24 });

    const keydown = new KeyboardEvent('keydown', { key: 'Escape' });
    const preventDefault = vi.spyOn(keydown, 'preventDefault');
    const stopPropagation = vi.spyOn(keydown, 'stopPropagation');
    hook.handleKeydown(keydown);
    await tick();

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(hook.openTabId).toBeNull();
  });

  it('closes an open menu when clicking outside it', () => {
    const hook = useToolbarTabMenu();
    const button = document.createElement('button');
    button.getBoundingClientRect = () =>
      ({
        bottom: 20,
        left: 10
      }) as DOMRect;

    const menu = document.createElement('div');
    menu.className = 'tab-context-menu';
    const outside = document.createElement('button');
    document.body.append(menu, outside);

    hook.toggle('tab-a', createMenuEvent(button));
    hook.handleClickOutside({
      target: outside,
      composedPath: () => [outside]
    } as unknown as MouseEvent);

    expect(hook.openTabId).toBeNull();
  });
});
