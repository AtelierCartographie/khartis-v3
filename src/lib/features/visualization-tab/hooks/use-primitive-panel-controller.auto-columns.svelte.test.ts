import { describe, expect, it, vi } from 'vitest';
import type { VisualizationConfig } from '$lib/features/commons/stores/visualization.store.svelte';
import {
  FillMode,
  StrokeMode,
  SymbolMode
} from '$lib/features/commons/constants/visualization.constants';

const POINT = 'point';
const KMEANS = 'kmeans';

class WorkerStub {
  postMessage() {}

  terminate() {}

  addEventListener() {}

  removeEventListener() {}
}

function createVisualization(): VisualizationConfig {
  return {
    id: 'viz-1',
    datasetId: 'dataset-1',
    enabled: true,
    name: 'Visualization',
    type: 'symbols',
    mapping: { categoryColumn: 'region' },
    modes: {},
    style: {},
    primitiveFilters: [POINT],
    symbol: {
      enabled: true,
      mode: SymbolMode.UNIQUE,
      fillMode: FillMode.UNIQUE,
      strokeMode: StrokeMode.UNIQUE,
      strokeWidth: 1,
      strokeOpacity: 1,
      strokeDashed: false,
      categoryColumn: 'region',
      sizeColumn: undefined,
      valueColumn: undefined,
      size: 10,
      minSize: 5,
      maxSize: 20,
      sizeScale: 1,
      opacity: 0.8,
      shape: 'circle',
      proportionalType: 'uniques',
      categoryShape: 'unique',
      classification: {
        method: KMEANS,
        classes: 5
      }
    }
  } as unknown as VisualizationConfig;
}

