export const APP_LOADING_PHASE = {
  INTERFACE: 'interface',
  PROJECT: 'project',
  ENGINE: 'engine',
  BASEMAPS: 'basemaps',
  DATA: 'data',
  VISUALIZATIONS: 'visualizations',
  JOINS: 'joins'
} as const;

export type AppLoadingPhase =
  (typeof APP_LOADING_PHASE)[keyof typeof APP_LOADING_PHASE];

let phase = $state<AppLoadingPhase>(APP_LOADING_PHASE.INTERFACE);

/** What the start-up loader tells the user Khartis is busy with. */
export const appLoadingStore = {
  get phase(): AppLoadingPhase {
    return phase;
  },
  setPhase(nextPhase: AppLoadingPhase): void {
    phase = nextPhase;
  }
};
