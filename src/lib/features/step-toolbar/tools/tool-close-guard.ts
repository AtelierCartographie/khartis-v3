import { StylingTools } from '$lib/features/commons/types/global';
import type { VisualizationTools } from '$lib/features/commons/types/global';

export function shouldBlockToolClose(
  tool: StylingTools | VisualizationTools | undefined,
  isAnnotationsCreationActive: boolean
): boolean {
  return tool === StylingTools.Annotations && isAnnotationsCreationActive;
}
