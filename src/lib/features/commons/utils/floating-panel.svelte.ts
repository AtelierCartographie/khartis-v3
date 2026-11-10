import { getContext, setContext } from 'svelte';
import { cubicIn, cubicOut } from 'svelte/easing';
import { fly, type TransitionConfig } from 'svelte/transition';
import { motionDuration } from './step-transition.svelte';

const FLOATING_PANEL_SCOPE = Symbol('floating-panel-scope');

let openPanels: Array<() => void> = [];

/**
 * The floating panels opened from the side panel (discretization, palettes,
 * filters, text styles) show one at a time: claiming the place closes the
 * panels that held it. A panel opened from inside another one (`nested`)
 * stacks over it instead, since closing its host would unmount it. Call the
 * returned function when the panel closes.
 */
export function claimFloatingPanel(
  close: () => void,
  { nested = false }: { nested?: boolean } = {}
): () => void {
  if (nested) {
    if (!openPanels.includes(close)) openPanels.push(close);
  } else {
    const displaced = openPanels.filter((other) => other !== close).reverse();
    openPanels = [close];
    for (const other of displaced) other();
  }

  return () => {
    openPanels = openPanels.filter((other) => other !== close);
  };
}

/** Only the panel on top of the stack answers Escape. */
export function isTopmostFloatingPanel(close: () => void): boolean {
  return openPanels.at(-1) === close;
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

/** The panels slide in from the side panel they belong to. */
export function floatingPanelIn(node: Element): TransitionConfig {
  return fly(node, { x: 8, duration: motionDuration(180), easing: cubicOut });
}

export function floatingPanelOut(node: Element): TransitionConfig {
  return fly(node, { x: 8, duration: motionDuration(140), easing: cubicIn });
}
