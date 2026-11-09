import { formatNumber, formatRgba, type Rgba } from './qml';

/** A box on the layout page, in millimetres from its top-left corner. */
export interface LayoutBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutFont {
  family: string;
  sizePt: number;
  bold: boolean;
  italic: boolean;
  color: Rgba;
}

export interface LayoutMap {
  key: string;
  box: LayoutBox;
  /** [xmin, ymin, xmax, ymax] in the project CRS. */
  extent: [number, number, number, number];
  background: Rgba | null;
  /** The map theme the frame follows (a map of a collection). */
  theme?: string;
}

export interface LayoutText {
  name: string;
  box: LayoutBox;
  text: string;
  font: LayoutFont;
  align: 'left' | 'center' | 'right';
  background: Rgba | null;
}

/** A project layer a legend lists. */
export interface LayoutLegendLayer {
  id: string;
  name: string;
  source: string;
  /** The legend entries shown, by index; all when absent. */
  nodeOrder?: number[];
  /** Shown above the layer's entries; the layer name stays hidden without it. */
  subtitle?: string;
  /** Icon width and height of some entries, in millimetres, by index. */
  iconSizes?: Record<number, [number, number]>;
}

/** One Khartis legend frame: a title, its layers, a note. */
export interface LayoutLegendSection {
  title: string;
  layers: LayoutLegendLayer[];
  /** Text under the entries, one line per `\n`. */
  note?: string;
}

/**
 * A QGIS legend: the Khartis legends of one column follow one another in
 * it, since a QGIS legend grows to its content where Khartis drew it.
 */
export interface LayoutLegend {
  name: string;
  box: LayoutBox;
  mapKey: string;
  sections: LayoutLegendSection[];
  font: LayoutFont;
  titleFont: LayoutFont;
}

export interface LayoutScaleBar {
  box: LayoutBox;
  mapKey: string;
  /** A line or a box, as Khartis draws it. */
  form: 'line' | 'box';
  unit: 'km' | 'mi';
  unitsPerSegment: number;
  segments: number;
  font: LayoutFont;
}

export interface LayoutNorthArrow {
  box: LayoutBox;
  mapKey: string;
}

export interface QgisLayout {
  name: string;
  page: { width: number; height: number; color: Rgba };
  maps: LayoutMap[];
  texts: LayoutText[];
  legends: LayoutLegend[];
  scaleBar?: LayoutScaleBar;
  northArrow?: LayoutNorthArrow;
}

// Item types of the QGIS layout registry.
const ITEM = {
  page: 65638,
  map: 65639,
  picture: 65640,
  label: 65641,
  legend: 65642,
  scaleBar: 65646
} as const;

// Qt alignment flags.
const ALIGN = { left: 1, right: 2, center: 4, top: 32 } as const;

function attribute(value: string | number): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\r?\n/g, '&#10;');
}

function element(
  name: string,
  attributes: Record<string, string | number>,
  children: string[] = []
): string {
  const attrs = Object.entries(attributes)
    .map(([key, value]) => ` ${key}="${attribute(value)}"`)
    .join('');
  return children.length === 0
    ? `<${name}${attrs}/>`
    : `<${name}${attrs}>${children.join('')}</${name}>`;
}

function mm(value: number): string {
  return formatNumber(Math.round(value * 1000) / 1000);
}

function color(name: string, [red, green, blue, alpha]: Rgba): string {
  return element(name, { red, green, blue, alpha });
}

function placement(box: LayoutBox): Record<string, string> {
  const position = `${mm(box.x)},${mm(box.y)},mm`;
  return {
    position,
    positionOnPage: position,
    size: `${mm(box.width)},${mm(box.height)},mm`
  };
}

function uuid(key: string): string {
  // Stable within a project: items refer to the map by it.
  const hex = Array.from(key)
    .reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 7)
    .toString(16)
    .padStart(8, '0');
  return `{${hex}-0000-4000-8000-${key.length.toString(16).padStart(12, '0')}}`;
}

