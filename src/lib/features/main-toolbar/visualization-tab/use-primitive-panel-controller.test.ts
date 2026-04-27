import { describe, expect, it } from 'vitest';
import {
  ClassificationMethod,
  PrimitiveFilterType,
  type ClassificationConfig,
  type TextPrimitiveConfig,
  type VisualizationConfig
} from '$lib/features/commons/store/visualization.store.svelte';
import {
  ColorMode,
  FillMode,
  StrokeMode,
  SymbolMode,
  ThicknessMode
} from '../constants';
import {
  usePrimitivePanelController,
  type ClassifiablePrimitive
} from './use-primitive-panel-controller.svelte';

function createVisualization(): VisualizationConfig {
  return {
    id: 'viz-1',
    datasetId: 'dataset-1',
    enabled: true,
    name: 'Visualization',
    type: 'choropleth',
    mapping: { categoryColumn: 'region' },
    modes: {},
    style: {},
    primitiveFilters: [PrimitiveFilterType.POINT, PrimitiveFilterType.POLYGON],
    polygon: {
      enabled: true,
      fillMode: FillMode.CLASSES,
      fillOpacity: 0.7,
      strokeMode: StrokeMode.UNIQUE,
      strokeWidth: 1,
      strokeOpacity: 1,
      strokeDashed: false,
      categoryColumn: 'region',
      classification: {
        method: ClassificationMethod.KMEANS,
        classes: 5,
        numClasses: 5
      }
    },
    symbol: {
      enabled: true,
      mode: SymbolMode.UNIQUE,
      fillMode: FillMode.UNIQUE,
      strokeMode: StrokeMode.CATEGORIES,
      fillColor: '#123456',
      strokeColor: '#654321',
      strokeWidth: 1,
      strokeOpacity: 1,
      strokeDashed: false,
      categoryColumn: 'region',
      fillValueColumn: 'population',
      fillCategoryColumn: 'region',
      size: 10,
      minSize: 5,
      maxSize: 20,
      sizeScale: 1,
      opacity: 0.8,
      shape: 'circle',
      proportionalType: 'uniques',
      categoryShape: 'unique',
      classification: {
        method: ClassificationMethod.KMEANS,
        classes: 5,
        labels: ['Old']
      },
      fillClassification: {
        method: ClassificationMethod.KMEANS,
        classes: 5,
        labels: ['Fill old']
      },
      strokeClassification: {
        method: ClassificationMethod.KMEANS,
        classes: 5,
        labels: ['Stroke']
      }
    },
    symbolClassification: {
      method: ClassificationMethod.KMEANS,
      classes: 5,
      labels: ['Root']
    },
    lineClassification: {
      method: ClassificationMethod.KMEANS,
      classes: 5,
      labels: ['Root line'],
      disabledLabels: ['Root line']
    },
    lineThicknessClassification: {
      method: ClassificationMethod.KMEANS,
      classes: 4,
      numClasses: 4,
      breaks: [10, 20, 30],
      colors: ['#f7fbff', '#c6dbef', '#6baed6', '#2171b5']
    },
    line: {
      enabled: false,
      colorMode: ColorMode.UNIQUE,
      thicknessMode: ThicknessMode.NONE,
      opacity: 1,
      width: 1,
      maxWidth: 4,
      dashed: false,
      categoryColumn: 'region',
      classification: {
        method: ClassificationMethod.KMEANS,
        classes: 5,
        labels: ['Line'],
        disabledLabels: ['Line']
      },
      thicknessClassification: {
        method: ClassificationMethod.KMEANS,
        classes: 4,
        numClasses: 4,
        breaks: [10, 20, 30],
        colors: ['#f7fbff', '#c6dbef', '#6baed6', '#2171b5']
      }
    },
    text: {
      enabled: true,
      colorMode: ColorMode.UNIQUE,
      sizeMode: 'fixed',
      fontFamily: 'Cabin',
      color: '#222222',
      opacity: 1,
      size: 12,
      bold: false,
      italic: false,
      align: 'center',
      halo: false,
      haloColor: '#ffffff',
      haloWidth: 1,
      collisionDetection: false,
      dxpMasking: false,
      labelColumn: 'label',
      secondaryLabels: {
        enabled: false,
        fontFamily: 'Inter',
        color: '#000000',
        opacity: 1,
        size: 10,
        bold: false,
        italic: false,
        align: 'center',
        halo: false,
        haloColor: '#ffffff',
        haloWidth: 1,
        collisionDetection: false,
        dxpMasking: false
      },
      background: {
        fillMode: FillMode.UNIQUE,
        fillOpacity: 1,
        strokeMode: StrokeMode.UNIQUE,
        strokeWidth: 1,
        strokeOpacity: 1,
        strokeDashed: false
      }
    },
    classification: undefined
  } as unknown as VisualizationConfig;
}

