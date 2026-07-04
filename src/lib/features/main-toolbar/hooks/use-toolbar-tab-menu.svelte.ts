import { KEY } from '$lib/features/commons/constants/dom.constants';
import { tick } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';

const TAB_MENU_FOCUSABLE_SELECTOR =
  'button:not([disabled]), input:not([disabled]), [role="menuitem"], [role="menuitemradio"]';

export interface ToolbarTabMenuPosition {
  top: number;
  left: number;
}

export interface UseToolbarTabMenuReturn {
  readonly openTabId: string | null;
  readonly position: ToolbarTabMenuPosition;
  registerMenuButton: (
    node: HTMLButtonElement,
    id: string
  ) => { destroy: () => void };
  toggle: (tabId: string, event: MouseEvent) => void;
  close: () => void;
  handleKeydown: (event: KeyboardEvent) => void;
  handleClickOutside: (event: MouseEvent) => void;
}

export function useToolbarTabMenu(): UseToolbarTabMenuReturn {
  const menuButtonRefs = new SvelteMap<string, HTMLButtonElement>();
  let openTabId = $state<string | null>(null);
  let position = $state<ToolbarTabMenuPosition>({ top: 0, left: 0 });

  function registerMenuButton(node: HTMLButtonElement, id: string) {
    menuButtonRefs.set(id, node);

    return {
      destroy() {
        menuButtonRefs.delete(id);
      }
    };
  }

  function close(): void {
    openTabId = null;
  }

  function getItems(): HTMLElement[] {
    const menuElement =
      document.querySelector<HTMLElement>('.tab-context-menu');
    if (!menuElement) return [];

    return Array.from(
      menuElement.querySelectorAll<HTMLElement>(TAB_MENU_FOCUSABLE_SELECTOR)
    ).filter((element) => element.getClientRects().length > 0);
  }

  async function focusFirstItem(): Promise<void> {
    await tick();
    getItems()[0]?.focus();
  }

  async function focusButton(tabId: string | null): Promise<void> {
    if (!tabId) return;

    await tick();
    menuButtonRefs.get(tabId)?.focus();
  }

  function toggle(tabId: string, event: MouseEvent): void {
    event.stopPropagation();
    if (openTabId === tabId) {
      openTabId = null;
      return;
    }

    const button = event.currentTarget as HTMLButtonElement;
    const rect = button.getBoundingClientRect();
    position = {
      top: rect.bottom + 4,
      left: rect.left
    };
    openTabId = tabId;
    void focusFirstItem();
  }

  function moveFocus(direction: 1 | -1): void {
    const items = getItems();
    if (items.length === 0) return;

    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    const nextIndex =
      currentIndex === -1
        ? direction === 1
          ? 0
          : items.length - 1
        : (currentIndex + direction + items.length) % items.length;

    items[nextIndex]?.focus();
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === KEY.ESCAPE) {
      event.preventDefault();
      event.stopPropagation();
      const tabId = openTabId;
      close();
      void focusButton(tabId);
      return;
    }

    if (event.key === KEY.ARROW_DOWN) {
      event.preventDefault();
      moveFocus(1);
      return;
    }

    if (event.key === KEY.ARROW_UP) {
      event.preventDefault();
      moveFocus(-1);
      return;
    }

    if (event.key === KEY.HOME) {
      event.preventDefault();
      getItems()[0]?.focus();
      return;
    }

    if (event.key === KEY.END) {
      event.preventDefault();
      getItems().at(-1)?.focus();
    }
  }

  function handleClickOutside(event: MouseEvent): void {
    const path = event.composedPath() as Element[];
    if (path.some((el) => el.id === 'khartis-color-picker-dropdown')) return;
    const target = event.target as Node;
    const menuElement = document.querySelector('.tab-context-menu');
    if (menuElement && !menuElement.contains(target)) {
      close();
    }
  }

  return {
    get openTabId() {
      return openTabId;
    },
    get position() {
      return position;
    },
    registerMenuButton,
    toggle,
    close,
    handleKeydown,
    handleClickOutside
  };
}
