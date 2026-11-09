/**
 * QGIS layer style (QML) writer. Every size is in millimetres on the page,
 * every colour an `[r, g, b, a]` tuple with alpha in 0–255.
 */

export type Rgba = readonly [number, number, number, number];

export type DataDefinedProperties = Partial<Record<string, string>>;

export interface QmlStroke {
  color: Rgba;
  widthMm: number;
  /** Dash and gap lengths, in millimetres. */
  dashMm?: readonly number[] | null;
  cap?: 'round' | 'square' | 'flat';
}

export type QmlSymbolLayer =
  | {
      kind: 'fill';
      color: Rgba | null;
      stroke: QmlStroke | null;
      dataDefined?: DataDefinedProperties;
    }
  | {
      kind: 'line';
      stroke: QmlStroke;
      dataDefined?: DataDefinedProperties;
    }
  | {
      kind: 'marker';
      shape: string;
      sizeMm: number;
      color: Rgba | null;
      stroke: QmlStroke | null;
      dataDefined?: DataDefinedProperties;
    }
  | {
      /** A marker whose width and height are set apart (bars, spikes). */
      kind: 'ellipse-marker';
      shape: 'rectangle' | 'triangle';
      widthMm: number;
      heightMm: number;
      color: Rgba | null;
      stroke: QmlStroke | null;
      dataDefined?: DataDefinedProperties;
    }
  | {
      /** Parallel lines across a polygon (hatching). */
      kind: 'line-pattern';
      /** Counter-clockwise from horizontal, as QGIS measures it. */
      angle: number;
      distanceMm: number;
      lineWidthMm: number;
      color: Rgba;
    }
  | {
      /** A grid of markers across a polygon (dots, squares…). */
      kind: 'point-pattern';
      angle: number;
      distanceMm: number;
      marker: { shape: string; sizeMm: number; color: Rgba; angle?: number };
    };

export interface QmlSymbol {
  type: 'fill' | 'line' | 'marker';
  /** Symbol opacity, 0 to 1. */
  opacity: number;
  layers: QmlSymbolLayer[];
}

export interface QmlRule {
  filter: string;
  label: string;
  symbol: QmlSymbol;
}

export interface QmlCategory {
  value: string;
  label: string;
  symbol: QmlSymbol;
  render: boolean;
}

/** The nested circles QGIS draws for a size read from the data. */
export interface QmlSizeLegend {
  title: string;
  /** Largest first; size is the symbol size QGIS draws, in millimetres. */
  classes: Array<{ label: string; sizeMm: number }>;
}

export type QmlRenderer =
  | { type: 'null' }
  | {
      type: 'single';
      symbol: QmlSymbol;
      orderBy?: QmlOrderBy;
      sizeLegend?: QmlSizeLegend;
    }
  | {
      type: 'rules';
      rules: QmlRule[];
      orderBy?: QmlOrderBy;
      sizeLegend?: QmlSizeLegend;
    }
  | {
      type: 'categories';
      attribute: string;
      categories: QmlCategory[];
      orderBy?: QmlOrderBy;
      sizeLegend?: QmlSizeLegend;
    };

export interface QmlOrderBy {
  expression: string;
  ascending: boolean;
}

export interface QmlTextFormat {
  fontFamily: string;
  sizePt: number;
  color: Rgba;
  bold: boolean;
  italic: boolean;
  buffer: { sizeMm: number; color: Rgba } | null;
  dataDefined?: DataDefinedProperties;
}

export interface QmlLabelRule {
  /** An expression giving the text of the label. */
  expression: string;
  /** Filter on the features that get this label; empty for all. */
  filter?: string;
  description: string;
  format: QmlTextFormat;
  /** Vertical shift from the anchor, in millimetres; positive goes up. */
  offsetUpMm: number;
  align: 'left' | 'center' | 'right';
  allowOverlap: boolean;
}

export interface QmlLayerStyle {
  renderer: QmlRenderer;
  labels?: QmlLabelRule[];
  geometryType: 'point' | 'line' | 'polygon';
}