function createHarness(options?: {
  dataFields?: Array<{ id: number; text: string; type?: string }>;
  visualization?: VisualizationConfig;
}) {
  let visualization = options?.visualization ?? createVisualization();
  const dataFields = options?.dataFields ?? [
    { id: 0, text: 'id', type: 'number' },
    { id: 1, text: 'region', type: 'text' },
    { id: 2, text: 'population', type: 'number' }
  ];
  const primitiveClassificationUpdates: Array<{
    primitive: ClassifiablePrimitive;
    updates: Partial<ClassificationConfig>;
    options?: { preserveOrigin?: boolean };
  }> = [];
  const lineThicknessClassificationUpdates: Array<{
    updates: Partial<ClassificationConfig>;
    options?: { preserveOrigin?: boolean };
  }> = [];
  const primitiveStrokeClassificationUpdates: Array<{
    primitive: PrimitiveFilterType.POINT | PrimitiveFilterType.POLYGON;
    updates: Partial<ClassificationConfig>;
  }> = [];
  const textPrimitiveUpdates: Partial<TextPrimitiveConfig>[] = [];
  const visualizationUpdates: Partial<VisualizationConfig>[] = [];

  const controller = usePrimitivePanelController({
    getDataFields: () => dataFields,
    getVisualization: () => visualization,
    updatePrimitiveClassification: (primitive, updates, updateOptions) => {
      primitiveClassificationUpdates.push({
        primitive,
        updates,
        options: updateOptions
      });
    },
    updateLineThicknessClassification: (updates, updateOptions) => {
      lineThicknessClassificationUpdates.push({
        updates,
        options: updateOptions
      });
    },
    updatePrimitiveStrokeClassification: (primitive, updates) => {
      primitiveStrokeClassificationUpdates.push({ primitive, updates });
    },
    updateTextPrimitive: (updates) => {
      textPrimitiveUpdates.push(updates);
    },
    updateVisualization: (updates, afterUpdate) => {
      visualizationUpdates.push(updates);
      visualization = { ...visualization, ...updates } as VisualizationConfig;
      afterUpdate?.(visualization);
    }
  });

  return {
    controller,
    dataFields,
    get visualization() {
      return visualization;
    },
    primitiveClassificationUpdates,
    lineThicknessClassificationUpdates,
    primitiveStrokeClassificationUpdates,
    textPrimitiveUpdates,
    visualizationUpdates
  };
}