function textStyle(font: LayoutFont, extra: Record<string, string> = {}) {
  return element('text-style', {
    fontFamily: font.family,
    fontSize: formatNumber(font.sizePt),
    fontSizeUnit: 'Point',
    fontWeight: font.bold ? 700 : 400,
    fontItalic: font.italic ? 1 : 0,
    forcedBold: font.bold ? 1 : 0,
    forcedItalic: font.italic ? 1 : 0,
    textColor: formatRgba(font.color),
    textOpacity: formatNumber(font.color[3] / 255),
    multilineHeight: 1.2,
    ...extra
  });
}

function common(
  type: number,
  name: string,
  box: LayoutBox,
  zValue: number,
  background: Rgba | null
): Record<string, string | number> {
  return {
    type,
    id: name,
    ...placement(box),
    zValue,
    visibility: 1,
    frame: 'false',
    background: background ? 'true' : 'false'
  };
}

function mapItem(map: LayoutMap, zValue: number): string {
  const [xmin, ymin, xmax, ymax] = map.extent;
  return element(
    'LayoutItem',
    {
      ...common(ITEM.map, map.key, map.box, zValue, map.background),
      uuid: uuid(map.key),
      keepLayerSet: 'false',
      followPreset: map.theme ? 'true' : 'false',
      followPresetName: map.theme ?? '',
      drawCanvasItems: 'true'
    },
    [
      ...(map.background ? [color('BackgroundColor', map.background)] : []),
      element('Extent', { xmin, ymin, xmax, ymax }),
      element('LayerSet', {})
    ]
  );
}

function textItem(text: LayoutText, zValue: number): string {
  return element(
    'LayoutItem',
    {
      ...common(ITEM.label, text.name, text.box, zValue, text.background),
      labelText: text.text,
      halign: ALIGN[text.align],
      valign: ALIGN.top,
      marginX: 0,
      marginY: 0,
      htmlState: 0
    },
    [
      ...(text.background ? [color('BackgroundColor', text.background)] : []),
      textStyle(text.font)
    ]
  );
}

function layerTreeProperties(properties: Record<string, string>): string {
  return element('customproperties', {}, [
    element(
      'Option',
      { type: 'Map' },
      Object.entries(properties).map(([name, value]) =>
        element('Option', { name, type: 'QString', value })
      )
    )
  ]);
}

function layerTreeLayer(
  layer: LayoutLegendLayer,
  properties: Record<string, string>
): string {
  return element(
    'layer-tree-layer',
    {
      id: layer.id,
      name: layer.name,
      source: layer.source,
      providerKey: 'ogr',
      checked: 'Qt::Checked',
      expanded: 1
    },
    [layerTreeProperties(properties)]
  );
}

// The section title is said once: each layer's own name is hidden, or
// replaced by the subtitle of its sizes.
function legendLayer(layer: LayoutLegendLayer): string {
  return layerTreeLayer(layer, {
    ...(layer.nodeOrder
      ? { 'legend/node-order': layer.nodeOrder.join(',') }
      : {}),
    ...Object.fromEntries(
      Object.entries(layer.iconSizes ?? {}).map(([index, size]) => [
        `legend/symbol-size-${index}`,
        size.map((value) => mm(value)).join(',')
      ])
    ),
    'legend/title-style': layer.subtitle ? 'subgroup' : 'hidden',
    ...(layer.subtitle ? { 'legend/title-label': layer.subtitle } : {})
  });
}

// A legend has no free text: the note is the title of a layer entry that
// lists none of its symbols.
function legendNote(layer: LayoutLegendLayer, text: string): string {
  return layerTreeLayer(layer, {
    'legend/node-order': 'empty',
    'legend/title-style': 'subgroup',
    'legend/title-label': text
  });
}