// The Khartis page counts in points (A4 is 842 × 595). QGIS reads Point as
// the label unit and MM for everything else.
export const MM_PER_PAGE_UNIT = 25.4 / 72;
export const PT_PER_PAGE_UNIT = 1;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function element(
  name: string,
  attributes: Record<string, string | number> = {},
  children: string[] = []
): string {
  const attrs = Object.entries(attributes)
    .map(([key, value]) => ` ${key}="${escapeXml(String(value))}"`)
    .join('');
  return children.length === 0
    ? `<${name}${attrs}/>`
    : `<${name}${attrs}>${children.join('')}</${name}>`;
}

function option(name: string, value: string | number): string {
  return element('Option', { name, type: 'QString', value });
}

/** QGIS rounds what it reads; a fixed precision keeps the output stable. */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return '0';
  }
  return String(Number(value.toPrecision(10)));
}

export function formatRgba([r, g, b, a]: Rgba): string {
  return [r, g, b, a].map((channel) => Math.round(channel)).join(',');
}

const TRANSPARENT: Rgba = [0, 0, 0, 0];

function dataDefinedBlock(
  tag: string,
  properties: DataDefinedProperties = {}
): string {
  const entries = Object.entries(properties).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string'
  );
  const propertiesOption =
    entries.length === 0
      ? element('Option', { name: 'properties' })
      : element(
          'Option',
          { name: 'properties', type: 'Map' },
          entries.map(([name, expression]) =>
            element('Option', { name, type: 'Map' }, [
              element('Option', {
                name: 'active',
                type: 'bool',
                value: 'true'
              }),
              element('Option', {
                name: 'expression',
                type: 'QString',
                value: expression
              }),
              // 3: an expression-based property.
              element('Option', { name: 'type', type: 'int', value: 3 })
            ])
          )
        );
  return element(tag, {}, [
    element('Option', { type: 'Map' }, [
      option('name', ''),
      propertiesOption,
      option('type', 'collection')
    ])
  ]);
}

function dashOptions(stroke: QmlStroke | null, prefix = ''): string[] {
  const dash = stroke?.dashMm?.filter((value) => value > 0) ?? [];
  return dash.length >= 2
    ? [
        option(`${prefix}use_custom_dash`, '1'),
        option(`${prefix}customdash`, dash.map(formatNumber).join(';')),
        option(`${prefix}customdash_unit`, 'MM')
      ]
    : [option(`${prefix}use_custom_dash`, '0')];
}

function capStyle(stroke: QmlStroke | null): string {
  return stroke?.cap ?? 'round';
}

