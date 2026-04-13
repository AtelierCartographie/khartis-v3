import { StylingTools } from '$lib/features/commons/types/global';
import type { VisualizationTools } from '$lib/features/commons/types/global';

export function shouldBlockToolClose(
  tool: StylingTools | VisualizationTools | undefined,
  isAnnotationsDrawingMode: boolean
): boolean {
  return tool === StylingTools.Annotations && isAnnotationsDrawingMode;
}
