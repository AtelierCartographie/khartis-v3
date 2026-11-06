// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  FillMode,
  ShapeType,
  StrokeMode,
  SymbolMode
} from '$lib/features/commons/constants/visualization.constants';
import {
  PrimitiveFilterType,
  type VisualizationConfig
} from '$lib/features/commons/stores/visualization.store.svelte';
import {
  getClassIndexForValue,
  getProportionalSymbolSizeForValue
} from '$lib/features/map/utils/data-styling.utils';
import { classFilterExpression, resolveClassIntervals } from './qgis-classes';
import {
  buildVisualizationLayerPlans,
  type QgisStyleContext
} from './qgis-style';
import { buildQml, MM_PER_CSS_PX } from './qml';
import { transformWkb } from './wkb-transform';
import { resolveQgisPattern } from './qgis-patterns';
import { DOUBLE_SYMBOL_FIELDS } from './qgis-style';

function classOf(
  value: number,
  breaks: number[],
  classCount: number
): number | null {
  const classes = resolveClassIntervals(breaks, classCount) ?? [];
  const index = classes.findIndex((intervals) =>
    intervals.some(
      ({ min, max }) =>
        (min === undefined || value >= min) &&
        (max === undefined || value < max)
    )
  );
  return index === -1 ? null : index;
}

// Evaluates the subset of QGIS expressions written for sizes and colours:
// arithmetic, comparisons and single-branch CASE.
function evaluateNumericExpression(
  expression: string | undefined,
  fields: Record<string, number | string>
): number {
  const source = (expression ?? 'NaN')
    .replace(
      /"([^"]+)"/g,
      (_, name: string) => `(${JSON.stringify(fields[name])})`
    )
    .replace(/CASE WHEN /g, '((')
    .replace(/ THEN /g, ') ? (')
    .replace(/ ELSE /g, ') : (')
    .replace(/ END/g, '))')
    .replace(/ = /g, ' === ');
  const evaluate = new Function(
    'sqrt',
    'min',
    'abs',
    'ln',
    'coalesce',
    `return ${source};`
  ) as (...helpers: unknown[]) => number;
  return evaluate(
    Math.sqrt,
    Math.min,
    Math.abs,
    Math.log,
    (...values: number[]) => values.find((value) => Number.isFinite(value))
  );
}

const context: QgisStyleContext = {
  domain: () => ({ min: 0, max: 400 }),
  formatValue: (value) => String(value),
  missingDataLabel: 'No data'
};

function choroplethWithSymbolsAndLabels(): VisualizationConfig {
  return {
    id: 'viz',
    name: 'Viz',
    type: 'choropleth',
    datasetId: 'dataset',
    enabled: true,
    primitiveFilters: [
      PrimitiveFilterType.POLYGON,
      PrimitiveFilterType.POINT,
      PrimitiveFilterType.TEXT
    ],
    primitiveOrder: [
      PrimitiveFilterType.TEXT,
      PrimitiveFilterType.POINT,
      PrimitiveFilterType.POLYGON
    ],
    style: {},
    mapping: {},
    polygon: {
      enabled: true,
      fillMode: FillMode.CLASSES,
      fillOpacity: 1,
      strokeMode: StrokeMode.UNIQUE,
      strokeColor: '#ffffff',
      strokeWidth: 2,
      strokeOpacity: 1,
      strokeDashed: false,
      valueColumn: 'rate',
      classification: {
        method: 'quantiles',
        classes: 3,
        breaks: [0, 10, 20, 30],
        colors: ['#fee0d2', '#fc9272', '#de2d26']
      },
      missingData: { show: true, shape: 'circle', size: 4, color: '#cccccc' }
    },
    symbol: {
      enabled: true,
      mode: SymbolMode.PROPORTIONAL,
      shape: ShapeType.CIRCLE,
      size: 10,
      minSize: 2,
      maxSize: 20,
      sizeScale: 'sqrt',
      opacity: 1,
      fillMode: FillMode.UNIQUE,
      fillColor: '#3182bd',
      strokeMode: StrokeMode.UNIQUE,
      strokeColor: '#ffffff',
      strokeWidth: 3,
      strokeOpacity: 1,
      strokeDashed: false,
      proportionalType: 'uniques',
      categoryShape: 'unique',
      sizeColumn: 'population',
      missingData: { show: false, shape: 'circle', size: 4, color: '#cccccc' }
    },
    text: {
      enabled: true,
      labelColumn: 'name',
      colorMode: 'unique',
      sizeMode: 'fixed',
      fontFamily: 'Open Sans',
      color: '#222222',
      opacity: 1,
      size: 12,
      bold: true,
      italic: false,
      align: 'center',
      halo: true,
      haloColor: '#ffffff',
      haloWidth: 2,
      haloOpacity: 1,
      collisionDetection: true,
      dxpMasking: false,
      secondaryLabels: {
        enabled: false,
        fontFamily: 'Open Sans',
        opacity: 1,
        size: 9,
        bold: false,
        italic: false,
        align: 'center',
        halo: false,
        haloWidth: 0,
        haloOpacity: 1,
        collisionDetection: true,
        dxpMasking: false
      }
    }
  } as unknown as VisualizationConfig;
}

