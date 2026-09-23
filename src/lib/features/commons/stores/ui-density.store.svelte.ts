import { globalState } from './global.svelte';

export const UI_DENSITY = {
  COMFORTABLE: 'comfortable',
  COMPACT: 'compact'
} as const;

export type UiDensity = (typeof UI_DENSITY)[keyof typeof UI_DENSITY];

const UI_DENSITY_STORAGE_KEY = 'khartis_ui_density';

function readStoredDensity(): UiDensity {
  try {
    return localStorage.getItem(UI_DENSITY_STORAGE_KEY) === UI_DENSITY.COMPACT
      ? UI_DENSITY.COMPACT
      : UI_DENSITY.COMFORTABLE;
  } catch {
    return UI_DENSITY.COMFORTABLE;
  }
}

function persistDensity(density: UiDensity): void {
  try {
    localStorage.setItem(UI_DENSITY_STORAGE_KEY, density);
  } catch {
    return;
  }
}

function applyDocumentDensity(density: UiDensity): void {
  if (typeof document === 'undefined') return;

  document.documentElement.dataset.density = density;
}

function createUiDensityStore() {
  const initialDensity = readStoredDensity();
  let density = $state<UiDensity>(initialDensity);

  applyDocumentDensity(initialDensity);

  function setDensity(nextDensity: UiDensity): void {
    density = nextDensity;
    applyDocumentDensity(nextDensity);
    persistDensity(nextDensity);
  }

  return {
    get density(): UiDensity {
      return density;
    },
    get isCompact(): boolean {
      return density === UI_DENSITY.COMPACT;
    },
    get appliedDensity(): UiDensity {
      return globalState.isMobileView ? UI_DENSITY.COMFORTABLE : density;
    },
    setDensity
  };
}

export const uiDensityStore = createUiDensityStore();
