import { getContext, setContext, untrack } from 'svelte';
import { cubicIn, cubicOut } from 'svelte/easing';
import { fade, fly, type TransitionConfig } from 'svelte/transition';
import { motionDuration } from './step-transition.svelte';

const FLOATING_PANEL_SCOPE = Symbol('floating-panel-scope');

type OpenPanel = {
  close: () => void;
  getElement?: () => HTMLElement | null | undefined;
};

// Reactive for `isFloatingPanelCovered` only: the panels claim and release
// their place from effects, which must not depend on the stack they write.
let openPanels = $state.raw<OpenPanel[]>([]);

function indexOfPanel(close: () => void): number {
  return openPanels.findIndex((panel) => panel.close === close);
}

/**
 * The floating panels opened from the side panel (discretization, palettes,
 * filters, text styles) show one at a time: claiming the place closes the
 * panels that held it. A panel opened from inside another one (`nested`)
 * stacks over it instead, since closing its host would unmount it. Call the
 * returned function when the panel closes.
 */
export function claimFloatingPanel(
  close: () => void,
  {
    nested = false,
    getElement
  }: {
    nested?: boolean;
    getElement?: OpenPanel['getElement'];
  } = {}
): () => void {
  const entry: OpenPanel = { close, getElement };
  untrack(() => {
    if (nested) {
      if (indexOfPanel(close) === -1) openPanels = [...openPanels, entry];
    } else {
      const displaced = openPanels
        .filter((panel) => panel.close !== close)
        .reverse();
      openPanels = [entry];
      for (const panel of displaced) panel.close();
    }
  });

  return () => {
    untrack(() => {
      openPanels = openPanels.filter((panel) => panel.close !== close);
    });
  };
}

/** Only the panel on top of the stack answers Escape. */
export function isTopmostFloatingPanel(close: () => void): boolean {
  return untrack(() => openPanels.at(-1)?.close === close);
}

/** Reactive: another panel is stacked over this one. */
export function isFloatingPanelCovered(close: () => void): boolean {
  const index = indexOfPanel(close);
  return index !== -1 && index < openPanels.length - 1;
}

/** The element of the panel this one is stacked over. */
export function getFloatingPanelHostElement(
  close: () => void
): HTMLElement | null {
  return untrack(() => {
    const index = indexOfPanel(close);
    return index > 0 ? (openPanels[index - 1].getElement?.() ?? null) : null;
  });
}

/** Closes the panels stacked over this one, from the top down. */
export function closeFloatingPanelsAbove(close: () => void): void {
  const above = untrack(() => {
    const index = indexOfPanel(close);
    return index === -1 ? [] : openPanels.slice(index + 1).reverse();
  });
  for (const panel of above) panel.close();
}

/**
 * Called during the initialisation of a floating panel that can host another
 * one. Returns whether this panel is itself rendered inside a floating panel.
 */
export function enterFloatingPanelScope(): boolean {
  const nested = getContext<boolean>(FLOATING_PANEL_SCOPE) === true;
  setContext(FLOATING_PANEL_SCOPE, true);
  return nested;
}

const NESTED_PANEL_GAP_PX = 8;
const NESTED_PANEL_CASCADE_PX = 24;
const VIEWPORT_EDGE_PX = 16;

export type NestedPanelPlacement = {
  right: string;
  cascaded: boolean;
};

/**
 * A stacked panel opens beside its host when the viewport has room for it,
 * otherwise cascaded over it so the host's edge stays in view.
 */
export function resolveNestedPanelPlacement(
  hostRect: Pick<DOMRect, 'left' | 'right'>,
  panelWidth: number,
  viewportWidth: number
): NestedPanelPlacement {
  const besideLeft = hostRect.left - NESTED_PANEL_GAP_PX - panelWidth;
  if (besideLeft >= VIEWPORT_EDGE_PX) {
    return {
      right: `${viewportWidth - hostRect.left + NESTED_PANEL_GAP_PX}px`,
      cascaded: false
    };
  }
  return {
    right: `${viewportWidth - hostRect.right + NESTED_PANEL_CASCADE_PX}px`,
    cascaded: true
  };
}

/** The panels slide in from the side panel they belong to. */
export function floatingPanelIn(node: Element): TransitionConfig {
  return fly(node, { x: 8, duration: motionDuration(180), easing: cubicOut });
}

export function floatingPanelOut(node: Element): TransitionConfig {
  return fly(node, { x: 8, duration: motionDuration(140), easing: cubicIn });
}

export function floatingPanelVeil(node: Element): TransitionConfig {
  return fade(node, { duration: motionDuration(140) });
}
