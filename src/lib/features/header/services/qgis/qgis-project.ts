import { buildQgisLayoutXml } from './qgis-layout';
import type { PageLayoutSpec } from './qgis-page-layout';
import type { MapVectorCrs } from '$lib/features/step-toolbar/tools/projections';
import { buildQmlBody, escapeXmlText, type QmlLayerStyle } from './qml';
import type { QgisLayerGeometry } from './qgis-style';

export interface QgisProjectLayer {
  name: string;
  /** The map of a collection the layer draws; a map theme switches maps. */
  group?: string;
  /** Present for further work, unchecked so the map looks as in Khartis. */
  hidden?: boolean;
  table: string;
  geometry: QgisLayerGeometry;
  style: QmlLayerStyle;
}

const GEOMETRY_NAMES: Record<QgisLayerGeometry, string> = {
  point: 'Point',
  line: 'Line',
  polygon: 'Polygon'
};

// QGIS rebuilds a CRS from its own database through the root authority of a
// well-formed WKT, whatever its parameters say (the PROJECTION is needed for
// it to parse); an authority id alone builds nothing, and a PROJ string is
// re-identified among equivalent codes (3035 read as 5636).
function epsgSpatialRefSys(code: string): string {
  const wkt = `PROJCS["EPSG:${code}",GEOGCS["unknown",DATUM["unknown",SPHEROID["unknown",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]],PROJECTION["Mercator_1SP"],UNIT["metre",1],AUTHORITY["EPSG","${code}"]]`;
  return `<spatialrefsys><wkt>${escapeXmlText(wkt)}</wkt><authid>EPSG:${escapeXmlText(code)}</authid></spatialrefsys>`;
}

function spatialRefSys(crs: MapVectorCrs): string {
  if (crs.status !== 'map') {
    return epsgSpatialRefSys('4326');
  }
  const srs = crs.geoPackageSrs;
  if ('epsg' in srs) {
    return epsgSpatialRefSys(srs.epsg);
  }
  const proj4 = crs.definition.proj4
    ? `<proj4>${escapeXmlText(crs.definition.proj4)}</proj4>`
    : '';
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
  /** Canvas colour, `#rrggbb`: the seas of the map. */
  background?: string;
  /** The georeferenced image of the Khartis page, unchecked, on top. */
  image?: { name: string; file: string };
  /** The print layout of the page; legends name the tables they list. */
  layout?: PageLayoutSpec;
}): string {
  const [red, green, blue] = (
    options.background?.match(/^#?([0-9a-f]{6})$/i)?.[1] ?? 'ffffff'
  )
    .match(/../g)
    ?.map((channel) => parseInt(channel, 16)) ?? [255, 255, 255];
  const srs = spatialRefSys(options.crs);
  const topFirst = [...options.layers].reverse().map((layer, index) => ({
    ...layer,
    id: `khartis_${index}_${layer.table}`,
    source: `./${options.gpkg}|layername=${layer.table}`
  }));
  const treeLayer = (layer: (typeof topFirst)[number], checked: boolean) =>
    `<layer-tree-layer id="${escapeXmlText(layer.id)}" name="${escapeXmlText(layer.name)}" source="${escapeXmlText(layer.source)}" providerKey="ogr" checked="${checked ? 'Qt::Checked' : 'Qt::Unchecked'}" expanded="1"/>`;
  // The maps of a collection are meant one at a time. They stay in one flat
  // list, in the stacking order of the map, and a map theme per map shows
  // its layers with the shared ones; only the first map starts visible.
  // `layers` lists them bottom first, so the maps come in collection order.
  const groups = [
    ...new Set(
      options.layers.flatMap((layer) => (layer.group ? [layer.group] : []))
    )
  ];
  const image = options.image
    ? {
        id: 'khartis_reference_image',
        name: options.image.name,
        source: `./${options.image.file}`
      }
    : null;
  const imageTree = image
    ? `<layer-tree-layer id="${image.id}" name="${escapeXmlText(image.name)}" source="${escapeXmlText(image.source)}" providerKey="gdal" checked="Qt::Unchecked" expanded="0"/>`
    : '';
  const imageLayer = image
    ? `<maplayer type="raster"><id>${image.id}</id><datasource>${escapeXmlText(image.source)}</datasource><layername>${escapeXmlText(image.name)}</layername><srs>${srs}</srs><provider>gdal</provider></maplayer>`
    : '';
  const tree = topFirst
    .map((layer) =>
      treeLayer(
        layer,
        !layer.hidden && (!layer.group || layer.group === groups[0])
      )
    )
    .join('');
  const themes = groups
    .map(
      (group) =>
        `<visibility-preset name="${escapeXmlText(group)}" has-checked-group-info="1" has-expanded-info="1">${topFirst
          .filter(
            (layer) => !layer.hidden && (!layer.group || layer.group === group)
          )
          .map(
            (layer) =>
              `<layer id="${escapeXmlText(layer.id)}" style="default" visible="1" expanded="1"/>`
          )
          .join(
            ''
          )}<checked-group-nodes/><expanded-group-nodes/></visibility-preset>`
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

  const layout = options.layout
    ? buildQgisLayoutXml({
        ...options.layout,
        legends: options.layout.legends.map((legend) => ({
          ...legend,
          sections: legend.sections.map(({ tables, ...section }) => ({
            ...section,
            layers: tables.flatMap(({ table, ...entries }) => {
              const layer = topFirst.find((entry) => entry.table === table);
              return layer
                ? [
                    {
                      id: layer.id,
                      name: layer.name,
                      source: layer.source,
                      ...entries
                    }
                  ]
                : [];
            })
          }))
        }))
      })
    : '';

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
    `<layer-tree-group>${imageTree}${tree}</layer-tree-group>`,
    ...(themes ? [`<visibility-presets>${themes}</visibility-presets>`] : []),
    `<projectlayers>${imageLayer}${mapLayers}</projectlayers>`,
    // Without ProjectionsEnabled QGIS reads the project as having no CRS.
    '<properties name="properties"><properties name="Paths"><properties name="Absolute" type="bool">false</properties></properties><properties name="SpatialRefSys"><properties name="ProjectionsEnabled" type="int">1</properties></properties>' +
      `<properties name="Gui"><properties name="CanvasColorRedPart" type="int">${red}</properties><properties name="CanvasColorGreenPart" type="int">${green}</properties><properties name="CanvasColorBluePart" type="int">${blue}</properties></properties></properties>`,
    layout,
    '</qgis>'
  ].join('\n');
}
