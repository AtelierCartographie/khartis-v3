/**
 * Data Tab Store
 *
 * Manages the state and navigation for the 3-step data control workflow:
 * 1. Contrôler les données (Data Control)
 * 2. Géolocaliser (Geolocation)
 * 3. Joindre (Basemap Join)
 */

import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';

export type DataTabStep = 'control' | 'geolocate' | 'join';

export class DataTabStore {
  private _state = $state({
    activeStepIndex: 0, // 0 = Contrôler, 1 = Géolocaliser, 2 = Joindre
    canNavigateToStep: [true, true, true] as [boolean, boolean, boolean],
    hasCompletedStep: [false, false, false] as [boolean, boolean, boolean]
  });

  // Getters
  get activeStepIndex() {
    return this._state.activeStepIndex;
  }

  get canNavigateToStep() {
    return this._state.canNavigateToStep;
  }

  get hasCompletedStep() {
    return this._state.hasCompletedStep;
  }

  // Computed: Current step name
  get currentStepName(): DataTabStep {
    const steps: DataTabStep[] = ['control', 'geolocate', 'join'];
    return steps[this._state.activeStepIndex];
  }

  // Computed: Can proceed to visualization
  get canVisualize() {
    return datasetsStore.datasets.length > 0 && this._state.hasCompletedStep[0]; // At least step 1 complete
  }

  /**
   * Navigate to a specific step
   */
  setActiveStep(index: number) {
    if (index < 0 || index > 2) {
      logger.warn('Invalid step index', LogCategory.UI, { index });
      return;
    }

    if (!this._state.canNavigateToStep[index]) {
      logger.warn(
        'Cannot navigate to step - prerequisites not met',
        LogCategory.UI,
        { index }
      );
      return;
    }

    logger.info('Navigating to data tab step', LogCategory.UI, {
      from: this._state.activeStepIndex,
      to: index
    });

    this._state.activeStepIndex = index;
  }

  /**
   * Mark a step as completed and unlock next step
   */
  markStepComplete(index: number) {
    if (index < 0 || index > 2) return;

    this._state.hasCompletedStep[index] = true;

    // Unlock next step
    if (index < 2) {
      this._state.canNavigateToStep[index + 1] = true;
    }

    logger.info('Step completed', LogCategory.UI, { step: index });
  }

  /**
   * Update navigation permissions based on data state
   */
  updateNavigationPermissions() {
    // All steps are always accessible (they will show empty state if no data)
    this._state.canNavigateToStep[0] = true;
    this._state.canNavigateToStep[1] = true;
    this._state.canNavigateToStep[2] = true;
  }

  /**
   * Reset to initial state
   */
  reset() {
    this._state.activeStepIndex = 0;
    this._state.canNavigateToStep = [true, true, true];
    this._state.hasCompletedStep = [false, false, false];
    logger.info('Data tab state reset', LogCategory.UI);
  }

  /**
   * Go to next step if possible
   */
  nextStep() {
    const nextIndex = this._state.activeStepIndex + 1;
    if (nextIndex <= 2 && this._state.canNavigateToStep[nextIndex]) {
      this.setActiveStep(nextIndex);
    }
  }

  /**
   * Go to previous step
   */
  previousStep() {
    const prevIndex = this._state.activeStepIndex - 1;
    if (prevIndex >= 0) {
      this.setActiveStep(prevIndex);
    }
  }
}

// Singleton instance
export const dataTabStore = new DataTabStore();
