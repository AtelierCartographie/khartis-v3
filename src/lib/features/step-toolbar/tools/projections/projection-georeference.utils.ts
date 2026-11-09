import { basemapStyleStore } from '$lib/features/commons/stores/basemap-style.store.svelte';
import {
  applyAffineTransform,
  fitAffineTransform,
  wrapProj4AsWkt,
  type AffineTransform
} from '$lib/features/commons/utils/georeference.utils';
import type { MapExportPlacement } from '$lib/features/commons/utils/map-export.utils';
import {
  basemapService,
  mapProjectionStore,
  osmBasemapStore
} from '$lib/features/map';
import { createMapViewportDataReader } from '$lib/features/map/utils/map-viewport-data.utils';
import { shouldUseMapLibreInterleaved } from '$lib/features/map/utils/render-engine.utils';
import { m } from '$lib/paraglide/messages';
import { datasetsStore } from '$lib/features/commons/stores/datasets.store.svelte';
import { facetsStore } from '../facets/facets.store.svelte';
import {
  getNativeCrs,
  readCrsEpsg,
  readProjectedCrs
} from './native-projection.utils';
import {
  findKnownEpsgForProj4,
  getKnownEpsgName,
  getProjectionCodeCentralMeridian
} from '$lib/features/commons/utils/proj4-crs.utils';
import { getCompositeProjectionPresetId } from '$lib/features/map/utils/user-projection.utils';
import {
  createCurrentProjectionForward,
  isGeoreferenceableDefinition,
  resolveCurrentProjectionDefinition,
  type ProjectionDefinition,
  type ProjectionForward,
  type ProjectionDefinitionNote,
  type ProjectionDefinitionContext
} from './projection-definition.utils';
import { resolveCurrentProjectionDisplay } from './projection-label.utils';
import { getProjectionState } from './projection.store.svelte';

// Samples per side of the grid laid over the map: enough to tell an affine
// map from a composite or curved one.
const SAMPLE_GRID_STEPS = 8;
// Past half a pixel the side-cars would misplace the image visibly.
const MAX_RESIDUAL_PX = 0.5;

// Without a basemap, a dataset in a projected CRS is drawn as is (no d3
// projection): its CRS is the map's.
function getDatasetNativeCrs(): string | undefined {
  if (basemapService.currentMetadata) {
    return undefined;
  }
  const dataset =
    datasetsStore.selectedDataset ??
    datasetsStore.datasets.find((item) => item.geometry?.crs);
  return readProjectedCrs(dataset?.geometry?.crs);
}

/** Everything that decides the projection the map is drawn in right now. */
export function getCurrentProjectionContext(): ProjectionDefinitionContext {
  const tiled = shouldUseMapLibreInterleaved({
    requiresMapLibre: basemapStyleStore.requiresMapLibre,
    hasOSMBasemap: osmBasemapStore.isActive
  });
  const nativeCrs =
    getNativeCrs(basemapService.currentBasemap?.metadata) ??
    getDatasetNativeCrs();
  return {
    state: getProjectionState(),
    basemapProjection: {
      ...basemapService.currentMetadata?.proj_to,
      nativeCrs,
      nativeEpsg: readCrsEpsg(nativeCrs)
    },
    projectionPresets: basemapService.projectionPresets,
    tiled: tiled ? { globe: mapProjectionStore.isGlobe } : null
  };
}

export type MapGeoreferenceUnavailableReason =
  'facets' | 'composite' | 'oblique' | 'globe' | 'no-equivalent' | 'not-affine';

export type MapGeoreferenceAvailability =
  | { available: true }
  | { available: false; reason: MapGeoreferenceUnavailableReason };

const NOTE_REASONS: Array<
  [ProjectionDefinitionNote, MapGeoreferenceUnavailableReason]
> = [
  ['globe', 'globe'],
  ['composite', 'composite'],
  ['oblique', 'oblique'],
  ['no-equivalent', 'no-equivalent']
];

