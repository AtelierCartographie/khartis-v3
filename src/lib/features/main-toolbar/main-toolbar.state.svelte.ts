import { ToolbarStep } from '$lib/features/commons/types/global';
import { globalActions } from '$lib/features/commons/store/global.svelte';

export interface MainToolbarState {
  canNavigateToVisualization: boolean;
}

const DEFAULT_STATE: MainToolbarState = {
  canNavigateToVisualization: false
};

export const mainToolbarState = $state<MainToolbarState>({ ...DEFAULT_STATE });

export const mainToolbarActions = {
  setCanNavigateToVisualization(canNavigate: boolean): void {
    mainToolbarState.canNavigateToVisualization = canNavigate;
    console.log('[MainToolbar] 🔄 Navigation state updated:', { canNavigate });
  },

  navigateToVisualization(): void {
    if (mainToolbarState.canNavigateToVisualization) {
      globalActions.setNavigationState(ToolbarStep.Visualizations);
      console.log('[MainToolbar] ➡️  Navigating to visualization tab');
    } else {
      console.warn(
        '[MainToolbar] ⚠️  Cannot navigate to visualization: conditions not met'
      );
    }
  },

  navigateToData(): void {
    globalActions.setNavigationState(ToolbarStep.Data);
    console.log('[MainToolbar] ⬅️  Navigating to data tab');
  },

  reset(): void {
    Object.assign(mainToolbarState, DEFAULT_STATE);
    console.log('[MainToolbar] 🔄 State reset to default');
  }
};