describe('QGIS class rules', () => {
  it.each([
    ['inner thresholds', [10, 20, 30], 4],
    ['lower bounds', [0, 10, 20, 30], 4],
    ['full bounds', [0, 10, 20, 30], 3],
    ['full bounds with repeated break', [0, 10, 10, 30], 3]
  ])(
    'should put every value in the class the map draws when breaks are %s',
    (_, breaks, classCount) => {
      const values = [-5, ...breaks, ...breaks.map((value) => value + 0.5), 99];
      for (const value of values) {
        expect(classOf(value, breaks, classCount)).toBe(
          getClassIndexForValue(value, breaks, classCount)
        );
      }
    }
  );

  it('should keep missing values out of every class', () => {
    const [first] = resolveClassIntervals([10, 20], 3) ?? [];
    expect(classFilterExpression('rate', first)).toBe(
      '"rate" IS NOT NULL AND ("rate" < 10)'
    );
  });
});

describe('QGIS layer plans', () => {
  it('should stack the primitives in map order, labels on top', () => {
    const plans = buildVisualizationLayerPlans(
      choroplethWithSymbolsAndLabels(),
      context,
      [
        PrimitiveFilterType.TEXT,
        PrimitiveFilterType.POINT,
        PrimitiveFilterType.POLYGON
      ]
    );

    expect(plans.map((plan) => plan.primitive)).toEqual([
      PrimitiveFilterType.POLYGON,
      PrimitiveFilterType.POINT,
      PrimitiveFilterType.TEXT
    ]);
    expect(plans.map((plan) => plan.geometry)).toEqual([
      'polygon',
      'point',
      'point'
    ]);
  });

  it('should give each class its colour and add the missing-data rule', () => {
    const [polygon] = buildVisualizationLayerPlans(
      choroplethWithSymbolsAndLabels(),
      context,
      []
    );
    const { renderer } = polygon.style;

    expect(renderer.type).toBe('rules');
    if (renderer.type !== 'rules') return;
    expect(renderer.rules.map((rule) => rule.label)).toEqual([
      '0 – 10',
      '10 – 20',
      '20 – 30',
      'No data'
    ]);
    expect(
      renderer.rules.map((rule) => {
        const layer = rule.symbol.layers[0];
        return layer.kind === 'fill' ? layer.color : null;
      })
    ).toEqual([
      [254, 224, 210, 255],
      [252, 146, 114, 255],
      [222, 45, 38, 255],
      [204, 204, 204, 255]
    ]);
    expect(renderer.rules[3].filter).toBe('"rate" IS NULL');
    // Stroke width is stored in style units and drawn at width / 4.
    const stroke = renderer.rules[0].symbol.layers[0];
    expect(stroke.kind === 'fill' && stroke.stroke?.widthMm).toBeCloseTo(
      0.5 * MM_PER_CSS_PX
    );
  });

  it('should size proportional symbols against the map domain, largest first', () => {
    const plans = buildVisualizationLayerPlans(
      choroplethWithSymbolsAndLabels(),
      context,
      []
    );
    const symbols = plans.find(
      (plan) => plan.primitive === PrimitiveFilterType.POINT
    );
    const renderer = symbols?.style.renderer;

    expect(renderer?.type).toBe('single');
    if (renderer?.type !== 'single') return;
    const [layer] = renderer.symbol.layers;
    const sizeExpression =
      layer.kind === 'marker' ? layer.dataDefined?.size : undefined;
    for (const value of [0, 25, 100, -400, 1000]) {
      expect(
        evaluateNumericExpression(sizeExpression, { population: value })
      ).toBeCloseTo(
        2 * getProportionalSymbolSizeForValue(value, 400, 20) * MM_PER_CSS_PX
      );
    }
    expect(renderer.orderBy?.ascending).toBe(false);
    expect(symbols?.columns).toEqual(['population']);
  });

  it('should label with the font, size and halo of the map', () => {
    const plans = buildVisualizationLayerPlans(
      choroplethWithSymbolsAndLabels(),
      context,
      []
    );
    const text = plans.find(
      (plan) => plan.primitive === PrimitiveFilterType.TEXT
    );
    const [label] = text?.style.labels ?? [];

    expect(text?.style.renderer.type).toBe('null');
    expect(label.expression).toBe('"name"');
    expect(label.format).toMatchObject({
      fontFamily: 'Open Sans',
      sizePt: 9,
      bold: true,
      color: [34, 34, 34, 255]
    });
    expect(label.format.buffer?.sizeMm).toBeCloseTo(2 * MM_PER_CSS_PX);
    expect(text?.notes.map((note) => note.code)).toContain('font');
  });

  it('should escape what comes from the data in the QML', () => {
    const viz = choroplethWithSymbolsAndLabels();
    if (viz.polygon?.classification) {
      viz.polygon.valueColumn = 'taux "brut" <%>';
    }
    const [polygon] = buildVisualizationLayerPlans(viz, context, []);
    const qml = buildQml(polygon.style);

    expect(qml).toContain(
      '&quot;taux &quot;&quot;brut&quot;&quot; &lt;%&gt;&quot;'
    );
    expect(qml).not.toContain('<%>');
  });
});

