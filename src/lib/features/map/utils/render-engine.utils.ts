export const MAP_RENDER_ENGINE = {
  DECK_ORTHOGRAPHIC: 'deck-orthographic',
  MAPLIBRE_INTERLEAVED: 'maplibre-interleaved'
} as const;

export type MapRenderEngine =
  (typeof MAP_RENDER_ENGINE)[keyof typeof MAP_RENDER_ENGINE];

export interface MapRenderEngineInput {
  requiresMapLibre: boolean;
  hasOSMBasemap?: boolean | null;
}

export function shouldUseMapLibreInterleaved(
  input: MapRenderEngineInput
): boolean {
  return input.requiresMapLibre || Boolean(input.hasOSMBasemap);
}

export function resolveMapRenderEngine(
  input: MapRenderEngineInput
): MapRenderEngine {
  return shouldUseMapLibreInterleaved(input)
    ? MAP_RENDER_ENGINE.MAPLIBRE_INTERLEAVED
    : MAP_RENDER_ENGINE.DECK_ORTHOGRAPHIC;
}

export function isDeckOrthographicEngine(engine: MapRenderEngine): boolean {
  return engine === MAP_RENDER_ENGINE.DECK_ORTHOGRAPHIC;
}

export function isMapLibreInterleavedEngine(engine: MapRenderEngine): boolean {
  return engine === MAP_RENDER_ENGINE.MAPLIBRE_INTERLEAVED;
}