function createStaleAfterUpdateHarness(options?: {
  dataFields?: Array<{ id: number; text: string; type?: string }>;
  visualization?: VisualizationConfig;
}) {
  let visualization = options?.visualization ?? createVisualization();
  const dataFields = options?.dataFields ?? [
    { id: 0, text: 'id', type: 'number' },
    { id: 1, text: 'region', type: 'text' },
    { id: 2, text: 'population', type: 'number' }
  ];
  const primitiveClassificationUpdates: Array<{
    primitive: ClassifiablePrimitive;
    updates: Partial<ClassificationConfig>;
    options?: { preserveOrigin?: boolean };
  }> = [];
  const lineThicknessClassificationUpdates: Array<{
    updates: Partial<ClassificationConfig>;
    options?: { preserveOrigin?: boolean };
  }> = [];
  const primitiveStrokeClassificationUpdates: Array<{
    primitive: PrimitiveFilterType.POINT | PrimitiveFilterType.POLYGON;
    updates: Partial<ClassificationConfig>;
  }> = [];
  const textPrimitiveUpdates: Partial<TextPrimitiveConfig>[] = [];
  const visualizationUpdates: Partial<VisualizationConfig>[] = [];

  const controller = usePrimitivePanelController({
    getDataFields: () => dataFields,
    getVisualization: () => visualization,
    updatePrimitiveClassification: (primitive, updates, updateOptions) => {
      primitiveClassificationUpdates.push({
        primitive,
        updates,
        options: updateOptions
      });
    },
    updateLineThicknessClassification: (updates, updateOptions) => {
      lineThicknessClassificationUpdates.push({
        updates,
        options: updateOptions
      });
    },
    updatePrimitiveStrokeClassification: (primitive, updates) => {
      primitiveStrokeClassificationUpdates.push({ primitive, updates });
    },
    updateTextPrimitive: (updates) => {
      textPrimitiveUpdates.push(updates);
    },
    updateVisualization: (updates, afterUpdate) => {
      visualizationUpdates.push(updates);
      const nextVisualization = {
        ...visualization,
        ...updates
      } as VisualizationConfig;
      afterUpdate?.(nextVisualization);
      visualization = nextVisualization;
    }
  });

  return {
    controller,
    dataFields,
    get visualization() {
      return visualization;
    },
    primitiveClassificationUpdates,
    lineThicknessClassificationUpdates,
    primitiveStrokeClassificationUpdates,
    textPrimitiveUpdates,
    visualizationUpdates
  };
}