export function getMapGeoreferenceAvailability(): MapGeoreferenceAvailability {
  if (facetsStore.enabled) {
    return { available: false, reason: 'facets' };
  }
  const definition = resolveCurrentProjectionDefinition(
    getCurrentProjectionContext()
  );
  if (isGeoreferenceableDefinition(definition)) {
    return { available: true };
  }
  const reason =
    NOTE_REASONS.find(([note]) => definition.notes.includes(note))?.[1] ??
    'no-equivalent';
  return { available: false, reason };
}

/** Whether the map can be exported for GIS software, and why not, in words. */
export function describeMapGeoreferenceAvailability(
  availability: MapGeoreferenceAvailability
): string {
  if (availability.available) {
    return m.georeference_available();
  }
  switch (availability.reason) {
    case 'facets':
      return m.georeference_unavailable_facets();
    case 'composite':
      return m.georeference_unavailable_composite();
    case 'oblique':
      return m.georeference_unavailable_oblique();
    case 'globe':
      return m.georeference_unavailable_globe();
    case 'not-affine':
      return m.export_georeference_failed();
    case 'no-equivalent':
      return m.georeference_unavailable_no_equivalent();
  }
}

export interface MapGeoreference {
  /** CRS for GDAL: an EPSG code, the pasted WKT or a PROJ.4 string. */
  srs: string;
  crsName: string;
  definition: ProjectionDefinition;
  transform: AffineTransform;
  /** Map frame in CRS units: [xmin, ymin, xmax, ymax]. */
  frameExtent: [number, number, number, number];
  /** CRS units per image pixel. */
  pixelSize: number;
  rotated: boolean;
  /** The map frame in CRS coordinates, closed (5 points). */
  frameRing: Array<[number, number]>;
  /** How a GeoPackage declares the CRS; null when it cannot. */
  geoPackageSrs: GeoPackageSrs | null;
}

export type GeoPackageSrs =
  { epsg: string } | { name: string; definition: string };

// GDAL resolves an EPSG code by itself; a pasted WKT goes as is; a PROJ.4
// string rides in the PROJ4 extension of a WKT1.
function resolveGeoPackageSrs(
  definition: ProjectionDefinition,
  name: string
): GeoPackageSrs | null {
  if (definition.epsg) {
    return { epsg: definition.epsg };
  }
  if (definition.wkt && !definition.wkt.trimStart().startsWith('{')) {
    return { name, definition: definition.wkt };
  }
  if (definition.proj4) {
    return { name, definition: wrapProj4AsWkt(name, definition.proj4) };
  }
  return null;
}

export type MapGeoreferenceResult =
  | { status: 'ok'; georeference: MapGeoreference }
  | { status: 'unavailable'; reason: MapGeoreferenceUnavailableReason };

function isDrawnInNativeCrs(context: ProjectionDefinitionContext): boolean {
  const { state, basemapProjection, tiled } = context;
  return (
    !tiled &&
    Boolean(basemapProjection?.nativeCrs) &&
    (state.overrideActive !== true || state.overrideSource !== 'manual')
  );
}

function resolveSrs(definition: ProjectionDefinition): string | undefined {
  return definition.epsg
    ? `EPSG:${definition.epsg}`
    : (definition.wkt ?? definition.proj4);
}

/**
 * Fits the affine map from image pixels to CRS coordinates for an exported
 * image, from a grid of map pixels traced back to the CRS.
 */