describe('WKB reprojection fallback', () => {
  // MULTIPOLYGON with one square ring, big endian: the order GDAL may write.
  function bigEndianSquare(): Uint8Array {
    const ring: Array<[number, number]> = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0]
    ];
    const bytes = new Uint8Array(9 + 9 + 4 + ring.length * 16);
    const view = new DataView(bytes.buffer);
    view.setUint8(0, 0);
    view.setUint32(1, 6);
    view.setUint32(5, 1);
    view.setUint8(9, 0);
    view.setUint32(10, 3);
    view.setUint32(14, 1);
    view.setUint32(18, ring.length);
    ring.forEach(([x, y], index) => {
      view.setFloat64(22 + index * 16, x);
      view.setFloat64(30 + index * 16, y);
    });
    return bytes;
  }

  it('should move every vertex and write little endian', () => {
    const moved = transformWkb(bigEndianSquare(), ([x, y]) => [x * 10, y + 5]);
    const view = new DataView(moved!.buffer);

    expect(view.getUint8(0)).toBe(1);
    expect(view.getUint32(1, true)).toBe(6);
    expect([
      view.getFloat64(22 + 16, true),
      view.getFloat64(30 + 16, true)
    ]).toEqual([10, 5]);
  });

  it('should drop a geometry with a vertex outside the projection', () => {
    expect(
      transformWkb(bigEndianSquare(), ([x, y]) =>
        x === 1 && y === 1 ? null : [x, y]
      )
    ).toBeNull();
  });
});

