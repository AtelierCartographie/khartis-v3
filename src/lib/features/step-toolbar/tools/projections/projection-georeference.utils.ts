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
import { facetsStore } from '../facets/facets.store.svelte';
import { getNativeCrsEpsg } from './native-projection.utils';
import {
  createCurrentProjectionForward,
  isGeoreferenceableDefinition,
  resolveCurrentProjectionDefinition,
  type ProjectionDefinition,
  type ProjectionDefinitionContext
} from './projection-definition.utils';
import { resolveCurrentProjectionDisplay } from './projection-label.utils';
import { getProjectionState } from './projection.store.svelte';

// Samples per side of the grid laid over the map: enough to tell an affine
// map from a composite or curved one.
const SAMPLE_GRID_STEPS = 8;
// Past half a pixel the side-cars would misplace the image visibly.
const MAX_RESIDUAL_PX = 0.5;

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
      nativeEpsg: getNativeCrsEpsg(basemapService.currentBasemap?.metadata)
    },
    projectionPresets: basemapService.projectionPresets,
    tiled: tiled ? { globe: mapProjectionStore.isGlobe } : null
  };
}

export type MapGeoreferenceUnavailableReason =
  'facets' | 'no-crs' | 'not-affine';

export type MapGeoreferenceAvailability =
  | { available: true }
  | { available: false; reason: MapGeoreferenceUnavailableReason };

export function getMapGeoreferenceAvailability(): MapGeoreferenceAvailability {
  if (facetsStore.enabled) {
    return { available: false, reason: 'facets' };
  }
  const definition = resolveCurrentProjectionDefinition(
    getCurrentProjectionContext()
  );
  return isGeoreferenceableDefinition(definition)
    ? { available: true }
    : { available: false, reason: 'no-crs' };
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
    return { status: 'unavailable', reason: 'no-crs' };
  }

  // A dataset drawn as is: the map data space already is its CRS.
  let toCrs: (x: number, y: number) => [number, number] | null;
  if (reader.space === 'source-crs') {
    if (!context.basemapProjection?.nativeEpsg) {
      return { status: 'unavailable', reason: 'no-crs' };
    }
    toCrs = reader.read;
  } else {
    const forward = createCurrentProjectionForward(context, definition);
    if (!forward) {
      return { status: 'unavailable', reason: 'no-crs' };
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
    [0, viewportHeight],
    [viewportWidth, viewportHeight]
  ].map(([x, y]) =>
    applyAffineTransform(transform, [offsetX + scale * x, offsetY + scale * y])
  );
  const xs = corners.map(([x]) => x);
  const ys = corners.map(([, y]) => y);
  const pixelSize = Math.sqrt(
    Math.abs(transform.a * transform.e - transform.b * transform.d)
  );

  return {
    status: 'ok',
    georeference: {
      srs,
      crsName: resolveCurrentProjectionDisplay(
        context.state,
        context.basemapProjection,
        context.projectionPresets
      ).name,
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
