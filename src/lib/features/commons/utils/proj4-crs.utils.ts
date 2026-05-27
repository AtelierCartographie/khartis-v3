import proj4 from 'proj4';

export const WGS84_CRS = 'EPSG:4326';

export const EPSG_DEFINITIONS: Record<string, string> = {
  'EPSG:2154':
    '+proj=lcc +lat_0=46.5 +lon_0=3 +lat_1=49 +lat_2=44 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs',
  'EPSG:3035':
    '+proj=laea +lat_0=52 +lon_0=10 +x_0=4321000 +y_0=3210000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs',
  'EPSG:27700':
    '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +towgs84=446.448,-125.157,542.06,0.1502,0.247,0.8421,-20.4894 +units=m +no_defs +type=crs',
  'EPSG:2157':
    '+proj=tmerc +lat_0=53.5 +lon_0=-8 +k=0.99982 +x_0=600000 +y_0=750000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs',
  'EPSG:2056':
    '+proj=somerc +lat_0=46.9524055555556 +lon_0=7.43958333333333 +k_0=1 +x_0=2600000 +y_0=1200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs +type=crs',
  'EPSG:3857':
    '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs +type=crs',
  'EPSG:27572':
    '+proj=lcc +lat_1=46.8 +lat_0=46.8 +lon_0=0 +k_0=0.99987742 +x_0=600000 +y_0=2200000 +a=6378249.2 +b=6356515 +towgs84=-168,-60,320,0,0,0,0 +pm=paris +units=m +no_defs +type=crs',
  'EPSG:32631': '+proj=utm +zone=31 +datum=WGS84 +units=m +no_defs +type=crs',
  'EPSG:32632': '+proj=utm +zone=32 +datum=WGS84 +units=m +no_defs +type=crs',
  [WGS84_CRS]: '+proj=longlat +datum=WGS84 +no_defs +type=crs'
};

let proj4DefinitionsRegistered = false;

export function normalizeProj4CrsCode(crs: string): string {
  const trimmed = crs.trim();
  const epsgMatch = trimmed.match(/^EPSG:(\d+)$/i);

  return epsgMatch ? `EPSG:${epsgMatch[1]}` : trimmed;
}

export function registerKnownProj4Definitions(): void {
  if (proj4DefinitionsRegistered) {
    return;
  }

  for (const [code, definition] of Object.entries(EPSG_DEFINITIONS)) {
    proj4.defs(code, definition);
  }

  proj4DefinitionsRegistered = true;
}
