import {
  MAP_PROJECTION_TYPE,
  type MapProjectionTypeValue
} from '$lib/features/commons/constants';
import {
  BasemapStyle,
  getBasemapViewportPreset,
  getBasemapZone,
  type BasemapZone
} from '../constants/basemap-styles';
import {
  isDeckOrthographicEngine,
  isMapLibreInterleavedEngine,
  resolveMapRenderEngine,
  type MapRenderEngine
} from './render-engine.utils';
import type { BBox } from '../types';
import type { ProjectionPresets } from '../types/basemap.types';
import { getCompositeProjectionPresetId } from './user-projection.utils';

export type GlobeProjectionDisableReason =
  | 'france-zone'
  | 'custom-reference-basemap';

export interface ProjectionAvailabilityContext {
  engine: MapRenderEngine;
  zone: BasemapZone | null;
  referenceBasemapId?: string | null;
  referenceProjectionPresetId?: string | null;
  projectionBbox?: BBox | null;
  projectionPresets?: ProjectionPresets | null;
}

export interface ProjectionAvailabilityInput {
  requiresMapLibre: boolean;
  hasOSMBasemap?: boolean;
  currentStyle: BasemapStyle;
  preferredStyle?: BasemapStyle;
  referenceBasemapId?: string | null;
  referenceProjectionPresetId?: string | null;
  osmBasemapBbox?: [number, number, number, number] | null;
  projectionBbox?: BBox | null;
  projectionPresets?: ProjectionPresets | null;
}

export interface ProjectionSuggestionBasemapBoundsInput {
  currentStyle: BasemapStyle;
  preferredStyle?: BasemapStyle;
  referenceBasemapBbox?: [number, number, number, number] | null;
  currentBasemapBbox?: [number, number, number, number] | null;
  osmBasemapBbox?: [number, number, number, number] | null;
}

export const CDC_PRIMARY_PROJECTION_IDS = [
  'mercator',
  'natural-earth',
  'equirectangular',
  'orthographic',
  'albers',
  'lambert-conformal',
  'robinson',
  'winkel-tripel',
  'aitoff',
  'mollweide',
  'stereographic',
  'azimuthal-equal-area'
] as const;

const MAPLIBRE_GLOBE_PROJECTION_IDS = new Set(['mercator', 'orthographic']);
const FRANCE_COMPOSITE_PROJECTION_ID = 'composite:FRANCE_DOM_TOM';

const FRANCE_PRESET_BOUNDS =
  getBasemapViewportPreset(BasemapStyle.FRANCE_COULEURS)?.bounds ?? null;

export function isCustomReferenceBasemap(
  referenceBasemapId: string | null | undefined
): boolean {
  return /^custom_basemap_/i.test(referenceBasemapId ?? '');
}

export function resolveGlobeProjectionDisableReason(
  zone: BasemapZone | null,
  referenceBasemapId?: string | null
): GlobeProjectionDisableReason | null {
  if (isCustomReferenceBasemap(referenceBasemapId)) {
    return 'custom-reference-basemap';
  }

  if (zone === 'france') {
    return 'france-zone';
  }

  return null;
}

export function isGlobeProjectionDisabled(
  zone: BasemapZone | null,
  referenceBasemapId?: string | null
): boolean {
  return resolveGlobeProjectionDisableReason(zone, referenceBasemapId) !== null;
}

export function isGlobeProjectionAvailable(
  zone: BasemapZone | null,
  referenceBasemapId?: string | null
): boolean {
  return !isGlobeProjectionDisabled(zone, referenceBasemapId);
}

export function resolveProjectionForBasemapZone(
  projection: MapProjectionTypeValue,
  zone: BasemapZone | null,
  referenceBasemapId?: string | null
): MapProjectionTypeValue {
  return isGlobeProjectionDisabled(zone, referenceBasemapId)
    ? MAP_PROJECTION_TYPE.MERCATOR
    : projection;
}

export function resolveProjectionAvailabilityContext(
  input: ProjectionAvailabilityInput
): ProjectionAvailabilityContext {
  const engine = resolveMapRenderEngine(input);

  return {
    engine,
    zone: isMapLibreInterleavedEngine(engine)
      ? resolveMapLibreProjectionZone(input)
      : resolvePreferredStyleZone(input),
    referenceBasemapId: input.referenceBasemapId ?? null,
    referenceProjectionPresetId: input.referenceProjectionPresetId ?? null,
    projectionBbox: input.projectionBbox ?? null,
    projectionPresets: input.projectionPresets ?? null
  };
}

export function supportsProjectionSuggestions(
  context: ProjectionAvailabilityContext
): boolean {
  return isDeckOrthographicEngine(context.engine);
}

export function supportsCustomProjectionCode(
  context: ProjectionAvailabilityContext
): boolean {
  return isDeckOrthographicEngine(context.engine);
}

