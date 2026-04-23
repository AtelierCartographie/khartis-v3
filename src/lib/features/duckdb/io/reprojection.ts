import proj4 from 'proj4';
import { GEO_CONSTANTS } from '../constants';

export const EPSG_DEFINITIONS: Record<string, string> = {
  'EPSG:2154':
    '+proj=lcc +lat_0=46.5 +lon_0=3 +lat_1=49 +lat_2=44 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs',
  'EPSG:3035':
    '+proj=laea +lat_0=52 +lon_0=10 +x_0=4321000 +y_0=3210000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs',
  [GEO_CONSTANTS.WEB_MERCATOR_CRS]:
    '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs +type=crs',
  'EPSG:27572':
    '+proj=lcc +lat_1=46.8 +lat_0=46.8 +lon_0=0 +k_0=0.99987742 +x_0=600000 +y_0=2200000 +a=6378249.2 +b=6356515 +towgs84=-168,-60,320,0,0,0,0 +pm=paris +units=m +no_defs +type=crs',
  'EPSG:32631': '+proj=utm +zone=31 +datum=WGS84 +units=m +no_defs +type=crs',
  'EPSG:32632': '+proj=utm +zone=32 +datum=WGS84 +units=m +no_defs +type=crs',
  [GEO_CONSTANTS.WGS84_CRS]: '+proj=longlat +datum=WGS84 +no_defs +type=crs'
};

let proj4Initialized = false;

function initializeProj4(): void {
  if (proj4Initialized) return;

  for (const [code, definition] of Object.entries(EPSG_DEFINITIONS)) {
    proj4.defs(code, definition);
  }

  proj4Initialized = true;
}

export function isProjectionSupported(epsgCode: string): boolean {
  initializeProj4();
  const normalized = epsgCode.toUpperCase();
  return normalized in EPSG_DEFINITIONS || proj4.defs(normalized) !== undefined;
}

interface ReprojectResult {
  success: boolean;
  coordinates?: [number, number];
  error?: string;
}

export function reprojectPoint(
  x: number,
  y: number,
  fromCRS: string,
  toCRS: string = GEO_CONSTANTS.WGS84_CRS
): ReprojectResult {
  initializeProj4();

  try {
    const fromNormalized = fromCRS.toUpperCase();
    const toNormalized = toCRS.toUpperCase();

    if (!isProjectionSupported(fromNormalized)) {
      return {
        success: false,
        error: `Unsupported source projection: ${fromCRS}`
      };
    }

    const result = proj4(fromNormalized, toNormalized, [x, y]);

    if (!result || !isFinite(result[0]) || !isFinite(result[1])) {
      return {
        success: false,
        error: 'Reprojection produced invalid coordinates'
      };
    }

    return {
      success: true,
      coordinates: result as [number, number]
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'Unknown reprojection error'
    };
  }
}
