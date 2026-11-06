import { cubicIn, cubicOut } from 'svelte/easing';
import { fly, type TransitionConfig } from 'svelte/transition';
import { motionDuration } from './step-transition.svelte';

let closeActivePanel: (() => void) | null = null;

/**
 * The floating panels opened from the side panel (discretization, palettes,
 * filters, text styles) show one at a time: claiming the place closes the
 * panel that held it. Call the returned function when the panel closes.
 */
export function claimFloatingPanel(close: () => void): () => void {
  const previous = closeActivePanel;
  closeActivePanel = close;
  if (previous && previous !== close) {
    previous();
  }

  return () => {
    if (closeActivePanel === close) {
      closeActivePanel = null;
    }
  };
}

/** The panels slide in from the side panel they belong to. */
export function floatingPanelIn(node: Element): TransitionConfig {
  return fly(node, { x: 8, duration: motionDuration(180), easing: cubicOut });
}

export function floatingPanelOut(node: Element): TransitionConfig {
  return fly(node, { x: 8, duration: motionDuration(140), easing: cubicIn });
}
