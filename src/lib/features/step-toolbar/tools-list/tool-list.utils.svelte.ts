import {
  globalActions,
  globalState
} from '$lib/features/commons/stores/global.svelte';
import {
  StylingTools,
  VisualizationTools
} from '$lib/features/commons/types/global';

const STYLING_TOOL_IDS: readonly (StylingTools | VisualizationTools)[] = [
  StylingTools.Format,
  StylingTools.Legend,
  StylingTools.GeoIndications,
  StylingTools.Annotations,
  StylingTools.ColorBlindness
];

function isStylingTool(
  tool: StylingTools | VisualizationTools | undefined
): tool is StylingTools {
  return tool !== undefined && STYLING_TOOL_IDS.includes(tool);
}

export function closeSelectedToolPanel(): void {
  const selectedTool = globalState.selectedTool;

  globalState.selectedTool = undefined;

  if (isStylingTool(selectedTool)) {
    globalActions.resetPagePan();
  }
}

export function selectTool(tool?: StylingTools | VisualizationTools): void {
  const selectedTool = globalState.selectedTool;

  if (!tool || selectedTool === tool) {
    closeSelectedToolPanel();
  } else {
    if (isStylingTool(selectedTool)) {
      globalActions.resetPagePan();
    }

    globalState.selectedTool = tool;
  }
}