function symbolLayerXml(layer: QmlSymbolLayer): string {
  const options: string[] = [];
  let className: string;

  switch (layer.kind) {
    case 'fill':
      className = 'SimpleFill';
      options.push(
        option('color', formatRgba(layer.color ?? TRANSPARENT)),
        option('style', layer.color ? 'solid' : 'no'),
        option('outline_color', formatRgba(layer.stroke?.color ?? TRANSPARENT)),
        option('outline_style', layer.stroke ? 'solid' : 'no'),
        option('outline_width', formatNumber(layer.stroke?.widthMm ?? 0)),
        option('outline_width_unit', 'MM'),
        option('joinstyle', 'round')
      );
      break;
    case 'line':
      className = 'SimpleLine';
      options.push(
        option('line_color', formatRgba(layer.stroke.color)),
        option('line_width', formatNumber(layer.stroke.widthMm)),
        option('line_width_unit', 'MM'),
        option('line_style', 'solid'),
        option('capstyle', capStyle(layer.stroke)),
        option('joinstyle', 'round'),
        ...dashOptions(layer.stroke)
      );
      break;
    case 'marker':
      className = 'SimpleMarker';
      options.push(
        option('name', layer.shape),
        option('size', formatNumber(layer.sizeMm)),
        option('size_unit', 'MM'),
        option('scale_method', 'diameter'),
        option('color', formatRgba(layer.color ?? TRANSPARENT)),
        option('outline_color', formatRgba(layer.stroke?.color ?? TRANSPARENT)),
        option('outline_style', layer.stroke ? 'solid' : 'no'),
        option('outline_width', formatNumber(layer.stroke?.widthMm ?? 0)),
        option('outline_width_unit', 'MM'),
        option('offset_unit', 'MM'),
        option('joinstyle', 'round')
      );
      break;
    case 'line-pattern':
      return element(
        'layer',
        { class: 'LinePatternFill', enabled: 1, locked: 0, pass: 0 },
        [
          element('Option', { type: 'Map' }, [
            option('angle', formatNumber(layer.angle)),
            option('distance', formatNumber(layer.distanceMm)),
            option('distance_unit', 'MM'),
            option('offset', '0'),
            option('offset_unit', 'MM'),
            option('coordinate_reference', 'viewport'),
            option('clip_mode', 'during_render')
          ]),
          dataDefinedBlock('data_defined_properties'),
          symbolXml(
            {
              type: 'line',
              opacity: 1,
              layers: [
                {
                  kind: 'line',
                  stroke: {
                    color: layer.color,
                    widthMm: layer.lineWidthMm,
                    cap: 'flat'
                  }
                }
              ]
            },
            '@pattern@line'
          )
        ]
      );
    case 'point-pattern':
      return element(
        'layer',
        { class: 'PointPatternFill', enabled: 1, locked: 0, pass: 0 },
        [
          element('Option', { type: 'Map' }, [
            element('Option', {
              name: 'angle',
              type: 'double',
              value: formatNumber(layer.angle)
            }),
            option('distance_x', formatNumber(layer.distanceMm)),
            option('distance_x_unit', 'MM'),
            option('distance_y', formatNumber(layer.distanceMm)),
            option('distance_y_unit', 'MM'),
            option('displacement_x', '0'),
            option('displacement_x_unit', 'MM'),
            option('displacement_y', '0'),
            option('displacement_y_unit', 'MM'),
            option('coordinate_reference', 'viewport'),
            option('clip_mode', 'shape')
          ]),
          dataDefinedBlock('data_defined_properties'),
          symbolXml(
            {
              type: 'marker',
              opacity: 1,
              layers: [
                {
                  kind: 'marker',
                  shape: layer.marker.shape,
                  sizeMm: layer.marker.sizeMm,
                  color: layer.marker.color,
                  stroke: null,
                  dataDefined:
                    layer.marker.angle !== undefined
                      ? { angle: qgisNumber(layer.marker.angle) }
                      : undefined
                }
              ]
            },
            '@pattern@marker'
          )
        ]
      );
    case 'ellipse-marker':
      className = 'EllipseMarker';
      options.push(
        option('symbol_name', layer.shape),
        option('symbol_width', formatNumber(layer.widthMm)),
        option('symbol_width_unit', 'MM'),
        option('symbol_height', formatNumber(layer.heightMm)),
        option('symbol_height_unit', 'MM'),
        option('fill_color', formatRgba(layer.color ?? TRANSPARENT)),
        option('outline_color', formatRgba(layer.stroke?.color ?? TRANSPARENT)),
        option('outline_style', layer.stroke ? 'solid' : 'no'),
        option('outline_width', formatNumber(layer.stroke?.widthMm ?? 0)),
        option('outline_width_unit', 'MM'),
        option('offset_unit', 'MM'),
        option('joinstyle', 'miter')
      );
      break;
  }

  return element(
    'layer',
    { class: className, enabled: 1, locked: 0, pass: 0 },
    [
      element('Option', { type: 'Map' }, options),
      dataDefinedBlock('data_defined_properties', layer.dataDefined)
    ]
  );
}