describe('QGIS patterns', () => {
  it('should hatch at the spacing, thickness and slope of the motif', () => {
    // A 10 px tile, the line covering 20 % of it, turned 45° clockwise.
    const [hatch] =
      resolveQgisPattern({
        type: 'line',
        angle: 45,
        scale: 1,
        size: 20,
        fill: '#595959',
        patchSize: false
      })?.layers ?? [];

    expect(hatch).toMatchObject({
      kind: 'line-pattern',
      angle: -45,
      color: [89, 89, 89, 255]
    });
    if (hatch?.kind !== 'line-pattern') return;
    expect(hatch.distanceMm).toBeCloseTo(10 * MM_PER_CSS_PX);
    expect(hatch.lineWidthMm).toBeCloseTo(2 * MM_PER_CSS_PX);
  });

  it('should give dots the area of the motif', () => {
    const [grid] =
      resolveQgisPattern({
        type: 'circle',
        angle: 0,
        scale: 2,
        size: 10,
        fill: '#000000',
        patchSize: false
      })?.layers ?? [];

    expect(grid?.kind).toBe('point-pattern');
    if (grid?.kind !== 'point-pattern') return;
    const radiusPx = grid.marker.sizeMm / MM_PER_CSS_PX / 2;
    expect(Math.PI * radiusPx ** 2).toBeCloseTo(0.1 * 20 * 20);
  });

  it('should hatch the missing data over its colour by default', () => {
    const viz = choroplethWithSymbolsAndLabels();
    if (viz.polygon?.missingData) {
      viz.polygon.missingData = {
        ...viz.polygon.missingData,
        pattern: true,
        patternConfig: {
          shape: 'line',
          angle: 45,
          scale: 0.7,
          color: '#595959'
        }
      };
    }
    const [polygon] = buildVisualizationLayerPlans(viz, context, []);
    const { renderer } = polygon.style;
    if (renderer.type !== 'rules') throw new Error('rules expected');
    const missing = renderer.rules.find((rule) => rule.label === 'No data');

    expect(missing?.symbol.layers.map((layer) => layer.kind)).toEqual([
      'fill',
      'line-pattern',
      'line'
    ]);
    expect(polygon.notes.map((note) => note.code)).not.toContain(
      'missing-pattern'
    );
  });
});

describe('QGIS double symbols', () => {
  it('should size each variable on the shared scale and swap colours below the break', () => {
    const viz = choroplethWithSymbolsAndLabels();
    Object.assign(viz.symbol ?? {}, {
      proportionalType: 'doubles',
      valueColumn: 'households',
      fillColorB: '#ff832b',
      breakValueB: 50
    });
    const plans = buildVisualizationLayerPlans(
      viz,
      {
        ...context,
        domain: (_, column) =>
          column === 'households' ? { min: 0, max: 100 } : { min: 0, max: 400 }
      },
      []
    );
    const symbols = plans.find(
      (plan) => plan.primitive === PrimitiveFilterType.POINT
    );
    const renderer = symbols?.style.renderer;
    if (renderer?.type !== 'rules') throw new Error('rules expected');
    const [layer] = renderer.rules[1].symbol.layers;
    if (layer.kind !== 'marker') throw new Error('marker expected');
    const { roleField, valueField } = DOUBLE_SYMBOL_FIELDS;

    expect(symbols?.doubleSymbols).toMatchObject({
      primary: 'population',
      secondary: 'households'
    });
    // Common scale: both variables against the larger domain, 400.
    expect(
      evaluateNumericExpression(layer.dataDefined?.size, {
        [roleField]: 'B',
        [valueField]: 100
      })
    ).toBeCloseTo(
      2 * getProportionalSymbolSizeForValue(100, 400, 20) * MM_PER_CSS_PX
    );
    expect(layer.dataDefined?.fillColor).toContain(
      `"${valueField}" < 50 THEN color_rgba(49,130,189,255)`
    );
  });
});