export function buildMapGeoreference(
  placement: MapExportPlacement
): MapGeoreferenceResult {
  const availability = getMapGeoreferenceAvailability();
  if (!availability.available) {
    return { status: 'unavailable', reason: availability.reason };
  }

  const context = getCurrentProjectionContext();
  const definition = resolveCurrentProjectionDefinition(context);
  const srs = resolveSrs(definition);
  const reader = createMapViewportDataReader();
  if (!srs || !reader) {
    return { status: 'unavailable', reason: 'no-equivalent' };
  }

  // A file drawn as is: the map data space already is its CRS.
  let toCrs: (x: number, y: number) => [number, number] | null;
  if (reader.space === 'data' && isDrawnInNativeCrs(context)) {
    toCrs = reader.read;
  } else {
    const forward = createCurrentProjectionForward(context, definition);
    if (!forward) {
      return { status: 'unavailable', reason: 'no-equivalent' };
    }
    toCrs = (x, y) => {
      const lonLat = reader.read(x, y);
      return lonLat ? forward(lonLat) : null;
    };
  }

  const { viewportWidth, viewportHeight, scale, offsetX, offsetY } = placement;
  const samples = [];
  for (let i = 0; i <= SAMPLE_GRID_STEPS; i += 1) {
    for (let j = 0; j <= SAMPLE_GRID_STEPS; j += 1) {
      const x = (viewportWidth * i) / SAMPLE_GRID_STEPS;
      const y = (viewportHeight * j) / SAMPLE_GRID_STEPS;
      const crs = toCrs(x, y);
      if (crs) {
        samples.push({
          pixel: [offsetX + scale * x, offsetY + scale * y] as [number, number],
          crs
        });
      }
    }
  }

  const fit = fitAffineTransform(samples);
  if (!fit || fit.maxResidualPx > MAX_RESIDUAL_PX) {
    return { status: 'unavailable', reason: 'not-affine' };
  }

  const { transform } = fit;
  const corners = [
    [0, 0],
    [viewportWidth, 0],
    [viewportWidth, viewportHeight],
    [0, viewportHeight]
  ].map(([x, y]) =>
    applyAffineTransform(transform, [offsetX + scale * x, offsetY + scale * y])
  );
  const xs = corners.map(([x]) => x);
  const ys = corners.map(([, y]) => y);
  const pixelSize = Math.sqrt(
    Math.abs(transform.a * transform.e - transform.b * transform.d)
  );

  const crsName = resolveCurrentProjectionDisplay(
    context.state,
    context.basemapProjection,
    context.projectionPresets
  ).name;

  return {
    status: 'ok',
    georeference: {
      srs,
      crsName,
      frameRing: [...corners, corners[0]],
      geoPackageSrs: resolveGeoPackageSrs(definition, crsName),
      definition,
      transform,
      frameExtent: [
        Math.min(...xs),
        Math.min(...ys),
        Math.max(...xs),
        Math.max(...ys)
      ],
      pixelSize,
      rotated: Math.abs(transform.b) + Math.abs(transform.d) > pixelSize * 1e-9
    }
  };
}

/** The CRS vector layers of the map are written in, for GIS software. */
export type MapVectorCrs =
  | {
      status: 'map';
      crsName: string;
      definition: ProjectionDefinition;
      /** For `ST_Transform`: an EPSG code, the pasted WKT or a PROJ.4 string. */
      target: string;
      geoPackageSrs: GeoPackageSrs;
      /** Meridian opposite the cut d3 makes in lon/lat geometry. */
      centralMeridian: number;
      /** Lon/lat to CRS, the one the georeferenced image uses. */
      forward: ProjectionForward | null;
      /**
       * The map is composite: this is the CRS of its main frame, the insets
       * keep their real place instead of their own frame.
       */
      composite: boolean;
    }
  | {
      status: 'wgs84';
      reason: Exclude<MapGeoreferenceUnavailableReason, 'facets'>;
    };

// A composite preset without an EPSG code still names the projection of its
// main frame (`mainland`), the one the territory is drawn in.
function resolveMainFrameProj4(
  context: ProjectionDefinitionContext
): string | undefined {
  const { state, basemapProjection, projectionPresets } = context;
  const presetId =
    state.overrideActive === true && state.overrideSource === 'manual'
      ? getCompositeProjectionPresetId(state.selected)
      : basemapProjection?.type === 'composite'
        ? basemapProjection.preset
        : undefined;
  const entries = presetId ? projectionPresets?.[presetId]?.entries : undefined;
  const main =
    entries?.find((entry) => entry.id === 'mainland') ?? entries?.[0];
  return main?.proj4.replace(/\s*\+type=crs\b/, '').trim() || undefined;
}

/**
 * The CRS the map is drawn in, when one exists. A map collection shares one
 * projection, so it does not prevent vector layers from following it.
 */