// A dashed polygon outline needs its own line layer: SimpleFill only knows
// the Qt pen styles.
function expandSymbolLayers(symbol: QmlSymbol): QmlSymbolLayer[] {
  return symbol.layers.flatMap((layer): QmlSymbolLayer[] => {
    if (layer.kind !== 'fill' || !layer.stroke?.dashMm?.length) {
      return [layer];
    }
    const outlineDataDefined: DataDefinedProperties = {};
    if (layer.dataDefined?.outlineColor) {
      outlineDataDefined.outlineColor = layer.dataDefined.outlineColor;
    }
    return [
      { ...layer, stroke: null },
      { kind: 'line', stroke: layer.stroke, dataDefined: outlineDataDefined }
    ];
  });
}

export function symbolXml(symbol: QmlSymbol, name: string): string {
  return element(
    'symbol',
    {
      type: symbol.type,
      name,
      alpha: formatNumber(symbol.opacity),
      clip_to_extent: 1,
      force_rhr: 0
    },
    [
      dataDefinedBlock('data_defined_properties'),
      ...expandSymbolLayers(symbol).map(symbolLayerXml)
    ]
  );
}

function orderByXml(orderBy: QmlOrderBy | undefined): string[] {
  return orderBy
    ? [
        element('orderby', {}, [
          `<orderByClause asc="${orderBy.ascending ? 1 : 0}" nullsFirst="0">${escapeXml(orderBy.expression)}</orderByClause>`
        ])
      ]
    : [];
}

type SimpleMarker = Extract<QmlSymbolLayer, { kind: 'marker' }>;

function onlyMarker(symbol: QmlSymbol): SimpleMarker | null {
  const [layer] = symbol.layers;
  return symbol.type === 'marker' &&
    symbol.layers.length === 1 &&
    layer.kind === 'marker'
    ? layer
    : null;
}

function markerSize(layer: SimpleMarker): string {
  return layer.dataDefined?.size ?? formatNumber(layer.sizeMm);
}

function withSize(symbol: QmlSymbol, size: string): QmlSymbol {
  return {
    ...symbol,
    layers: symbol.layers.map((layer) =>
      layer.kind === 'marker'
        ? { ...layer, dataDefined: { ...layer.dataDefined, size } }
        : layer
    )
  };
}

function sizeLegendXml(legend: QmlSizeLegend): string {
  return element(
    'data-defined-size-legend',
    { title: legend.title, type: 'collapsed', valign: 'bottom' },
    [
      element(
        'classes',
        {},
        legend.classes.map((entry) =>
          element('class', {
            label: entry.label,
            size: formatNumber(entry.sizeMm)
          })
        )
      )
    ]
  );
}

/**
 * QGIS draws the size legend of a single or categorized renderer only, and
 * only when every symbol reads its size from one and the same expression:
 * exclusive rules become categories of an expression that names the rule,
 * and the sizes one expression that picks the size of the feature's rule.
 */
function withNativeSizeLegend(renderer: QmlRenderer): QmlRenderer {
  if (renderer.type === 'null' || !renderer.sizeLegend) {
    return renderer;
  }
  const entries =
    renderer.type === 'single'
      ? [{ filter: 'TRUE', symbol: renderer.symbol }]
      : renderer.type === 'rules'
        ? renderer.rules
        : renderer.categories.map((category) => ({
            filter: `${qgisField(renderer.attribute)} = ${qgisString(category.value)}`,
            symbol: category.symbol
          }));
  const markers = entries.map((entry) => onlyMarker(entry.symbol));
  if (markers.some((marker) => marker === null)) {
    const { sizeLegend: _, ...rest } = renderer;
    return rest;
  }
  const sizes = (markers as SimpleMarker[]).map(markerSize);
  const size = sizes.every((value) => value === sizes[0])
    ? sizes[0]
    : `CASE ${entries.map((entry, index) => `WHEN ${entry.filter} THEN ${sizes[index]}`).join(' ')} END`;
  switch (renderer.type) {
    case 'single':
      return { ...renderer, symbol: withSize(renderer.symbol, size) };
    case 'categories':
      return {
        ...renderer,
        categories: renderer.categories.map((category) => ({
          ...category,
          symbol: withSize(category.symbol, size)
        }))
      };
    case 'rules':
      return {
        type: 'categories',
        attribute: `CASE ${renderer.rules.map((rule, index) => `WHEN ${rule.filter} THEN '${index}'`).join(' ')} END`,
        categories: renderer.rules.map((rule, index) => ({
          value: `${index}`,
          label: rule.label,
          symbol: withSize(rule.symbol, size),
          render: true
        })),
        orderBy: renderer.orderBy,
        sizeLegend: renderer.sizeLegend
      };
  }
}

