import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';

export type DataTabStep = 'control' | 'geolocate' | 'join';

export class DataTabStore {
  private _state = $state({
    activeStepIndex: 0,
    canNavigateToStep: [true, true, true] as [boolean, boolean, boolean],
    hasCompletedStep: [false, false, false] as [boolean, boolean, boolean]
  });

  get activeStepIndex() {
    return this._state.activeStepIndex;
  }

  get canNavigateToStep() {
    return this._state.canNavigateToStep;
  }

  get hasCompletedStep() {
    return this._state.hasCompletedStep;
  }

  get currentStepName(): DataTabStep {
    const steps: DataTabStep[] = ['control', 'geolocate', 'join'];
    return steps[this._state.activeStepIndex];
  }

  get canVisualize() {
    return datasetsStore.datasets.length > 0 && this._state.hasCompletedStep[0];
  }

  setActiveStep(index: number) {
    if (index < 0 || index > 2) {
      return;
    }

    if (!this._state.canNavigateToStep[index]) {
      return;
    }

    this._state.activeStepIndex = index;
  }

  markStepComplete(index: number) {
    if (index < 0 || index > 2) return;

    this._state.hasCompletedStep[index] = true;

    if (index < 2) {
      this._state.canNavigateToStep[index + 1] = true;
    }
  }

  updateNavigationPermissions() {
    this._state.canNavigateToStep[0] = true;
    this._state.canNavigateToStep[1] = true;
    this._state.canNavigateToStep[2] = true;
  }

  reset() {
    this._state.activeStepIndex = 0;
    this._state.canNavigateToStep = [true, true, true];
    this._state.hasCompletedStep = [false, false, false];
  }

  nextStep() {
    const nextIndex = this._state.activeStepIndex + 1;
    if (nextIndex <= 2 && this._state.canNavigateToStep[nextIndex]) {
      this.setActiveStep(nextIndex);
    }
  }

  previousStep() {
    const prevIndex = this._state.activeStepIndex - 1;
    if (prevIndex >= 0) {
      this.setActiveStep(prevIndex);
    }
  }
}

export const dataTabStore = new DataTabStore();