describe('use-primitive-panel-controller', () => {
  it('derives enabled primitive filters from the selected visualization state', () => {
    const harness = createHarness();

    expect(harness.controller.buildNextPrimitiveFilters()).toEqual([
      PrimitiveFilterType.POINT,
      PrimitiveFilterType.POLYGON
    ]);
    expect(
      harness.controller.buildNextPrimitiveFilters({
        [PrimitiveFilterType.LINE]: true
      })
    ).toEqual([
      PrimitiveFilterType.POINT,
      PrimitiveFilterType.LINE,
      PrimitiveFilterType.POLYGON
    ]);
  });

  it('resets symbol category labels when the point category mapping changes', () => {
    const harness = createHarness();

    harness.controller.applyPrimitiveMappingUpdate(PrimitiveFilterType.POINT, {
      categoryColumn: 'group'
    });

    const update = harness.visualizationUpdates[0];
    expect(update.symbolClassification).toMatchObject({
      labels: [],
      disabledLabels: undefined,
      categoryShapes: undefined
    });
    expect(update.symbol).toMatchObject({
      categoryColumn: 'group',
      classification: {
        labels: [],
        disabledLabels: undefined,
        categoryShapes: undefined
      },
      fillClassification: {
        labels: ['Fill old']
      },
      strokeClassification: {
        labels: undefined,
        disabledLabels: undefined
      }
    });
  });

  it('resets symbol fill labels when the fill category mapping changes', () => {
    const harness = createHarness();

    harness.controller.applySymbolFillMappingUpdate({
      categoryColumn: 'group'
    });

    expect(harness.visualizationUpdates[0]).toMatchObject({
      symbol: {
        fillCategoryColumn: 'group',
        fillClassification: {
          labels: [],
          disabledLabels: undefined
        }
      }
    });
  });

  it('resets line category labels when the line category mapping changes', () => {
    const harness = createHarness({
      visualization: {
        ...createVisualization(),
        line: {
          ...createVisualization().line,
          enabled: true,
          colorMode: ColorMode.CATEGORIES,
          categoryColumn: 'region',
          classification: {
            method: ClassificationMethod.KMEANS,
            classes: 5,
            labels: ['A', 'B'],
            disabledLabels: ['B']
          }
        },
        lineClassification: {
          method: ClassificationMethod.KMEANS,
          classes: 5,
          labels: ['Root A', 'Root B'],
          disabledLabels: ['Root A']
        }
      } as VisualizationConfig
    });

    harness.controller.applyPrimitiveMappingUpdate(PrimitiveFilterType.LINE, {
      categoryColumn: 'group'
    });

    expect(harness.visualizationUpdates[0]).toMatchObject({
      lineClassification: {
        labels: [],
        disabledLabels: undefined
      },
      line: {
        categoryColumn: 'group',
        classification: {
          labels: [],
          disabledLabels: undefined
        }
      }
    });
    expect(
      harness.visualizationUpdates[0]?.line?.thicknessClassification
    ).toEqual(createVisualization().line?.thicknessClassification);
  });

  it('preserves the qualitative line palette when only line thickness uses classes', () => {
    const harness = createHarness({
      visualization: {
        ...createVisualization(),
        line: {
          ...createVisualization().line,
          enabled: true,
          colorMode: ColorMode.CATEGORIES,
          thicknessMode: ThicknessMode.CLASSES,
          classification: {
            method: ClassificationMethod.KMEANS,
            classes: 5,
            numClasses: 5,
            paletteId: 'vif',
            colors: ['#ff0000', '#00ff00'],
            labels: ['A', 'B']
          }
        },
        lineClassification: {
          method: ClassificationMethod.KMEANS,
          classes: 5,
          numClasses: 5,
          paletteId: 'vif',
          colors: ['#ff0000', '#00ff00'],
          labels: ['A', 'B']
        }
      } as VisualizationConfig
    });

    harness.controller.ensurePrimitiveClassificationDefaults(
      PrimitiveFilterType.LINE,
      harness.visualization
    );

    expect(harness.primitiveClassificationUpdates).toEqual([]);
    harness.controller.ensureLineThicknessClassificationDefaults(
      harness.visualization
    );
    expect(harness.lineThicknessClassificationUpdates).toEqual([]);
  });

  it('initializes a dedicated thickness classification when line width classes are active', () => {
    const harness = createHarness({
      visualization: {
        ...createVisualization(),
        lineThicknessClassification: undefined,
        line: {
          ...createVisualization().line,
          enabled: true,
          colorMode: ColorMode.UNIQUE,
          thicknessMode: ThicknessMode.CLASSES,
          thicknessClassification: undefined
        }
      } as VisualizationConfig
    });

    harness.controller.ensureLineThicknessClassificationDefaults(
      harness.visualization
    );

    expect(harness.lineThicknessClassificationUpdates).toEqual([
      {
        updates: {
          method: ClassificationMethod.KMEANS,
          classes: 5,
          numClasses: 5
        },
        options: undefined
      }
    ]);
  });

  it('does not treat the color classification as an existing thickness classification', () => {
    const harness = createHarness({
      visualization: {
        ...createVisualization(),
        lineClassification: {
          method: ClassificationMethod.KMEANS,
          classes: 4,
          numClasses: 4,
          breaks: [10, 20, 30],
          colors: ['#f7fbff', '#c6dbef', '#6baed6', '#2171b5']
        },
        lineThicknessClassification: undefined,
        line: {
          ...createVisualization().line,
          enabled: true,
          colorMode: ColorMode.CLASSES,
          thicknessMode: ThicknessMode.CLASSES,
          classification: {
            method: ClassificationMethod.KMEANS,
            classes: 4,
            numClasses: 4,
            breaks: [10, 20, 30],
            colors: ['#fee5d9', '#fcae91', '#fb6a4a', '#de2d26']
          },
          thicknessClassification: undefined
        }
      } as VisualizationConfig
    });

    harness.controller.ensureLineThicknessClassificationDefaults(
      harness.visualization
    );

    expect(harness.lineThicknessClassificationUpdates).toEqual([
      {
        updates: {
          method: ClassificationMethod.KMEANS,
          classes: 5,
          numClasses: 5
        },
        options: undefined
      }
    ]);
  });

  it('auto-selects a numeric value column for symbol fill classes without reusing size/category fields', () => {
    const harness = createHarness({
      visualization: {
        ...createVisualization(),
        symbol: {
          ...createVisualization().symbol,
          fillMode: FillMode.CLASSES,
          fillValueColumn: undefined,
          sizeColumn: 'population',
          categoryColumn: 'region'
        }
      } as VisualizationConfig,
      dataFields: [
        { id: 0, text: 'id', type: 'number' },
        { id: 1, text: '__id', type: 'number' },
        { id: 2, text: 'region', type: 'text' },
        { id: 3, text: 'population', type: 'number' },
        { id: 4, text: 'income', type: 'number' }
      ]
    });

    harness.controller.ensureSymbolFillAutoColumns(harness.visualization);

    expect(harness.visualizationUpdates[0]).toMatchObject({
      symbol: {
        fillValueColumn: 'income'
      }
    });
  });

  it('auto-selects a numeric value column for polygon class mapping without reusing id/category fields', () => {
    const harness = createHarness({
      dataFields: [
        { id: 0, text: 'id', type: 'number' },
        { id: 1, text: 'region', type: 'text' },
        { id: 2, text: 'population', type: 'number' }
      ]
    });

    harness.controller.ensureAutoColumns(
      PrimitiveFilterType.POLYGON,
      harness.visualization
    );

    expect(harness.visualizationUpdates[0]).toMatchObject({
      mapping: { valueColumn: 'population' },
      polygon: { valueColumn: 'population' }
    });
  });

  it('auto-selects a symbol value column when columns become available after initialization', () => {
    const dataFields: Array<{ id: number; text: string; type?: string }> = [];
    const harness = createHarness({
      visualization: {
        ...createVisualization(),
        symbol: {
          ...createVisualization().symbol,
          mode: SymbolMode.CLASSES,
          valueColumn: undefined
        }
      } as VisualizationConfig,
      dataFields
    });

    harness.controller.ensureAutoColumns(
      PrimitiveFilterType.POINT,
      harness.visualization
    );
    expect(harness.visualizationUpdates).toHaveLength(0);

    dataFields.push(
      { id: 0, text: 'code', type: 'text' },
      { id: 1, text: '2020', type: 'number' }
    );

    harness.controller.ensureAutoColumns(
      PrimitiveFilterType.POINT,
      harness.visualization
    );

    expect(harness.visualizationUpdates[0]).toMatchObject({
      symbol: { valueColumn: '2020' }
    });
  });

  it('preserves the next proportional symbol mode while auto-selecting the default size column', () => {
    const initialVisualization = {
      ...createVisualization(),
      symbol: {
        ...createVisualization().symbol,
        mode: SymbolMode.UNIQUE,
        sizeColumn: undefined,
        valueColumn: undefined,
        categoryColumn: 'region'
      }
    } as VisualizationConfig;
    const harness = createStaleAfterUpdateHarness({
      visualization: initialVisualization
    });
    const nextVisualization = {
      ...initialVisualization,
      symbol: {
        ...initialVisualization.symbol,
        mode: SymbolMode.PROPORTIONAL
      }
    } as VisualizationConfig;

    harness.controller.ensureAutoColumns(
      PrimitiveFilterType.POINT,
      nextVisualization
    );

    expect(harness.visualization.symbol).toMatchObject({
      mode: SymbolMode.PROPORTIONAL,
      sizeColumn: 'population'
    });
    expect(harness.visualization.mapping).toMatchObject({
      sizeColumn: 'population'
    });
  });

  it('auto-selects a numeric value column for line classes without reusing category and size fields', () => {
    const harness = createHarness({
      visualization: {
        ...createVisualization(),
        line: {
          ...createVisualization().line,
          enabled: true,
          colorMode: ColorMode.UNIQUE,
          thicknessMode: ThicknessMode.CLASSES,
          valueColumn: undefined,
          categoryColumn: 'region',
          sizeColumn: 'population'
        }
      } as VisualizationConfig,
      dataFields: [
        { id: 0, text: 'id', type: 'number' },
        { id: 1, text: 'region', type: 'text' },
        { id: 2, text: 'population', type: 'number' },
        { id: 3, text: 'income', type: 'number' }
      ]
    });

    harness.controller.ensureAutoColumns(
      PrimitiveFilterType.LINE,
      harness.visualization
    );

    expect(harness.visualizationUpdates[0]).toMatchObject({
      mapping: { valueColumn: 'income' },
      line: { valueColumn: 'income' }
    });
  });

  it('falls back to a visible id column for line classes when no semantic numeric field exists', () => {
    const harness = createHarness({
      visualization: {
        ...createVisualization(),
        line: {
          ...createVisualization().line,
          enabled: true,
          colorMode: ColorMode.CLASSES,
          thicknessMode: ThicknessMode.UNIQUE,
          valueColumn: undefined,
          categoryColumn: 'region',
          sizeColumn: undefined
        }
      } as VisualizationConfig,
      dataFields: [
        { id: 0, text: '__id', type: 'number' },
        { id: 1, text: 'id', type: 'number' },
        { id: 2, text: 'region', type: 'text' }
      ]
    });

    harness.controller.ensureAutoColumns(
      PrimitiveFilterType.LINE,
      harness.visualization
    );

    expect(harness.visualizationUpdates[0]).toMatchObject({
      mapping: { valueColumn: 'id' },
      line: { valueColumn: 'id' }
    });
  });

  it('skips coordinate-like text fields when auto-selecting a line category column', () => {
    const harness = createHarness({
      visualization: {
        ...createVisualization(),
        line: {
          ...createVisualization().line,
          enabled: true,
          colorMode: ColorMode.CATEGORIES,
          thicknessMode: ThicknessMode.UNIQUE,
          categoryColumn: undefined,
          valueColumn: undefined
        }
      } as VisualizationConfig,
      dataFields: [
        { id: 0, text: 'geo_point_2d', type: 'text' },
        { id: 1, text: 'gml_id', type: 'text' },
        { id: 2, text: 'li_type', type: 'text' }
      ]
    });

    harness.controller.ensureAutoColumns(
      PrimitiveFilterType.LINE,
      harness.visualization
    );

    expect(harness.visualizationUpdates[0]).toMatchObject({
      mapping: { categoryColumn: 'li_type' },
      line: { categoryColumn: 'li_type' }
    });
  });

  it('preserves the next proportional line mode while auto-selecting the default size column', () => {
    const initialVisualization = {
      ...createVisualization(),
      line: {
        ...createVisualization().line,
        enabled: true,
        colorMode: ColorMode.UNIQUE,
        thicknessMode: ThicknessMode.UNIQUE,
        valueColumn: undefined,
        sizeColumn: undefined,
        categoryColumn: 'region'
      }
    } as VisualizationConfig;
    const harness = createStaleAfterUpdateHarness({
      visualization: initialVisualization
    });
    const nextVisualization = {
      ...initialVisualization,
      line: {
        ...initialVisualization.line,
        thicknessMode: ThicknessMode.PROPORTIONAL
      }
    } as VisualizationConfig;

    harness.controller.ensureAutoColumns(
      PrimitiveFilterType.LINE,
      nextVisualization
    );

    expect(harness.visualization.line).toMatchObject({
      thicknessMode: ThicknessMode.PROPORTIONAL,
      sizeColumn: 'population'
    });
    expect(harness.visualization.mapping).toMatchObject({
      sizeColumn: 'population'
    });
  });

  it('falls back to a visible id column for proportional line sizing when no other numeric field exists', () => {
    const initialVisualization = {
      ...createVisualization(),
      line: {
        ...createVisualization().line,
        enabled: true,
        colorMode: ColorMode.UNIQUE,
        thicknessMode: ThicknessMode.UNIQUE,
        valueColumn: undefined,
        sizeColumn: undefined,
        categoryColumn: 'region'
      }
    } as VisualizationConfig;
    const harness = createStaleAfterUpdateHarness({
      visualization: initialVisualization,
      dataFields: [
        { id: 0, text: '__id', type: 'number' },
        { id: 1, text: 'id', type: 'number' },
        { id: 2, text: 'region', type: 'text' }
      ]
    });
    const nextVisualization = {
      ...initialVisualization,
      line: {
        ...initialVisualization.line,
        thicknessMode: ThicknessMode.PROPORTIONAL
      }
    } as VisualizationConfig;

    harness.controller.ensureAutoColumns(
      PrimitiveFilterType.LINE,
      nextVisualization
    );

    expect(harness.visualization.line).toMatchObject({
      thicknessMode: ThicknessMode.PROPORTIONAL,
      sizeColumn: 'id'
    });
    expect(harness.visualization.mapping).toMatchObject({
      sizeColumn: 'id'
    });
  });

  it('preserves the next symbol fill mode while initializing categorical fill defaults', () => {
    const initialVisualization = {
      ...createVisualization(),
      symbol: {
        ...createVisualization().symbol,
        fillMode: FillMode.UNIQUE,
        fillClassification: undefined
      }
    } as VisualizationConfig;
    const harness = createStaleAfterUpdateHarness({
      visualization: initialVisualization
    });
    const nextVisualization = {
      ...initialVisualization,
      symbol: {
        ...initialVisualization.symbol,
        fillMode: FillMode.CATEGORIES,
        fillClassification: undefined
      }
    } as VisualizationConfig;

    harness.controller.ensureSymbolFillClassificationDefaults(
      nextVisualization
    );

    expect(harness.visualization.symbol).toMatchObject({
      fillMode: FillMode.CATEGORIES,
      fillClassification: {
        colors: expect.any(Array),
        labels: []
      }
    });
  });

  it('preserves the next polygon stroke mode while auto-selecting the default stroke value column', () => {
    const initialVisualization = {
      ...createVisualization(),
      polygon: {
        ...createVisualization().polygon,
        strokeMode: StrokeMode.UNIQUE,
        strokeValueColumn: undefined
      }
    } as VisualizationConfig;
    const harness = createStaleAfterUpdateHarness({
      visualization: initialVisualization
    });
    const nextVisualization = {
      ...initialVisualization,
      polygon: {
        ...initialVisualization.polygon,
        strokeMode: StrokeMode.CLASSES,
        strokeValueColumn: undefined
      }
    } as VisualizationConfig;

    harness.controller.ensurePrimitiveStrokeAutoColumns(
      PrimitiveFilterType.POLYGON,
      nextVisualization
    );

    expect(harness.visualization.polygon).toMatchObject({
      strokeMode: StrokeMode.CLASSES,
      strokeValueColumn: 'id'
    });
  });

  it('routes text background classification updates through the text primitive with default classification fields', () => {
    const harness = createHarness();

    harness.controller.updateTextBackgroundClassificationState({
      colors: ['#111111']
    });

    expect(harness.textPrimitiveUpdates[0]).toMatchObject({
      background: {
        classification: {
          method: ClassificationMethod.KMEANS,
          classes: 5,
          colors: ['#111111']
        }
      }
    });
  });
});
