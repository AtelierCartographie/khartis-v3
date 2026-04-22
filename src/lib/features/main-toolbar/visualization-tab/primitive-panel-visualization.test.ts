import { describe, expect, it } from 'vitest';
import {
  PrimitiveFilterType,
  type VisualizationConfig
} from '$lib/features/commons/store/visualization.store.svelte';
import { FillMode, StrokeMode, SymbolMode } from '../constants';
import {
  buildLinePanelVisualization,
  buildPolygonPanelVisualization,
  buildSymbolPanelVisualization,
  buildTextBackgroundPanelVisualization,
  buildTextPanelVisualization
} from './primitive-panel-visualization';

function createVisualization(): VisualizationConfig {
  return {
    id: 'viz-1',
    datasetId: 'dataset-1',
    enabled: true,
    name: 'Visualization',
    type: 'choropleth',
    mapping: {},
    modes: {},
    style: {},
    primitiveFilters: [
      PrimitiveFilterType.POINT,
      PrimitiveFilterType.LINE,
      PrimitiveFilterType.POLYGON,
      PrimitiveFilterType.TEXT
    ],
    polygon: {
      enabled: true,
      fillMode: FillMode.CLASSES,
      fillColor: '#112233',
      fillOpacity: 0.75,
      strokeMode: StrokeMode.CATEGORIES,
      strokeColor: ['#445566'],
      strokeWidth: 2,
      strokeOpacity: 0.6,
      strokeDashed: true,
      valueColumn: 'population',
      categoryColumn: 'region',
      classification: { method: 'jenks', numClasses: 5, classes: 5 },
      missingData: { show: true, color: '#cccccc' }
    },
    symbol: {
      enabled: true,
      mode: SymbolMode.CLASSES,
      fillMode: FillMode.CATEGORIES,
      strokeMode: StrokeMode.CLASSES,
      fillColor: '#778899',
      fillColorB: '#abcdef',
      strokeColor: ['#123456'],
      strokeWidth: 3,
      strokeOpacity: 0.5,
      strokeDashed: true,
      valueColumn: 'amount',
      categoryColumn: 'group',
      sizeColumn: 'size_col',
      size: 11,
      minSize: 2,
      maxSize: 18,
      sizeScale: 1,
      opacity: 0.4,
      shape: 'square',
      proportionalType: 'single',
      categoryShape: 'unique',
      classification: { labels: ['A', 'B'] },
      missingData: { show: false, color: '#ff00ff' }
    },
    line: {
      enabled: true,
      colorMode: 'categories',
      thicknessMode: 'classes',
      color: '#00ff00',
      opacity: 0.7,
      width: 2,
      maxWidth: 9,
      dashed: true,
      valueColumn: 'flow',
      categoryColumn: 'type',
      sizeColumn: 'size_flow',
      classification: { labels: ['Road', 'Rail'] },
      missingData: { show: true, color: '#999999' }
    },
    text: {
      enabled: true,
      colorMode: 'classes',
      sizeMode: 'fixed',
      color: '#101010',
      opacity: 0.8,
      size: 14,
      bold: true,
      italic: false,
      align: 'center',
      halo: true,
      haloColor: '#ffffff',
      haloWidth: 2,
      collisionDetection: true,
      dxpMasking: false,
      labelColumn: 'label',
      valueColumn: 'text_value',
      categoryColumn: 'text_category',
      classification: { labels: ['North'] },
      secondaryLabels: {
        enabled: true,
        labelColumn: 'label_secondary',
        color: '#202020',
        opacity: 0.6,
        size: 11,
        align: 'right',
        halo: false,
        haloColor: '#eeeeee',
        haloWidth: 1,
        collisionDetection: false,
        dxpMasking: true
      },
      background: {
        fillMode: FillMode.CLASSES,
        fillColor: '#f0f0f0',
        fillOpacity: 0.3,
        strokeMode: StrokeMode.CATEGORIES,
        strokeColor: ['#0f0f0f'],
        strokeWidth: 1,
        strokeOpacity: 0.9,
        strokeDashed: false,
        valueColumn: 'bg_value',
        categoryColumn: 'bg_category',
        classification: { labels: ['Label'] },
        strokeClassification: { labels: ['Outline'] },
        strokeValueColumn: 'bg_stroke_value',
        strokeCategoryColumn: 'bg_stroke_category'
      },
      missingData: { show: true, color: '#333333' }
    },
    classification: undefined
  } as unknown as VisualizationConfig;
}

describe('primitive-panel-visualization', () => {
  it('flattens polygon state into the generic panel contract', () => {
    const visualization = buildPolygonPanelVisualization(createVisualization());
    expect(visualization?.modes?.fill).toBe(FillMode.CLASSES);
    expect(visualization?.modes?.stroke).toBe(StrokeMode.CATEGORIES);
    expect(visualization?.style?.fillColor).toBe('#112233');
    expect(visualization?.mapping?.valueColumn).toBe('population');
    expect(visualization?.classification).toEqual(
      createVisualization().polygon?.classification
    );
  });

  it('flattens symbol state while preserving symbol-specific mapping and style', () => {
    const visualization = buildSymbolPanelVisualization(createVisualization());
    expect(visualization?.modes?.symbol).toBe(SymbolMode.CLASSES);
    expect(visualization?.modes?.fill).toBe(FillMode.CATEGORIES);
    expect(visualization?.style?.symbolFillColor).toBe('#778899');
    expect(visualization?.mapping?.sizeColumn).toBe('size_col');
    expect(visualization?.symbols?.type).toBe('square');
    expect(visualization?.symbols?.opacity).toBe(0.4);
  });

  it('flattens line state into shared color/thickness slots', () => {
    const visualization = buildLinePanelVisualization(createVisualization());
    expect(visualization?.modes?.color).toBe('categories');
    expect(visualization?.modes?.thickness).toBe('classes');
    expect(visualization?.style?.lineColor).toBe('#00ff00');
    expect(visualization?.mapping?.categoryColumn).toBe('type');
  });

  it('flattens text label state independently from background state', () => {
    const visualization = buildTextPanelVisualization(createVisualization());
    expect(visualization?.style?.textColor).toBe('#101010');
    expect(visualization?.style?.labelColor).toBe('#202020');
    expect(visualization?.mapping?.labelColumn).toBe('label');
    expect(visualization?.mapping?.secondaryLabelColumn).toBe(
      'label_secondary'
    );
  });

  it('derives text background from text.background instead of polygon fields', () => {
    const visualization = buildTextBackgroundPanelVisualization(
      createVisualization()
    );
    expect(visualization?.style?.fillColor).toBe('#f0f0f0');
    expect(visualization?.modes?.fill).toBe(FillMode.CLASSES);
    expect(visualization?.mapping?.valueColumn).toBe('bg_value');
    expect(visualization?.classification).toEqual(
      createVisualization().text?.background.classification
    );
  });
});