// The nested circles take the look of the first symbol, in grey when the
// symbols differ in colour.
function sizeLegendSymbol(symbols: QmlSymbol[]): QmlSymbol {
  const [first] = symbols;
  const colors = new Set(
    symbols.map((symbol) =>
      formatRgba(onlyMarker(symbol)?.color ?? TRANSPARENT)
    )
  );
  return colors.size <= 1
    ? first
    : {
        ...first,
        layers: first.layers.map((layer) =>
          layer.kind === 'marker'
            ? {
                ...layer,
                color: [255, 255, 255, 255],
                stroke: {
                  color: [90, 90, 90, 255],
                  widthMm: layer.stroke?.widthMm || 0.2
                }
              }
            : layer
        )
      };
}

function rendererXml(input: QmlRenderer): string {
  const renderer = withNativeSizeLegend(input);
  const sizeLegend =
    renderer.type !== 'null' && renderer.sizeLegend
      ? [sizeLegendXml(renderer.sizeLegend)]
      : [];
  const common = {
    forceraster: 0,
    symbollevels: 0,
    enableorderby:
      'orderBy' in renderer && renderer.orderBy !== undefined ? 1 : 0
  };

  switch (renderer.type) {
    case 'null':
      return element('renderer-v2', { ...common, type: 'nullSymbol' });
    case 'single':
      return element('renderer-v2', { ...common, type: 'singleSymbol' }, [
        element('symbols', {}, [symbolXml(renderer.symbol, '0')]),
        ...orderByXml(renderer.orderBy),
        ...sizeLegend
      ]);
    case 'rules':
      return element('renderer-v2', { ...common, type: 'RuleRenderer' }, [
        element(
          'rules',
          { key: 'root' },
          renderer.rules.map((rule, index) =>
            element('rule', {
              key: `rule_${index}`,
              filter: rule.filter,
              label: rule.label,
              symbol: index
            })
          )
        ),
        element(
          'symbols',
          {},
          renderer.rules.map((rule, index) =>
            symbolXml(rule.symbol, `${index}`)
          )
        ),
        ...orderByXml(renderer.orderBy)
      ]);
    case 'categories':
      return element(
        'renderer-v2',
        { ...common, type: 'categorizedSymbol', attr: renderer.attribute },
        [
          element(
            'categories',
            {},
            renderer.categories.map((category, index) =>
              element('category', {
                value: category.value,
                label: category.label,
                symbol: index,
                render: category.render ? 'true' : 'false'
              })
            )
          ),
          element(
            'symbols',
            {},
            renderer.categories.map((category, index) =>
              symbolXml(category.symbol, `${index}`)
            )
          ),
          ...(sizeLegend.length > 0
            ? [
                element('source-symbol', {}, [
                  symbolXml(
                    sizeLegendSymbol(
                      renderer.categories.map((category) => category.symbol)
                    ),
                    '0'
                  )
                ])
              ]
            : []),
          ...orderByXml(renderer.orderBy),
          ...sizeLegend
        ]
      );
  }
}

const QUAD_OFFSET = { left: 3, center: 4, right: 5 } as const;
const MULTILINE_ALIGN = { left: 0, center: 1, right: 2 } as const;

