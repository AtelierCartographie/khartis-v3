import type { MapVectorCrs } from '$lib/features/step-toolbar/tools/projections';
import { buildQmlBody, escapeXmlText, type QmlLayerStyle } from './qml';
import type { QgisLayerGeometry } from './qgis-style';

export interface QgisProjectLayer {
  name: string;
  table: string;
  geometry: QgisLayerGeometry;
  style: QmlLayerStyle;
}

const GEOMETRY_NAMES: Record<QgisLayerGeometry, string> = {
  point: 'Point',
  line: 'Line',
  polygon: 'Polygon'
};

function spatialRefSys(crs: MapVectorCrs): string {
  if (crs.status !== 'map') {
    return '<spatialrefsys><proj4>+proj=longlat +datum=WGS84 +no_defs</proj4><authid>EPSG:4326</authid></spatialrefsys>';
  }
  const srs = crs.geoPackageSrs;
  // QGIS builds no CRS from an authority id alone in a project file: the
  // PROJ string goes with it.
  const proj4 = crs.definition.proj4
    ? `<proj4>${escapeXmlText(crs.definition.proj4)}</proj4>`
    : '';
  if ('epsg' in srs) {
    return `<spatialrefsys>${proj4}<authid>EPSG:${escapeXmlText(srs.epsg)}</authid></spatialrefsys>`;
  }
  const description = `<description>${escapeXmlText(srs.name)}</description>`;
  // QGIS reads the WKT first and does not take the PROJ4 extension of a
  // WKT1 there: a PROJ string goes on its own.
  if (proj4 && !crs.definition.wkt) {
    return `<spatialrefsys>${proj4}${description}</spatialrefsys>`;
  }
  return `<spatialrefsys><wkt>${escapeXmlText(srs.definition)}</wkt>${description}</spatialrefsys>`;
}

/**
 * A QGIS project next to the GeoPackage: the layers in map order, the map
 * CRS, paths relative to the project so the folder can move.
 * `layers` goes from the bottom of the map to the top.
 */
export function buildQgisProject(options: {
  title: string;
  gpkg: string;
  crs: MapVectorCrs;
  layers: QgisProjectLayer[];
  /** What the canvas shows on opening: [xmin, ymin, xmax, ymax]. */
  extent: [number, number, number, number] | null;
}): string {
  const srs = spatialRefSys(options.crs);
  const topFirst = [...options.layers].reverse().map((layer, index) => ({
    ...layer,
    id: `khartis_${index}_${layer.table}`,
    source: `./${options.gpkg}|layername=${layer.table}`
  }));
  const tree = topFirst
    .map(
      (layer) =>
        `<layer-tree-layer id="${escapeXmlText(layer.id)}" name="${escapeXmlText(layer.name)}" source="${escapeXmlText(layer.source)}" providerKey="ogr" checked="Qt::Checked" expanded="1"/>`
    )
    .join('');
  const mapLayers = topFirst
    .map(
      (layer) =>
        `<maplayer type="vector" geometry="${GEOMETRY_NAMES[layer.geometry]}" labelsEnabled="${layer.style.labels?.length ? 1 : 0}">` +
        `<id>${escapeXmlText(layer.id)}</id>` +
        `<datasource>${escapeXmlText(layer.source)}</datasource>` +
        `<layername>${escapeXmlText(layer.name)}</layername>` +
        `<srs>${srs}</srs>` +
        '<provider encoding="UTF-8">ogr</provider>' +
        buildQmlBody(layer.style) +
        '</maplayer>'
    )
    .join('');

  return [
    "<!DOCTYPE qgis PUBLIC 'http://mrcc.com/qgis.dtd' 'SYSTEM'>",
    `<qgis projectname="${escapeXmlText(options.title)}" version="3.34.0">`,
    `<title>${escapeXmlText(options.title)}</title>`,
    `<projectCrs>${srs}</projectCrs>`,
    ...(options.extent
      ? [
          `<mapcanvas name="theMapCanvas"><extent><xmin>${options.extent[0]}</xmin><ymin>${options.extent[1]}</ymin><xmax>${options.extent[2]}</xmax><ymax>${options.extent[3]}</ymax></extent><destinationsrs>${srs}</destinationsrs></mapcanvas>`
        ]
      : []),
    `<layer-tree-group>${tree}</layer-tree-group>`,
    `<projectlayers>${mapLayers}</projectlayers>`,
    // Without ProjectionsEnabled QGIS reads the project as having no CRS.
    '<properties name="properties"><properties name="Paths"><properties name="Absolute" type="bool">false</properties></properties><properties name="SpatialRefSys"><properties name="ProjectionsEnabled" type="int">1</properties></properties></properties>',
    '</qgis>'
  ].join('\n');
}
