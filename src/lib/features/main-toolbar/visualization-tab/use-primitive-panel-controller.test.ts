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
        method: ClassificationMethod.JENKS,
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
      size: 10,
      minSize: 5,
      maxSize: 20,
      sizeScale: 1,
      opacity: 0.8,
      shape: 'circle',
      proportionalType: 'uniques',
      categoryShape: 'unique',
      classification: {
        method: ClassificationMethod.JENKS,
        classes: 5,
        labels: ['Old']
      },
      strokeClassification: {
        method: ClassificationMethod.JENKS,
        classes: 5,
        labels: ['Stroke']
      }
    },
    symbolClassification: {
      method: ClassificationMethod.JENKS,
      classes: 5,
      labels: ['Root']
    },
    line: {
      enabled: false,
      colorMode: ColorMode.UNIQUE,
      thicknessMode: ThicknessMode.NONE,
      opacity: 1,
      width: 1,
      maxWidth: 4,
      dashed: false
    },
    text: {
      enabled: true,
      colorMode: ColorMode.UNIQUE,
      sizeMode: 'fixed',
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
        color: '#000000',
        opacity: 1,
        size: 10,
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
      strokeClassification: {
        labels: undefined,
        disabledLabels: undefined
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

  it('routes text background classification updates through the text primitive with default classification fields', () => {
    const harness = createHarness();

    harness.controller.updateTextBackgroundClassificationState({
      colors: ['#111111']
    });

    expect(harness.textPrimitiveUpdates[0]).toMatchObject({
      background: {
        classification: {
          method: ClassificationMethod.JENKS,
          classes: 5,
          colors: ['#111111']
        }
      }
    });
  });
});
