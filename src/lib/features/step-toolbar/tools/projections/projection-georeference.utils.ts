import { basemapStyleStore } from '$lib/features/commons/stores/basemap-style.store.svelte';
import {
  applyAffineTransform,
  fitAffineTransform,
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
import { isWgs84LikeCrs } from '$lib/features/map/utils/dataset-crs.utils';
import { facetsStore } from '../facets/facets.store.svelte';
import { getNativeCrsEpsg } from './native-projection.utils';
import {
  createCurrentProjectionForward,
  isGeoreferenceableDefinition,
  resolveCurrentProjectionDefinition,
  type ProjectionDefinition,
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
function getDatasetNativeEpsg(): string | undefined {
  if (basemapService.currentMetadata) {
    return undefined;
  }
  const dataset =
    datasetsStore.selectedDataset ??
    datasetsStore.datasets.find((item) => item.geometry?.crs);
  const crs = dataset?.geometry?.crs;
  return crs && !isWgs84LikeCrs(crs)
    ? crs.trim().match(/^EPSG:(\d+)$/i)?.[1]
    : undefined;
}

/** Everything that decides the projection the map is drawn in right now. */
export function getCurrentProjectionContext(): ProjectionDefinitionContext {
  const tiled = shouldUseMapLibreInterleaved({
    requiresMapLibre: basemapStyleStore.requiresMapLibre,
    hasOSMBasemap: osmBasemapStore.isActive
  });
  return {
    state: getProjectionState(),
    basemapProjection: {
      ...basemapService.currentMetadata?.proj_to,
      nativeEpsg:
        getNativeCrsEpsg(basemapService.currentBasemap?.metadata) ??
        getDatasetNativeEpsg()
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
}

export type MapGeoreferenceResult =
  | { status: 'ok'; georeference: MapGeoreference }
  | { status: 'unavailable'; reason: MapGeoreferenceUnavailableReason };

function isDrawnInNativeCrs(context: ProjectionDefinitionContext): boolean {
  const { state, basemapProjection, tiled } = context;
  return (
    !tiled &&
    Boolean(basemapProjection?.nativeEpsg) &&
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

// Plain dot decimals: these values are pasted into GIS software.
function formatCoordinate(value: number): string {
  return String(Number(value.toFixed(Math.abs(value) < 1000 ? 8 : 3)));
}

export interface GeoreferenceReadmeFiles {
  image: string;
  aux?: string;
  world?: string;
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
  lines.push(m.georeference_readme_layout(), '');
  return lines.join('\n');
}
