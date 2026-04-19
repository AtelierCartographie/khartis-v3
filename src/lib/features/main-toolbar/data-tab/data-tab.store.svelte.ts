import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
import { persistenceRegistry } from '$lib/features/project-management/core/persistence-registry';
import { hasGPSCoordinateColumns } from '$lib/features/commons/utils/geo-detector.utils';

export type DataTabStep =
  | 'control'
  | 'geolocate'
  | 'join'
  | 'basemap'
  | 'enrich';
export type WorkflowMode = 'tabular' | 'tabular-gps' | 'geographic' | 'auto';

export interface DataTabWorkflowState {
  activeStepIndex: number;
  canNavigateToStep: [boolean, boolean, boolean];
  hasCompletedStep: [boolean, boolean, boolean];
  workflowMode: WorkflowMode;
  primaryDatasetId: string | undefined;
  primaryBasemapId: string | undefined;
}

const DEFAULT_STATE: DataTabWorkflowState = {
  activeStepIndex: 0,
  canNavigateToStep: [true, false, false],
  hasCompletedStep: [false, false, false],
  workflowMode: 'auto',
  primaryDatasetId: undefined,
  primaryBasemapId: undefined
};

const state = $state<DataTabWorkflowState>(structuredClone(DEFAULT_STATE));

function notifyPersistence(): void {
  persistenceRegistry.notifyChange('dataWorkflow');
}

function getStepNames(mode: WorkflowMode): DataTabStep[] {
  if (mode === 'geographic') {
    return ['control', 'enrich'];
  }
  if (mode === 'tabular-gps') {
    return ['control', 'geolocate', 'basemap'];
  }
  return ['control', 'geolocate', 'join'];
}

function usesTwoStepNavigation(mode: WorkflowMode): boolean {
  return mode === 'geographic';
}

function getEffectiveWorkflowMode(): WorkflowMode {
  const selectedDataset = datasetsStore.selectedDataset;
  if (!selectedDataset) return 'auto';
  if (selectedDataset.geometry) {
    return 'geographic';
  }
  if (
    hasGPSCoordinateColumns(
      selectedDataset.columns,
      selectedDataset.geoDetection
    )
  ) {
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

function getDisplayedStepNumber(step: DataTabStep): number | null {
  const currentMode = getEffectiveWorkflowMode();
  const normalizedStep =
    step === 'basemap' && currentMode !== 'tabular-gps' ? 'join' : step;
  const stepIndex = getStepNames(currentMode).indexOf(normalizedStep);

  return stepIndex === -1 ? null : stepIndex + 1;
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
  notifyPersistence();
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

  notifyPersistence();
}

function resetStepCompletion(index: number) {
  const maxIndex = getStepCount() - 1;
  if (index < 0 || index > maxIndex) return;
  if (!state.hasCompletedStep[index]) return;

  const next = [...state.hasCompletedStep] as [boolean, boolean, boolean];
  next[index] = false;
  state.hasCompletedStep = next;
  notifyPersistence();
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

  notifyPersistence();
}

function restoreFromSerialized(data: unknown): void {
  const restored = data as Partial<DataTabWorkflowState> | undefined;
  const nextState = structuredClone(DEFAULT_STATE);

  if (restored) {
    Object.assign(nextState, restored);
  }

  nextState.canNavigateToStep = restored?.canNavigateToStep
    ? ([...restored.canNavigateToStep] as [boolean, boolean, boolean])
    : [...DEFAULT_STATE.canNavigateToStep];
  nextState.hasCompletedStep = restored?.hasCompletedStep
    ? ([...restored.hasCompletedStep] as [boolean, boolean, boolean])
    : [...DEFAULT_STATE.hasCompletedStep];

  Object.assign(state, nextState);
}

function reset() {
  restoreFromSerialized(undefined);
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
  getDisplayedStepNumber(step: DataTabStep): number | null {
    return getDisplayedStepNumber(step);
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

persistenceRegistry.register({
  key: 'dataWorkflow',
  serialize: () => ({
    activeStepIndex: state.activeStepIndex,
    canNavigateToStep: [...state.canNavigateToStep] as [
      boolean,
      boolean,
      boolean
    ],
    hasCompletedStep: [...state.hasCompletedStep] as [
      boolean,
      boolean,
      boolean
    ],
    workflowMode: state.workflowMode,
    primaryDatasetId: state.primaryDatasetId,
    primaryBasemapId: state.primaryBasemapId
  }),
  deserialize: (data: unknown) => restoreFromSerialized(data),
  reset,
  priority: 'debounced'
});
