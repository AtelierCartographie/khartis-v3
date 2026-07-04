import { createLayerId, type DeckLayerId } from '../constants';
import type { LayerContext } from '../types';

function resolveThematicScopeId(ctx: LayerContext): string {
  return ctx.viz?.id ?? ctx.datasetId ?? 'default';
}

export function createThematicLayerId(
  layerType: DeckLayerId,
  ctx: LayerContext
): string {
  return createLayerId(
    layerType,
    resolveThematicScopeId(ctx),
    ctx.projectionSuffix
  );
}