export function getAvailableProjectionIds(
  context: ProjectionAvailabilityContext,
  projectionIds: readonly string[]
): string[] {
  if (isDeckOrthographicEngine(context.engine)) {
    return projectionIds.filter((projectionId) =>
      isDeckProjectionCompatibleWithContext(projectionId, context)
    );
  }

  const allowGlobe = isGlobeProjectionAvailable(
    context.zone,
    context.referenceBasemapId
  );

  return projectionIds.filter((projectionId) =>
    allowGlobe
      ? MAPLIBRE_GLOBE_PROJECTION_IDS.has(projectionId)
      : projectionId === 'mercator'
  );
}

function isDeckProjectionCompatibleWithContext(
  projectionId: string,
  context: ProjectionAvailabilityContext
): boolean {
  const presetId = getCompositeProjectionPresetId(projectionId);
  if (!presetId) {
    return true;
  }

  if (projectionId === FRANCE_COMPOSITE_PROJECTION_ID) {
    return (
      (context.zone === 'france' ||
        context.referenceProjectionPresetId === presetId) &&
      isCompositeCompatibleWithContext(presetId, context)
    );
  }

  return isCompositeCompatibleWithContext(presetId, context);
}

export function isProjectionAvailable(
  projectionId: string,
  context: ProjectionAvailabilityContext
): boolean {
  return getAvailableProjectionIds(context, [projectionId]).length > 0;
}

export function resolveDisplayedProjectionId(params: {
  context: ProjectionAvailabilityContext;
  selectedProjectionId: string;
  mapProjection: MapProjectionTypeValue;
}): string {
  const { context, selectedProjectionId, mapProjection } = params;

  if (isProjectionAvailable(selectedProjectionId, context)) {
    return selectedProjectionId;
  }

  if (
    mapProjection === MAP_PROJECTION_TYPE.GLOBE &&
    isProjectionAvailable('orthographic', context)
  ) {
    return 'orthographic';
  }

  return 'mercator';
}

export function resolveProjectionSuggestionBoundsFromBasemap(
  input: ProjectionSuggestionBasemapBoundsInput
): [number, number, number, number] | null {
  if (input.referenceBasemapBbox) {
    return [...input.referenceBasemapBbox];
  }

  if (input.currentBasemapBbox) {
    return [...input.currentBasemapBbox];
  }

  if (input.osmBasemapBbox) {
    return [...input.osmBasemapBbox];
  }

  const styleContext = resolveStyleContext(
    input.currentStyle,
    input.preferredStyle
  );

  const viewportPreset = getBasemapViewportPreset(styleContext);
  if (!viewportPreset) {
    return null;
  }

  return [
    viewportPreset.bounds[0][0],
    viewportPreset.bounds[0][1],
    viewportPreset.bounds[1][0],
    viewportPreset.bounds[1][1]
  ];
}

function resolveMapLibreProjectionZone(
  input: ProjectionAvailabilityInput
): BasemapZone | null {
  const styleZone = getBasemapZone(input.currentStyle);
  if (styleZone) {
    return styleZone;
  }

  const bboxZone = resolveZoneFromBbox(input.osmBasemapBbox ?? null);
  if (bboxZone) {
    return bboxZone;
  }

  if (input.hasOSMBasemap) {
    return 'monde';
  }

  return resolvePreferredStyleZone(input);
}

function resolvePreferredStyleZone(
  input: Pick<ProjectionAvailabilityInput, 'currentStyle' | 'preferredStyle'>
): BasemapZone | null {
  return getBasemapZone(
    resolveStyleContext(input.currentStyle, input.preferredStyle)
  );
}

function resolveStyleContext(
  currentStyle: BasemapStyle,
  preferredStyle?: BasemapStyle
): BasemapStyle {
  if (currentStyle !== BasemapStyle.BLANK_WHITE) {
    return currentStyle;
  }

  return preferredStyle ?? currentStyle;
}

function resolveZoneFromBbox(
  bbox: [number, number, number, number] | null
): BasemapZone | null {
  if (!bbox) {
    return null;
  }

  if (FRANCE_PRESET_BOUNDS && isBboxInsideBounds(bbox, FRANCE_PRESET_BOUNDS)) {
    return 'france';
  }

  return 'monde';
}

function isBboxInsideBounds(
  bbox: [number, number, number, number],
  bounds: [[number, number], [number, number]]
): boolean {
  return (
    bbox[0] >= bounds[0][0] &&
    bbox[1] >= bounds[0][1] &&
    bbox[2] <= bounds[1][0] &&
    bbox[3] <= bounds[1][1]
  );
}

function isCompositeCompatibleWithContext(
  presetId: string,
  context: ProjectionAvailabilityContext
): boolean {
  if (
    context.referenceBasemapId &&
    context.referenceProjectionPresetId !== presetId
  ) {
    return false;
  }

  const projectionBbox = context.projectionBbox;
  if (!projectionBbox || !context.projectionPresets) {
    return true;
  }

  const preset = context.projectionPresets[presetId];
  if (!preset?.entries?.length) {
    return false;
  }

  return preset.entries.some((entry) =>
    bboxesIntersect(projectionBbox, [
      entry.bounds[0][0],
      entry.bounds[0][1],
      entry.bounds[1][0],
      entry.bounds[1][1]
    ])
  );
}

function bboxesIntersect(a: BBox, b: BBox): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}