describe('usePrimitivePanelController auto columns', () => {
  it('auto-selects a size column when symbols switch to proportional mode', async () => {
    vi.stubGlobal('Worker', WorkerStub);
    const { usePrimitivePanelController } =
      await import('./use-primitive-panel-controller.svelte');
    const { PrimitiveFilterType } =
      await import('$lib/features/commons/stores/visualization.store.svelte');
    let visualization = createVisualization();
    const controller = usePrimitivePanelController({
      getDataFields: () => [
        { id: 0, text: 'id', type: 'number' },
        { id: 1, text: 'region', type: 'text' },
        { id: 2, text: 'population', type: 'number' }
      ],
      getVisualization: () => visualization,
      updatePrimitiveClassification: () => {},
      updateLineThicknessClassification: () => {},
      updatePrimitiveStrokeClassification: () => {},
      updateTextPrimitive: () => {},
      updateVisualization: (updates, afterUpdate) => {
        visualization = {
          ...visualization,
          ...updates
        } as VisualizationConfig;
        afterUpdate?.(visualization);
      }
    });
    const nextVisualization = {
      ...visualization,
      symbol: {
        ...visualization.symbol,
        mode: SymbolMode.PROPORTIONAL
      }
    } as VisualizationConfig;

    controller.ensureAutoColumns(PrimitiveFilterType.POINT, nextVisualization);

    expect(visualization.symbol).toMatchObject({
      mode: SymbolMode.PROPORTIONAL,
      sizeColumn: 'population'
    });
    expect(visualization.mapping).toMatchObject({
      sizeColumn: 'population'
    });
  }, 10000);

  it('prefers the latest numeric year column for proportional symbol sizing', async () => {
    vi.stubGlobal('Worker', WorkerStub);
    const { usePrimitivePanelController } =
      await import('./use-primitive-panel-controller.svelte');
    const { PrimitiveFilterType } =
      await import('$lib/features/commons/stores/visualization.store.svelte');
    let visualization = createVisualization();
    const controller = usePrimitivePanelController({
      getDataFields: () => [
        { id: 0, text: 'country_code', type: 'text' },
        { id: 1, text: '_1960', type: 'number' },
        { id: 2, text: '_1980', type: 'number' },
        { id: 3, text: '_2000', type: 'number' },
        { id: 4, text: '_2020', type: 'number' }
      ],
      getVisualization: () => visualization,
      updatePrimitiveClassification: () => {},
      updateLineThicknessClassification: () => {},
      updatePrimitiveStrokeClassification: () => {},
      updateTextPrimitive: () => {},
      updateVisualization: (updates, afterUpdate) => {
        visualization = {
          ...visualization,
          ...updates
        } as VisualizationConfig;
        afterUpdate?.(visualization);
      }
    });
    const nextVisualization = {
      ...visualization,
      symbol: {
        ...visualization.symbol,
        mode: SymbolMode.PROPORTIONAL,
        categoryColumn: 'country_code'
      }
    } as VisualizationConfig;

    controller.ensureAutoColumns(PrimitiveFilterType.POINT, nextVisualization);

    expect(visualization.symbol).toMatchObject({
      sizeColumn: '_2020'
    });
    expect(visualization.mapping).toMatchObject({
      sizeColumn: '_2020'
    });
  }, 10000);

  it('inverts primitive classification palettes through the shared helper', async () => {
    vi.stubGlobal('Worker', WorkerStub);
    const { usePrimitivePanelController } =
      await import('./use-primitive-panel-controller.svelte');
    const { PrimitiveFilterType } =
      await import('$lib/features/commons/stores/visualization.store.svelte');
    const baseVisualization = createVisualization();
    const visualization = {
      ...baseVisualization,
      symbol: {
        ...baseVisualization.symbol,
        classification: {
          method: KMEANS,
          classes: 5,
          colors: ['#111111', '#222222'],
          inverted: false
        }
      }
    } as unknown as VisualizationConfig;
    const updatePrimitiveClassification = vi.fn();
    const controller = usePrimitivePanelController({
      getDataFields: () => [],
      getVisualization: () => visualization,
      updatePrimitiveClassification,
      updateLineThicknessClassification: () => {},
      updatePrimitiveStrokeClassification: () => {},
      updateTextPrimitive: () => {},
      updateVisualization: () => {}
    });

    controller.invertPrimitivePalette(PrimitiveFilterType.POINT);

    expect(updatePrimitiveClassification).toHaveBeenCalledWith(
      PrimitiveFilterType.POINT,
      {
        colors: ['#222222', '#111111'],
        inverted: true
      }
    );
  }, 10000);

  it('includes text when rebuilding primitive filters from enabled states', async () => {
    vi.stubGlobal('Worker', WorkerStub);
    const { usePrimitivePanelController } =
      await import('./use-primitive-panel-controller.svelte');
    const { PrimitiveFilterType } =
      await import('$lib/features/commons/stores/visualization.store.svelte');
    const visualization = {
      ...createVisualization(),
      symbol: {
        ...createVisualization().symbol,
        enabled: false
      },
      text: {
        enabled: true
      }
    } as unknown as VisualizationConfig;
    const controller = usePrimitivePanelController({
      getDataFields: () => [],
      getVisualization: () => visualization,
      updatePrimitiveClassification: () => {},
      updateLineThicknessClassification: () => {},
      updatePrimitiveStrokeClassification: () => {},
      updateTextPrimitive: () => {},
      updateVisualization: () => {}
    });

    expect(
      controller.buildNextPrimitiveFilters({
        [PrimitiveFilterType.POINT]: false
      })
    ).toEqual([PrimitiveFilterType.TEXT]);
  }, 10000);

  it('seeds polygon break defaults through the shared defaults helper', async () => {
    vi.stubGlobal('Worker', WorkerStub);
    const { usePrimitivePanelController } =
      await import('./use-primitive-panel-controller.svelte');
    const { PrimitiveFilterType } =
      await import('$lib/features/commons/stores/visualization.store.svelte');
    const visualization = {
      ...createVisualization(),
      primitiveFilters: [PrimitiveFilterType.POLYGON],
      polygon: {
        enabled: true,
        fillMode: FillMode.CLASSES,
        classification: {}
      }
    } as unknown as VisualizationConfig;
    const updatePrimitiveClassification = vi.fn();
    const controller = usePrimitivePanelController({
      getDataFields: () => [],
      getVisualization: () => visualization,
      updatePrimitiveClassification,
      updateLineThicknessClassification: () => {},
      updatePrimitiveStrokeClassification: () => {},
      updateTextPrimitive: () => {},
      updateVisualization: () => {}
    });

    controller.ensurePrimitiveClassificationDefaults(
      PrimitiveFilterType.POLYGON,
      visualization
    );

    expect(updatePrimitiveClassification).toHaveBeenCalledWith(
      PrimitiveFilterType.POLYGON,
      {
        method: KMEANS,
        classes: 4,
        numClasses: 4
      },
      { preserveOrigin: true }
    );
  }, 10000);

  it('seeds categorical colors and labels through the shared defaults helper', async () => {
    vi.stubGlobal('Worker', WorkerStub);
    const { usePrimitivePanelController } =
      await import('./use-primitive-panel-controller.svelte');
    const { PrimitiveFilterType } =
      await import('$lib/features/commons/stores/visualization.store.svelte');
    const baseVisualization = createVisualization();
    const visualization = {
      ...baseVisualization,
      symbol: {
        ...baseVisualization.symbol,
        mode: SymbolMode.CATEGORIES,
        classification: {
          method: KMEANS,
          classes: 5
        }
      }
    } as unknown as VisualizationConfig;
    const updatePrimitiveClassification = vi.fn();
    const controller = usePrimitivePanelController({
      getDataFields: () => [],
      getVisualization: () => visualization,
      updatePrimitiveClassification,
      updateLineThicknessClassification: () => {},
      updatePrimitiveStrokeClassification: () => {},
      updateTextPrimitive: () => {},
      updateVisualization: () => {}
    });

    controller.ensurePrimitiveClassificationDefaults(
      PrimitiveFilterType.POINT,
      visualization
    );

    expect(updatePrimitiveClassification).toHaveBeenCalledWith(
      PrimitiveFilterType.POINT,
      expect.objectContaining({
        colors: expect.any(Array),
        inverted: false,
        labels: []
      }),
      { preserveOrigin: true }
    );
  }, 10000);

  it('auto-selects symbol fill value columns through the shared helper', async () => {
    vi.stubGlobal('Worker', WorkerStub);
    const { usePrimitivePanelController } =
      await import('./use-primitive-panel-controller.svelte');
    const baseVisualization = createVisualization();
    const origin = {
      mode: 'manual-suggestion',
      suggestionKey:
        'symbols_proportional_colorful_QTR::2::pop|income::polygon::QTA|QTR'
    } as const;
    let visualization = {
      ...baseVisualization,
      origin,
      symbol: {
        ...baseVisualization.symbol,
        valueColumn: undefined,
        fillMode: FillMode.CLASSES,
        fillValueColumn: undefined
      }
    } as unknown as VisualizationConfig;
    const updatesLog: Array<Partial<VisualizationConfig>> = [];
    const controller = usePrimitivePanelController({
      getDataFields: () => [
        { id: 0, text: 'region', type: 'text' },
        { id: 1, text: 'population', type: 'number' }
      ],
      getVisualization: () => visualization,
      updatePrimitiveClassification: () => {},
      updateLineThicknessClassification: () => {},
      updatePrimitiveStrokeClassification: () => {},
      updateTextPrimitive: () => {},
      updateVisualization: (updates, afterUpdate) => {
        updatesLog.push(updates);
        visualization = {
          ...visualization,
          ...updates
        } as VisualizationConfig;
        afterUpdate?.(visualization);
      }
    });

    controller.ensureSymbolFillAutoColumns(visualization);

    expect(visualization.symbol).toMatchObject({
      fillValueColumn: 'population'
    });
    expect(updatesLog[0]).toMatchObject({ origin });
  }, 10000);

  it('preserves origin when seeding stroke classification defaults', async () => {
    vi.stubGlobal('Worker', WorkerStub);
    const { usePrimitivePanelController } =
      await import('./use-primitive-panel-controller.svelte');
    const { PrimitiveFilterType } =
      await import('$lib/features/commons/stores/visualization.store.svelte');
    const visualization = {
      ...createVisualization(),
      primitiveFilters: [PrimitiveFilterType.POLYGON],
      polygon: {
        enabled: true,
        strokeMode: StrokeMode.CLASSES,
        strokeClassification: {}
      }
    } as unknown as VisualizationConfig;
    const updatePrimitiveStrokeClassification = vi.fn();
    const controller = usePrimitivePanelController({
      getDataFields: () => [],
      getVisualization: () => visualization,
      updatePrimitiveClassification: () => {},
      updateLineThicknessClassification: () => {},
      updatePrimitiveStrokeClassification,
      updateTextPrimitive: () => {},
      updateVisualization: () => {}
    });

    controller.ensurePrimitiveStrokeClassificationDefaults(
      PrimitiveFilterType.POLYGON,
      visualization
    );

    expect(updatePrimitiveStrokeClassification).toHaveBeenCalledWith(
      PrimitiveFilterType.POLYGON,
      {
        method: KMEANS,
        classes: 5,
        numClasses: 5
      },
      { preserveOrigin: true }
    );
  }, 10000);
});
