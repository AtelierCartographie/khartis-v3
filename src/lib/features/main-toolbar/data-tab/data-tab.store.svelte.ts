import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';

export type DataTabStep = 'control' | 'geolocate' | 'join' | 'enrich';
export type WorkflowMode = 'tabular' | 'geographic' | 'auto';

export class DataTabStore {
  private _state = $state({
    activeStepIndex: 0,
    canNavigateToStep: [true, true, true] as [boolean, boolean, boolean],
    hasCompletedStep: [false, false, false] as [boolean, boolean, boolean],
    workflowMode: 'auto' as WorkflowMode,
    primaryDatasetId: undefined as string | undefined,
    primaryBasemapId: undefined as string | undefined
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
    return this.stepNames[this._state.activeStepIndex];
  }

  get canVisualize() {
    return datasetsStore.datasets.length > 0 && this._state.hasCompletedStep[0];
  }

  get workflowMode() {
    return this._state.workflowMode;
  }

  get effectiveWorkflowMode(): WorkflowMode {
    const selectedDataset = datasetsStore.selectedDataset;
    if (!selectedDataset) return 'auto';

    if (selectedDataset.geometry) {
      return 'geographic';
    }
    return 'tabular';
  }

  get isGeographicMode(): boolean {
    return this.effectiveWorkflowMode === 'geographic';
  }

  get stepCount(): number {
    return this.isGeographicMode ? 2 : 3;
  }

  get stepNames(): DataTabStep[] {
    if (this.isGeographicMode) {
      return ['control', 'enrich'];
    }
    return ['control', 'geolocate', 'join'];
  }

  get isReadyForVisualization(): boolean {
    if (this.isGeographicMode) {
      return this._state.hasCompletedStep[0];
    }
    return this._state.hasCompletedStep[2];
  }

  get primaryDatasetId() {
    return this._state.primaryDatasetId;
  }

  get primaryBasemapId() {
    return this._state.primaryBasemapId;
  }

  setWorkflowMode(mode: WorkflowMode) {
    this._state.workflowMode = mode;
  }

  setPrimaryDatasetId(id: string | undefined) {
    this._state.primaryDatasetId = id;
  }

  setPrimaryBasemapId(id: string | undefined) {
    this._state.primaryBasemapId = id;
  }

  setActiveStep(index: number) {
    const maxIndex = this.stepCount - 1;
    if (index < 0 || index > maxIndex) {
      return;
    }

    if (!this._state.canNavigateToStep[index]) {
      return;
    }

    this._state.activeStepIndex = index;
  }

  markStepComplete(index: number) {
    const maxIndex = this.stepCount - 1;
    if (index < 0 || index > maxIndex) return;

    this._state.hasCompletedStep[index] = true;

    if (index < maxIndex) {
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
    this._state.workflowMode = 'auto';
    this._state.primaryDatasetId = undefined;
    this._state.primaryBasemapId = undefined;
  }

  nextStep() {
    const nextIndex = this._state.activeStepIndex + 1;
    const maxIndex = this.stepCount - 1;
    if (nextIndex <= maxIndex && this._state.canNavigateToStep[nextIndex]) {
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
