import {
  globalActions,
  globalState
} from '$lib/features/commons/stores/global.svelte';
import { StylingTools, ToolbarStep } from '$lib/features/commons/types/global';

export function activateStylingToolFromMap(tool: StylingTools): void {
  if (globalState.selectedStep !== ToolbarStep.Styling) {
    globalActions.setNavigationState(ToolbarStep.Styling);
  }

  if (globalState.isMobileView) {
    globalActions.openMobileToolbar();
  }

  globalActions.setSelectedTool(tool);
}
