import type {
  StylingTools,
  VisualizationTools
} from '$lib/features/commons/types/global';
import { globalState } from '$lib/features/commons/store/global.svelte';

export function selectTool(tool?: StylingTools | VisualizationTools) {
  if (globalState.selectedTool === tool) {
    globalState.selectedTool = undefined;
  } else {
    globalState.selectedTool = tool;
  }
}