function legendSection(section: LayoutLegendSection): string {
  return element(
    'layer-tree-group',
    { name: section.title, checked: 'Qt::Checked', expanded: 1 },
    [
      layerTreeProperties({
        'legend/title-style': section.title ? 'group' : 'hidden'
      }),
      ...section.layers.map(legendLayer),
      ...(section.note && section.layers.length > 0
        ? [legendNote(section.layers[0], section.note)]
        : [])
    ]
  );
}

function legendItem(legend: LayoutLegend, zValue: number): string {
  return element(
    'LayoutItem',
    {
      ...common(ITEM.legend, legend.name, legend.box, zValue, null),
      map_uuid: uuid(legend.mapKey),
      title: '',
      resizeToContents: 1,
      columnCount: 1,
      symbolWidth: 6,
      symbolHeight: 4,
      symbolAlignment: ALIGN.left,
      boxSpace: 0,
      // The styles list what the Khartis legend shows; a filter by map
      // would also drop the sizes, which no feature matches.
      legendFilterByMap: 0
    },
    [
      element('styles', {}, [
        element('style', { name: 'group', marginTop: 4, marginBottom: 2 }, [
          textStyle(legend.titleFont)
        ]),
        element('style', { name: 'subgroup', marginBottom: 2 }, [
          textStyle(legend.font)
        ]),
        // Rows as close as the Khartis legend.
        element('style', { name: 'symbol', marginTop: 1.2 }),
        element('style', { name: 'symbolLabel', marginLeft: 1.5 }, [
          textStyle(legend.font)
        ])
      ]),
      element('layer-tree-group', {}, legend.sections.map(legendSection))
    ]
  );
}

function scaleBarItem(bar: LayoutScaleBar, zValue: number): string {
  return element(
    'LayoutItem',
    {
      ...common(ITEM.scaleBar, 'Échelle', bar.box, zValue, null),
      mapUuid: uuid(bar.mapKey),
      style: bar.form === 'line' ? 'Line Ticks Up' : 'Single Box',
      unitType: bar.unit,
      unitLabel: bar.unit,
      numSegments: bar.segments,
      numSegmentsLeft: 0,
      numUnitsPerSegment: formatNumber(bar.unitsPerSegment),
      numMapUnitsPerScaleBarUnit: 1,
      segmentSizeMode: 0,
      height: 1.5,
      labelBarSpace: 1,
      alignment: 0
    },
    [textStyle(bar.font)]
  );
}

function northArrowItem(arrow: LayoutNorthArrow, zValue: number): string {
  return element('LayoutItem', {
    ...common(ITEM.picture, 'Nord', arrow.box, zValue, null),
    file: ':/images/north_arrows/layout_default_north_arrow.svg',
    mode: 2,
    resizeMode: 0,
    mapUuid: uuid(arrow.mapKey),
    // 0: grid north, the north of the map as drawn.
    northMode: 0,
    northOffset: 0
  });
}

/** The `<Layouts>` block of a QGIS project: one print layout of the page. */
export function buildQgisLayoutXml(layout: QgisLayout): string {
  let zValue = 1;
  const items = [
    ...layout.maps.map((map) => mapItem(map, zValue++)),
    ...layout.legends.map((legend) => legendItem(legend, zValue++)),
    ...layout.texts.map((text) => textItem(text, zValue++)),
    ...(layout.scaleBar ? [scaleBarItem(layout.scaleBar, zValue++)] : []),
    ...(layout.northArrow ? [northArrowItem(layout.northArrow, zValue++)] : [])
  ];
  const page = element(
    'LayoutItem',
    {
      type: ITEM.page,
      ...placement({
        x: 0,
        y: 0,
        width: layout.page.width,
        height: layout.page.height
      }),
      background: 'true',
      frame: 'false',
      zValue: 0,
      visibility: 1
    },
    [color('BackgroundColor', layout.page.color)]
  );
  return element('Layouts', {}, [
    element(
      'Layout',
      { name: layout.name, units: 'mm', printResolution: 300 },
      [element('PageCollection', {}, [page]), ...items]
    )
  ]);
}