export function resolveMapVectorCrs(): MapVectorCrs {
  const context = getCurrentProjectionContext();
  const drawn = resolveCurrentProjectionDefinition(context);
  // A composite map has one CRS per frame; layers can only take one, the
  // main frame's, which is what a GIS user of that territory works in.
  const composite = drawn.notes.includes('composite');
  const proj4 = composite
    ? (drawn.proj4 ?? resolveMainFrameProj4(context))
    : drawn.proj4;
  // A PROJ string equal to a known code is declared by that code, so GIS
  // software does not guess among equivalents (LAEA Europe: 3035 or 5636).
  const epsg =
    drawn.epsg ??
    (proj4 && !drawn.wkt ? findKnownEpsgForProj4(proj4) : undefined);
  const definition: ProjectionDefinition = {
    ...drawn,
    proj4,
    epsg,
    notes: drawn.notes.filter((note) => note !== 'composite')
  };
  const target = resolveSrs(definition);
  const displayName = resolveCurrentProjectionDisplay(
    context.state,
    context.basemapProjection,
    context.projectionPresets
  ).name;
  // A code has an official name; a composite map keeps its own, which says
  // the insets.
  const crsName =
    (!composite && epsg ? getKnownEpsgName(`EPSG:${epsg}`) : undefined) ??
    displayName;
  const geoPackageSrs = resolveGeoPackageSrs(definition, crsName);
  if (!isGeoreferenceableDefinition(definition) || !target || !geoPackageSrs) {
    const reason =
      NOTE_REASONS.find(([note]) => drawn.notes.includes(note))?.[1] ??
      'no-equivalent';
    return {
      status: 'wgs84',
      reason: reason === 'facets' ? 'no-equivalent' : reason
    };
  }
  return {
    status: 'map',
    crsName,
    definition,
    target,
    geoPackageSrs,
    centralMeridian: definition.proj4
      ? getProjectionCodeCentralMeridian(definition.proj4)
      : 0,
    forward: createCurrentProjectionForward(context, definition),
    composite
  };
}

// Plain dot decimals: these values are pasted into GIS software.
function formatCoordinate(value: number): string {
  return String(Number(value.toFixed(Math.abs(value) < 1000 ? 8 : 3)));
}

export interface GeoreferenceReadmeFiles {
  image: string;
  aux?: string;
  world?: string;
  frame?: string;
}

/** Human-readable memo shipped next to the image. */
export function formatGeoreferenceReadme(
  georeference: MapGeoreference,
  files: GeoreferenceReadmeFiles
): string {
  const { definition, frameExtent, pixelSize } = georeference;
  const [xmin, ymin, xmax, ymax] = frameExtent;
  const lines = [
    m.georeference_readme_title({ image: files.image }),
    '',
    m.georeference_readme_crs({ name: georeference.crsName }),
    m.georeference_readme_srs({ srs: georeference.srs })
  ];
  if (definition.proj4 && definition.proj4 !== georeference.srs) {
    lines.push(m.georeference_readme_proj4({ proj4: definition.proj4 }));
  }
  lines.push(
    m.georeference_readme_extent({
      xmin: formatCoordinate(xmin),
      xmax: formatCoordinate(xmax),
      ymin: formatCoordinate(ymin),
      ymax: formatCoordinate(ymax)
    }),
    files.aux
      ? m.georeference_readme_pixel({ size: formatCoordinate(pixelSize) })
      : m.georeference_readme_svg_unit({ size: formatCoordinate(pixelSize) })
  );
  if (georeference.rotated) {
    lines.push(m.georeference_readme_rotated());
  }
  if (definition.notes.includes('spherical')) {
    lines.push(m.projection_definition_note_spherical());
  }
  lines.push('');
  if (files.aux && files.world) {
    lines.push(
      m.georeference_readme_open_raster({
        image: files.image,
        aux: files.aux,
        world: files.world
      })
    );
  }
  if (files.frame) {
    lines.push(
      files.aux
        ? m.georeference_readme_frame_raster({ frame: files.frame })
        : m.georeference_readme_frame_svg({ frame: files.frame })
    );
  }
  lines.push(m.georeference_readme_layout(), '');
  return lines.join('\n');
}