function labelSettingsXml(rule: QmlLabelRule, geometryType: string): string {
  const { format } = rule;
  return element('settings', { calloutType: 'simple' }, [
    element(
      'text-style',
      {
        fieldName: rule.expression,
        isExpression: 1,
        fontFamily: format.fontFamily,
        namedStyle: '',
        fontSize: formatNumber(format.sizePt),
        fontSizeUnit: 'Point',
        fontWeight: format.bold ? 700 : 400,
        fontItalic: format.italic ? 1 : 0,
        forcedBold: format.bold ? 1 : 0,
        forcedItalic: format.italic ? 1 : 0,
        textColor: formatRgba(format.color),
        textOpacity: formatNumber(format.color[3] / 255),
        multilineHeight: 1,
        allowHtml: 0
      },
      [
        element('text-buffer', {
          bufferDraw: format.buffer ? 1 : 0,
          bufferSize: formatNumber(format.buffer?.sizeMm ?? 0),
          bufferSizeUnits: 'MM',
          bufferColor: formatRgba(format.buffer?.color ?? [255, 255, 255, 255]),
          bufferOpacity: formatNumber((format.buffer?.color[3] ?? 255) / 255),
          bufferNoFill: 1,
          bufferJoinStyle: 128
        }),
        dataDefinedBlock('dd_properties')
      ]
    ),
    element('text-format', {
      multilineAlign: MULTILINE_ALIGN[rule.align],
      wrapChar: '',
      autoWrapLength: 0
    }),
    element('placement', {
      // 1: over the point; polygons use their representative point.
      placement: geometryType === 'line' ? 2 : 1,
      quadOffset:
        QUAD_OFFSET[
          rule.align === 'left'
            ? 'right'
            : rule.align === 'right'
              ? 'left'
              : 'center'
        ],
      offsetType: 0,
      xOffset: 0,
      yOffset: formatNumber(-rule.offsetUpMm),
      offsetUnits: 'MM',
      dist: 0,
      centroidInside: 1,
      centroidWhole: 1,
      overlapHandling: rule.allowOverlap
        ? 'AllowOverlapAnywhere'
        : 'PreventOverlap',
      allowDegraded: 0,
      priority: 5
    }),
    element('rendering', {
      drawLabels: 1,
      displayAll: rule.allowOverlap ? 1 : 0,
      obstacle: 1,
      obstacleFactor: 1,
      obstacleType: 1,
      upsidedownLabels: 0,
      scaleVisibility: 0,
      limitNumLabels: 0
    }),
    dataDefinedBlock('dd_properties', rule.format.dataDefined)
  ]);
}

function labelingXml(
  labels: QmlLabelRule[] | undefined,
  geometryType: string
): string[] {
  if (!labels?.length) {
    return [];
  }
  return [
    element('labeling', { type: 'rule-based' }, [
      element(
        'rules',
        { key: 'labels_root' },
        labels.map((rule, index) =>
          element(
            'rule',
            {
              key: `label_${index}`,
              description: rule.description,
              ...(rule.filter ? { filter: rule.filter } : {})
            },
            [labelSettingsXml(rule, geometryType)]
          )
        )
      )
    ])
  ];
}

const GEOMETRY_TYPE_CODE = { point: 0, line: 1, polygon: 2 } as const;

/** The elements of a style, shared by a QML file and a project layer. */
export function buildQmlBody(style: QmlLayerStyle): string {
  return [
    rendererXml(style.renderer),
    ...labelingXml(style.labels, style.geometryType),
    element('blendMode', {}, ['0']),
    element('featureBlendMode', {}, ['0']),
    element('layerGeometryType', {}, [
      String(GEOMETRY_TYPE_CODE[style.geometryType])
    ])
  ].join('');
}

export function buildQml(style: QmlLayerStyle): string {
  return [
    "<!DOCTYPE qgis PUBLIC 'http://mrcc.com/qgis.dtd' 'SYSTEM'>",
    `<qgis version="3.34.0" styleCategories="Symbology|Labeling" labelsEnabled="${style.labels?.length ? 1 : 0}">`,
    buildQmlBody(style),
    '</qgis>'
  ].join('\n');
}

export function escapeXmlText(value: string): string {
  return escapeXml(value);
}

/** A QGIS expression literal for a field name. */
export function qgisField(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export function qgisString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function qgisNumber(value: number): string {
  return formatNumber(value);
}
