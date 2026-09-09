import {
  globalActions,
  globalState
} from '$lib/features/commons/stores/global.svelte';
import {
  StylingTools,
  ToolbarStep,
  VisualizationTools
} from '$lib/features/commons/types/global';

function activateToolFromMap(
  step: ToolbarStep,
  tool: StylingTools | VisualizationTools
): void {
  if (globalState.selectedStep !== step) {
    globalActions.setNavigationState(step);
  }

  if (globalState.isMobileView) {
    globalActions.openMobileToolbar();
  }

  globalActions.setSelectedTool(tool);
}

export function activateStylingToolFromMap(tool: StylingTools): void {
  activateToolFromMap(ToolbarStep.Styling, tool);
}

export function activateVisualizationToolFromMap(
  tool: VisualizationTools
): void {
  activateToolFromMap(ToolbarStep.Visualizations, tool);
}
