/**
 * Image pixel → CRS coordinates, pixel corners at integer positions:
 * x = a·col + b·row + c, y = d·col + e·row + f.
 */
export interface AffineTransform {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export interface GeoreferenceSample {
  pixel: [number, number];
  crs: [number, number];
}

export interface AffineFit {
  transform: AffineTransform;
  /** Largest gap between a sample and the fit, in image pixels. */
  maxResidualPx: number;
}

function solve3(m: number[][], v: number[]): [number, number, number] | null {
  const det = (q: number[][]) =>
    q[0][0] * (q[1][1] * q[2][2] - q[1][2] * q[2][1]) -
    q[0][1] * (q[1][0] * q[2][2] - q[1][2] * q[2][0]) +
    q[0][2] * (q[1][0] * q[2][1] - q[1][1] * q[2][0]);
  const base = det(m);
  if (!Number.isFinite(base) || Math.abs(base) < 1e-12) {
    return null;
  }
  const column = (index: number) =>
    m.map((row, r) => row.map((value, c) => (c === index ? v[r] : value)));
  return [det(column(0)) / base, det(column(1)) / base, det(column(2)) / base];
}

/**
 * Least-squares affine fit of CRS coordinates on image pixels. Null when the
 * samples are collinear or fewer than three.
 */
export function fitAffineTransform(
  samples: GeoreferenceSample[]
): AffineFit | null {
  if (samples.length < 3) {
    return null;
  }

  // Centre the pixels: the normal equations stay well conditioned even for
  // CRS coordinates in the millions of metres.
  const meanX =
    samples.reduce((sum, s) => sum + s.pixel[0], 0) / samples.length;
  const meanY =
    samples.reduce((sum, s) => sum + s.pixel[1], 0) / samples.length;
  const normal = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0]
  ];
  const rhsX = [0, 0, 0];
  const rhsY = [0, 0, 0];
  for (const { pixel, crs } of samples) {
    const row = [pixel[0] - meanX, pixel[1] - meanY, 1];
    for (let i = 0; i < 3; i += 1) {
      for (let j = 0; j < 3; j += 1) {
        normal[i][j] += row[i] * row[j];
      }
      rhsX[i] += row[i] * crs[0];
      rhsY[i] += row[i] * crs[1];
    }
  }

  const xCoefficients = solve3(normal, rhsX);
  const yCoefficients = solve3(normal, rhsY);
  if (!xCoefficients || !yCoefficients) {
    return null;
  }

  const [rawA, rawB, c0] = xCoefficients;
  const [rawD, rawE, f0] = yCoefficients;
  // Float noise leaves ~1e-7 rotation terms on a north-up map; GIS software
  // then reports a rotated raster.
  const scale = Math.sqrt(Math.abs(rawA * rawE - rawB * rawD));
  const snap = (value: number) => (Math.abs(value) < scale * 1e-9 ? 0 : value);
  const [a, b, d, e] = [rawA, rawB, rawD, rawE].map(snap);
  const transform: AffineTransform = {
    a,
    b,
    c: c0 - a * meanX - b * meanY,
    d,
    e,
    f: f0 - d * meanX - e * meanY
  };
  const pixelSize = Math.sqrt(Math.abs(a * e - b * d));
  const maxResidualPx = Math.max(
    ...samples.map(({ pixel, crs }) => {
      const [x, y] = applyAffineTransform(transform, pixel);
      return Math.hypot(x - crs[0], y - crs[1]) / pixelSize;
    })
  );

  return { transform, maxResidualPx };
}

export function applyAffineTransform(
  { a, b, c, d, e, f }: AffineTransform,
  [col, row]: [number, number]
): [number, number] {
  return [a * col + b * row + c, d * col + e * row + f];
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toPrecision(15);
}

/**
 * World file (.jgw, .pgw, .wld). Its origin is the centre of the top-left
 * pixel, not its corner.
 */
export function formatWorldFile(transform: AffineTransform): string {
  const [originX, originY] = applyAffineTransform(transform, [0.5, 0.5]);
  return (
    [transform.a, transform.d, transform.b, transform.e, originX, originY]
      .map(formatNumber)
      .join('\n') + '\n'
  );
}

function escapeXmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * GDAL side-car (`<image>.aux.xml`): CRS and geotransform in one file, read
 * by QGIS and ArcGIS. `srs` is anything GDAL accepts as user input: an EPSG
 * code, a WKT or a PROJ.4 string.
 */
export function formatGdalAuxXml(
  srs: string,
  { a, b, c, d, e, f }: AffineTransform
): string {
  const geoTransform = [c, a, b, f, d, e].map(formatNumber).join(', ');
  return [
    '<PAMDataset>',
    `  <SRS dataAxisToSRSAxisMapping="1,2">${escapeXmlText(srs)}</SRS>`,
    `  <GeoTransform>${geoTransform}</GeoTransform>`,
    '</PAMDataset>',
    ''
  ].join('\n');
}

/** WKB (little endian) of a polygon with a single ring. */
export function encodePolygonWkb(ring: Array<[number, number]>): Uint8Array {
  const buffer = new ArrayBuffer(1 + 4 + 4 + 4 + ring.length * 16);
  const view = new DataView(buffer);
  view.setUint8(0, 1);
  view.setUint32(1, 3, true);
  view.setUint32(5, 1, true);
  view.setUint32(9, ring.length, true);
  ring.forEach(([x, y], index) => {
    view.setFloat64(13 + index * 16, x, true);
    view.setFloat64(21 + index * 16, y, true);
  });
  return new Uint8Array(buffer);
}

/**
 * WKT1 carrying a PROJ.4 string in its PROJ4 extension: GDAL builds the CRS
 * from that string, which lets a GeoPackage hold a CRS known only by its
 * PROJ definition (Natural Earth centred on 150°, a pasted PROJ.4 string).
 */
export function wrapProj4AsWkt(name: string, proj4String: string): string {
  const quote = (value: string) => value.replace(/"/g, "'");
  return [
    `PROJCS["${quote(name)}",`,
    'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],',
    'PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]],',
    'PROJECTION["custom_proj4"],UNIT["metre",1],',
    `EXTENSION["PROJ4","${quote(proj4String)}"]]`
  ].join('');
}
