import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
import { hasGPSCoordinateColumns } from '$lib/features/commons/utils/geo-detector.utils';

export type DataTabStep =
  | 'control'
  | 'geolocate'
  | 'join'
  | 'basemap'
  | 'enrich';
export type WorkflowMode = 'tabular' | 'tabular-gps' | 'geographic' | 'auto';

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

function getStepNames(mode: WorkflowMode): DataTabStep[] {
  if (mode === 'geographic') {
    return ['control', 'enrich'];
  }
  if (mode === 'tabular-gps') {
    return ['control', 'basemap'];
  }
  return ['control', 'geolocate', 'join'];
}

function usesTwoStepNavigation(mode: WorkflowMode): boolean {
  return mode === 'geographic' || mode === 'tabular-gps';
}

function getEffectiveWorkflowMode(): WorkflowMode {
  const selectedDataset = datasetsStore.selectedDataset;
  if (!selectedDataset) return 'auto';
  if (selectedDataset.geometry) {
    return 'geographic';
  }
  if (hasGPSCoordinateColumns(selectedDataset.columns)) {
    return 'tabular-gps';
  }
  return 'tabular';
}

function isGeographicMode(): boolean {
  return getEffectiveWorkflowMode() === 'geographic';
}

function isTabularGPSMode(): boolean {
  return getEffectiveWorkflowMode() === 'tabular-gps';
}

function isTwoStepMode(): boolean {
  return usesTwoStepNavigation(getEffectiveWorkflowMode());
}

function getStepCount(): number {
  return isTwoStepMode() ? 2 : 3;
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
  if (state.hasCompletedStep[index]) return;

  const next = [...state.hasCompletedStep] as [boolean, boolean, boolean];
  next[index] = true;
  state.hasCompletedStep = next;

  if (index < maxIndex) {
    state.canNavigateToStep[index + 1] = true;
  }
}

function resetStepCompletion(index: number) {
  const maxIndex = getStepCount() - 1;
  if (index < 0 || index > maxIndex) return;
  if (!state.hasCompletedStep[index]) return;

  const next = [...state.hasCompletedStep] as [boolean, boolean, boolean];
  next[index] = false;
  state.hasCompletedStep = next;
}

function updateNavigationPermissions() {
  state.canNavigateToStep[0] = true;

  if (isTwoStepMode()) {
    state.canNavigateToStep[1] = state.hasCompletedStep[0];
    state.canNavigateToStep[2] = false;
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
    const mode = getEffectiveWorkflowMode();
    return getStepNames(mode)[state.activeStepIndex];
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
  get isTabularGPSMode(): boolean {
    return isTabularGPSMode();
  },
  get stepCount(): number {
    return getStepCount();
  },
  get stepNames(): DataTabStep[] {
    const mode = getEffectiveWorkflowMode();
    return getStepNames(mode);
  },
  /** The step index where the basemap-join step lives (last step for tabular workflows) */
  get basemapStepIndex(): number {
    if (isGeographicMode()) return -1;
    return getStepCount() - 1;
  },
  get isReadyForVisualization(): boolean {
    if (isGeographicMode()) {
      return state.hasCompletedStep[0];
    }
    // tabular-gps: step 1 is basemap, tabular: step 2 is join
    const lastStepIndex = getStepCount() - 1;
    return state.hasCompletedStep[lastStepIndex];
  },
  get primaryDatasetId() {
    return state.primaryDatasetId;
  },
  get primaryBasemapId() {
    return state.primaryBasemapId;
  },
  setActiveStep,
  markStepComplete,
  resetStepCompletion,
  updateNavigationPermissions,
  reset
};
