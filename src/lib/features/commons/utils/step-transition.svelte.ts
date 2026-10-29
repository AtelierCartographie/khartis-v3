import { untrack } from 'svelte';
import { prefersReducedMotion } from 'svelte/motion';
import { globalState } from '../stores/global.svelte';
import { ToolbarStep } from '../types/global';

const STEP_ORDER: readonly ToolbarStep[] = [
  ToolbarStep.Data,
  ToolbarStep.Visualizations,
  ToolbarStep.Styling
];

export type StepDirection = 1 | -1;

/** A transition duration, or 0 when the system asks for reduced motion. */
export function motionDuration(ms: number): number {
  return prefersReducedMotion.current ? 0 : ms;
}

/**
 * Follows the direction of the last step change in the Données →
 * Visualisations → Habillage order: 1 forward, -1 back. Content that swaps
 * with the step slides along that axis. Call it while a component
 * initialises; the value is updated before the DOM swaps.
 */
export function trackStepDirection(): { readonly current: StepDirection } {
  let direction = $state<StepDirection>(1);
  let previous = untrack(() => globalState.selectedStep);

  $effect.pre(() => {
    const step = globalState.selectedStep;
    untrack(() => {
      if (step === previous) return;
      direction =
        STEP_ORDER.indexOf(step) > STEP_ORDER.indexOf(previous) ? 1 : -1;
      previous = step;
    });
  });

  return {
    get current() {
      return direction;
    }
  };
}
