import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';

export type DataTabStep = 'control' | 'geolocate' | 'join' | 'enrich';
export type WorkflowMode = 'tabular' | 'geographic' | 'auto';

interface DataTabState {
  activeStepIndex: number;
  canNavigateToStep: [boolean, boolean, boolean];
  hasCompletedStep: [boolean, boolean, boolean];
  workflowMode: WorkflowMode;
  primaryDatasetId: string | undefined;
  primaryBasemapId: string | undefined;
}

const state = $state<DataTabState>({
  activeStepIndex: 0,
  canNavigateToStep: [true, false, false],
  hasCompletedStep: [false, false, false],
  workflowMode: 'auto',
  primaryDatasetId: undefined,
  primaryBasemapId: undefined
});

function getStepNames(isGeographic: boolean): DataTabStep[] {
  if (isGeographic) {
    return ['control', 'enrich'];
  }
  return ['control', 'geolocate', 'join'];
}

function getEffectiveWorkflowMode(): WorkflowMode {
  const selectedDataset = datasetsStore.selectedDataset;
  if (!selectedDataset) return 'auto';
  if (selectedDataset.geometry) {
    return 'geographic';
  }
  return 'tabular';
}

function isGeographicMode(): boolean {
  return getEffectiveWorkflowMode() === 'geographic';
}

function getStepCount(): number {
  return isGeographicMode() ? 2 : 3;
}

function setWorkflowMode(mode: WorkflowMode) {
  state.workflowMode = mode;
}

function setPrimaryDatasetId(id: string | undefined) {
  state.primaryDatasetId = id;
}

function setPrimaryBasemapId(id: string | undefined) {
  state.primaryBasemapId = id;
}

function setActiveStep(index: number) {
  const maxIndex = getStepCount() - 1;
  if (index < 0 || index > maxIndex) {
    return;
  }
  if (!state.canNavigateToStep[index]) {
    return;
  }
  state.activeStepIndex = index;
}

function markStepComplete(index: number) {
  const maxIndex = getStepCount() - 1;
  if (index < 0 || index > maxIndex) return;

  state.hasCompletedStep[index] = true;

  if (index < maxIndex) {
    state.canNavigateToStep[index + 1] = true;
  }
}

function updateNavigationPermissions() {
  state.canNavigateToStep[0] = true;

  if (isGeographicMode()) {
    state.canNavigateToStep[1] = state.hasCompletedStep[0];
  } else {
    state.canNavigateToStep[1] = state.hasCompletedStep[0];
    state.canNavigateToStep[2] = state.hasCompletedStep[1];
  }
}

function reset() {
  state.activeStepIndex = 0;
  state.canNavigateToStep = [true, false, false];
  state.hasCompletedStep = [false, false, false];
  state.workflowMode = 'auto';
  state.primaryDatasetId = undefined;
  state.primaryBasemapId = undefined;
}

function nextStep() {
  const nextIndex = state.activeStepIndex + 1;
  const maxIndex = getStepCount() - 1;
  if (nextIndex <= maxIndex && state.canNavigateToStep[nextIndex]) {
    setActiveStep(nextIndex);
  }
}

function previousStep() {
  const prevIndex = state.activeStepIndex - 1;
  if (prevIndex >= 0) {
    setActiveStep(prevIndex);
  }
}

export const dataTabStore = {
  get activeStepIndex() {
    return state.activeStepIndex;
  },
  get canNavigateToStep() {
    return state.canNavigateToStep;
  },
  get hasCompletedStep() {
    return state.hasCompletedStep;
  },
  get currentStepName(): DataTabStep {
    return getStepNames(isGeographicMode())[state.activeStepIndex];
  },
  get canVisualize() {
    return datasetsStore.datasets.length > 0 && state.hasCompletedStep[0];
  },
  get workflowMode() {
    return state.workflowMode;
  },
  get effectiveWorkflowMode(): WorkflowMode {
    return getEffectiveWorkflowMode();
  },
  get isGeographicMode(): boolean {
    return isGeographicMode();
  },
  get stepCount(): number {
    return getStepCount();
  },
  get stepNames(): DataTabStep[] {
    return getStepNames(isGeographicMode());
  },
  get isReadyForVisualization(): boolean {
    if (isGeographicMode()) {
      return state.hasCompletedStep[0];
    }
    return state.hasCompletedStep[2];
  },
  get primaryDatasetId() {
    return state.primaryDatasetId;
  },
  get primaryBasemapId() {
    return state.primaryBasemapId;
  },
  setWorkflowMode,
  setPrimaryDatasetId,
  setPrimaryBasemapId,
  setActiveStep,
  markStepComplete,
  updateNavigationPermissions,
  reset,
  nextStep,
  previousStep
};
