import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from '@testing-library/svelte';
import Textbox from '@borgar/textbox';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';
import {
  CategoryShapeMode,
  ColorMode,
  FillMode,
  MissingDataShape,
  ProportionalType,
  SizeMode,
  ShapeType,
  StrokeMode,
  SymbolDoublePosition,
  SymbolMode,
  ThicknessMode
} from '$lib/features/commons/constants/visualization.constants';
import {
  globalActions,
  globalState
} from '$lib/features/commons/stores/global.svelte';
import { StylingTools, ToolbarStep } from '$lib/features/commons/types/global';
import {
  ClassificationMethod,
  type VisualizationConfig
} from '$lib/features/commons/stores/visualization.store.svelte';
import { formatActions } from '$lib/features/step-toolbar/tools/format/format.store.svelte';
import { DRAGGING_STYLING_TARGET_BODY_CLASS } from '../utils/tool-popover-drag-visibility.utils';

const mockRowScopeStore = vi.hoisted(() => ({
  getScopedDomain: vi.fn((): { min: number; max: number } | null => null)
}));

vi.mock('../stores/row-scope.store.svelte', () => ({
  rowScopeStore: mockRowScopeStore
}));

const { mockVisualizationStore, mockDatasetsStore } = vi.hoisted(() => ({
  mockVisualizationStore: {
    version: 0,
    visualizations: [] as VisualizationConfig[]
  },
  mockDatasetsStore: {
    getColumnStatistics: (columnName?: string) => {
      switch (columnName) {
        case 'population':
          return { min: 30_359, max: 15_907_951 };
        case 'secondary-population':
          return { min: 22_120, max: 9_431_204 };
        default:
          return null;
      }
    },
    getColumnValues: (columnName?: string) => {
      switch (columnName) {
        case 'population':
          return [30_359, 8_200_000, 15_907_951];
        case 'secondary-population':
          return [22_120, 4_500_000, 9_431_204];
        default:
          return [];
      }
    }
  }
}));

vi.mock(
  '$lib/features/commons/stores/visualization.store.svelte',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('$lib/features/commons/stores/visualization.store.svelte')
      >();

    return {
      ...actual,
      visualizationStore: mockVisualizationStore
    };
  }
);

vi.mock('$lib/features/commons/stores/datasets.store.svelte', () => ({
  datasetsStore: {
    getColumnStatistics: (_datasetId: string, columnName?: string) =>
      mockDatasetsStore.getColumnStatistics(columnName),
    getColumnValues: (_datasetId: string, columnName?: string) =>
      mockDatasetsStore.getColumnValues(columnName)
  }
}));

const motifMockState = vi.hoisted(() => ({ counter: 0 }));
vi.mock('@ateliercartographie/motif.js', () => ({
  motif: () => {
    const id = `mock-motif-${++motifMockState.counter}`;
    return {
      defs: {
        outerHTML: `<defs><pattern id="${id}"></pattern></defs>`
      },
      url: `url(#${id})`,
      tile: () => ({
        toDataURL: () => 'data:image/png;base64,AAAA'
      })
    };
  },
  motifAtlas: () => ({
    canvas: {},
    mapping: {}
  })
}));

import { legendActions } from '$lib/features/step-toolbar/tools/legend/legend.store.svelte';
import { getLegendState } from '$lib/features/step-toolbar/tools/legend/legend.store.svelte';
import LegendOverlay from './legend-overlay.svelte';
import { MAX_LEGEND_CATEGORIES } from '$lib/features/commons/components/legend';
import { m } from '$lib/paraglide/messages';
import { LEGEND_DEFAULTS } from '$lib/features/step-toolbar/tools/legend/legend.constants';

const measureCanvas = {
  getContext: () => ({
    font: '',
    measureText: (text: string) => ({ width: text.length * 7 })
  })
};

vi.hoisted(() => {
  class WorkerMock {
    postMessage(): void {}

    terminate(): void {}

    addEventListener(): void {}

    removeEventListener(): void {}
  }

  vi.stubGlobal('Worker', WorkerMock);
});

function createDomRect(
  left: number,
  top: number,
  width: number,
  height: number
): DOMRect {
  return {
    x: left,
    y: top,
    width,
    height,
    top,
    left,
    right: left + width,
    bottom: top + height,
    toJSON() {
      return this;
    }
  } as DOMRect;
}

function bindElementBox(
  element: HTMLElement,
  box: { left: number; top: number; width: number; height: number }
): void {
  Object.defineProperty(element, 'offsetWidth', {
    configurable: true,
    get: () => box.width
  });
  Object.defineProperty(element, 'offsetHeight', {
    configurable: true,
    get: () => box.height
  });
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => createDomRect(box.left, box.top, box.width, box.height)
  });
}

function setupLegendViewport(): {
  legend: HTMLDivElement;
  viewport: HTMLDivElement;
} {
  const viewport = document.createElement('div');
  viewport.className = 'workspace-viewport';
  document.body.appendChild(viewport);

  const { container } = render(LegendOverlay, {
    target: viewport
  });
  const legend = container.querySelector('.legend-container');

  if (!(legend instanceof HTMLDivElement)) {
    throw new Error('Legend was not rendered');
  }

  bindElementBox(viewport, {
    left: 0,
    top: 0,
    width: 400,
    height: 300
  });
  bindElementBox(legend, {
    left: 70,
    top: 60,
    width: 80,
    height: 60
  });

  return { legend, viewport };
}

function setupLegendOccludedViewport(): {
  legend: HTMLDivElement;
  popover: HTMLDivElement;
  toolbar: HTMLDivElement;
  viewport: HTMLDivElement;
} {
  const { legend, viewport } = setupLegendViewport();
  const toolbar = document.createElement('div');
  const popoverRoot = document.createElement('div');
  const popover = document.createElement('div');

  toolbar.id = 'khartis-step-toolbar';
  popoverRoot.id = 'khartis-tool-popover';
  popover.className = 'bx--popover';
  popoverRoot.appendChild(popover);

  document.body.appendChild(toolbar);
  document.body.appendChild(popoverRoot);

  bindElementBox(toolbar, {
    left: 0,
    top: 0,
    width: 80,
    height: 300
  });
  bindElementBox(popover, {
    left: 88,
    top: 20,
    width: 120,
    height: 200
  });

  return { legend, popover, toolbar, viewport };
}

// A wrapped legend label is split across tspans and carries the full string on
// aria-label instead, so match either form: jsdom has no canvas metrics and
// breaks lines differently from the browser.
function getFirstLegendItem() {
  const item = getLegendState().items[0];
  if (!item) {
    throw new Error('No legend item registered');
  }
  return item;
}

function getFirstLegendFramePosition() {
  return getFirstLegendItem().dragPosition ?? null;
}

function countLegendLabels(label: string): number {
  return Array.from(document.querySelectorAll('svg text')).filter(
    (node) =>
      (node.getAttribute('aria-label') ?? node.textContent ?? '').trim() ===
      label
  ).length;
}

describe('legend overlay visibility', () => {
  beforeAll(() => {
    Textbox.setMeasureCanvas(measureCanvas);
  });

  beforeEach(() => {
    cleanup();
    document.getElementById('khartis-step-toolbar')?.remove();
    document.getElementById('khartis-tool-popover')?.remove();
    mockVisualizationStore.version = 0;
    mockVisualizationStore.visualizations = [];
    mockRowScopeStore.getScopedDomain.mockReturnValue(null);
    legendActions.reset();
    formatActions.reset();
    globalActions.resetNavigationState();
    globalActions.setPageZoomScale(1);
    globalState.selectedStep = ToolbarStep.Styling;
    legendActions.setVisibility(true);
    legendActions.addLegendItem({
      name: 'Population',
      visible: true,
      title: 'Population',
      titleMode: 'custom',
      subtitle: '',
      subtitleMode: 'custom',
      note: '',
      variableId: undefined
    });
  });

  afterEach(() => {
    cleanup();
    document.getElementById('khartis-step-toolbar')?.remove();
    document.getElementById('khartis-tool-popover')?.remove();
    legendActions.reset();
    formatActions.reset();
    globalActions.resetNavigationState();
    globalActions.setPageZoomScale(1);
  });

  afterAll(() => {
    Textbox.setMeasureCanvas(null);
  });

  it('renders the legend content when visible', () => {
    render(LegendOverlay);

    expect(screen.getByText('Population')).toBeInTheDocument();
  });

  it('scales legend chrome with the rendered page size', () => {
    globalActions.setPageZoomScale(0.5);

    const { container } = render(LegendOverlay);
    const legend = container.querySelector('.legend-container');
    const style = legend?.getAttribute('style');

    expect(style).toContain('--legend-page-scale: 0.5');
    expect(style).toContain(`font-size: ${LEGEND_DEFAULTS.FONT_SIZE}px`);
    expect(style).toContain('transform: scale(0.5)');
    expect(style).toContain('transform-origin: top right');
  });

  it('routes font family, shell background, and compact padding into SVG legends', () => {
    mockVisualizationStore.version = 1;
    mockVisualizationStore.visualizations = [buildClassedPolygonViz()];
    legendActions.reset();
    legendActions.setVisibility(true);
    legendActions.updateStyle({
      fontFamily: 'Inter',
      textColor: { hue: 0, saturation: 0, lightness: 100 }
    });
    legendActions.updateBackground({
      enabled: true,
      color: { hue: 210, saturation: 10, lightness: 98 },
      opacity: 60
    });

    const { container } = render(LegendOverlay);
    const legend = container.querySelector('.legend-container');
    const quantitative = container.querySelector('.quantitative_legend');
    const quantitativeSvg = container.querySelector(
      '.legend-svg--quantitative'
    );
    const style = legend?.getAttribute('style');

    expect(style).toContain('background-color: rgba(249, 250, 250, 0.6)');
    expect(legend).toHaveStyle({ color: '#ffffff' });
    expect(style).toContain('--legend-padding-inline: 6px');
    expect(style).toContain('--legend-padding-block: 4px');
    expect(style).toContain('border-radius: 0px');
    expect(quantitativeSvg).toHaveAttribute('fill', 'currentColor');
    expect(quantitativeSvg).toHaveStyle({ color: '#ffffff' });
    expect(quantitative?.getAttribute('font-family')).toContain('Inter');
    expect(
      container.querySelector('.quantitative_legend > rect[fill="transparent"]')
    ).toBeInTheDocument();
    expect(
      container.querySelector('.quantitative_legend > rect[fill="white"]')
    ).not.toBeInTheDocument();
  });

  it('removes shell background padding when the legend tool disables the panel background', () => {
    mockVisualizationStore.version = 1;
    mockVisualizationStore.visualizations = [buildClassedPolygonViz()];
    legendActions.reset();
    legendActions.setVisibility(true);
    legendActions.updateBackground({ enabled: false });

    const { container } = render(LegendOverlay);
    const style = container
      .querySelector('.legend-container')
      ?.getAttribute('style');

    expect(style).toContain('background-color: transparent');
    expect(style).toContain('--legend-padding-inline: 0px');
    expect(style).toContain('--legend-padding-block: 0px');
    expect(style).toContain('border-radius: 0px');
  });

  it('keeps the legend mounted but hidden when requested', () => {
    const { container } = render(LegendOverlay, { hidden: true });

    expect(
      container.querySelector('.legend-overlay.hidden')
    ).toBeInTheDocument();
    expect(screen.getByText('Population')).toBeInTheDocument();
  });

  it('names both variables under a shared-scale double symbol legend', () => {
    mockVisualizationStore.version = 1;
    mockVisualizationStore.visualizations = [buildDoubleProportionalViz()];
    legendActions.reset();
    legendActions.setVisibility(true);

    const { container } = render(LegendOverlay);

    const doubleLegend = container.querySelector('.legend-svg--double-symbols');
    expect(doubleLegend).toBeInTheDocument();

    // One neutral graduated column for the shared scale, then a colour box per
    // variable so the reader can tell A from B.
    const symbols = doubleLegend?.querySelector('.symbols');
    expect(symbols?.getAttribute('fill')).toBe('none');
    expect(symbols?.getAttribute('stroke')).toBe('currentColor');
    const swatches = doubleLegend?.querySelectorAll('.sign_legend rect') ?? [];
    expect(swatches).toHaveLength(2);
    expect(swatches[0]?.getAttribute('fill')).toBe('#4585f5');
    expect(swatches[1]?.getAttribute('fill')).toBe('#ff812a');
    const swatchLabels = Array.from(
      doubleLegend?.querySelectorAll('.sign_legend text') ?? []
    ).map((node) => node.textContent);
    expect(swatchLabels).toEqual(['population', 'secondary-population']);
  });

  it('draws a single proportional symbol legend as bare outlines', () => {
    mockVisualizationStore.version = 1;
    mockVisualizationStore.visualizations = [buildSingleProportionalViz()];
    legendActions.reset();
    legendActions.setVisibility(true);

    const { container } = render(LegendOverlay);

    // Only the size carries meaning here, so the fill would just add noise.
    const symbols = container.querySelector('.legend-svg--symbols .symbols');
    expect(symbols?.getAttribute('fill')).toBe('none');
    expect(symbols?.getAttribute('stroke')).toBe('currentColor');
  });

  it('stacks one named symbol legend per variable on own-scale double symbols', () => {
    mockVisualizationStore.version = 1;
    mockVisualizationStore.visualizations = [
      buildOwnScaleDoubleProportionalViz()
    ];
    legendActions.reset();
    legendActions.setVisibility(true);

    const { container } = render(LegendOverlay);

    const legends = container.querySelectorAll('.legend-svg--symbols');
    expect(legends).toHaveLength(2);

    // Own scales cannot share a graduated column, so colour is what tells the
    // two variables apart and each legend names its own.
    expect(legends[0].querySelector('.symbols')?.getAttribute('fill')).toBe(
      '#4585f5'
    );
    expect(legends[1].querySelector('.symbols')?.getAttribute('fill')).toBe(
      '#ff812a'
    );
    const subtitles = Array.from(
      container.querySelectorAll('.legend-svg--symbols .subtitle text')
    ).map((node) => node.textContent);
    expect(subtitles).toEqual(['population', 'secondary-population']);
  });

  it('renders point categories in the legend and hides disabled categories', () => {
    mockVisualizationStore.version = 1;
    mockVisualizationStore.visualizations = [buildPointCategoriesViz()];
    legendActions.reset();
    legendActions.setVisibility(true);

    const { container } = render(LegendOverlay);

    expect(screen.getByText('Actif')).toBeInTheDocument();
    expect(screen.getByText('Dormant')).toBeInTheDocument();
    expect(screen.queryByText('Pause')).not.toBeInTheDocument();
    expect(
      container.querySelector('.legend-svg--categorical')
    ).toBeInTheDocument();
    expect(container.querySelectorAll('.categorical_legend path')).toHaveLength(
      2
    );
    expect(
      container.querySelector('.legend-color-scale')
    ).not.toBeInTheDocument();
  });

  it('renders every category of a high-cardinality legend', () => {
    const viz = buildPointCategoriesViz();
    const labels = Array.from(
      { length: 30 },
      (_, index) => `Category ${index + 1}`
    );
    if (viz.symbol?.classification) {
      viz.symbol.classification = {
        ...viz.symbol.classification,
        labels,
        categoryValues: labels,
        disabledLabels: [],
        colors: labels.map(
          (_, index) => `#${(index + 1).toString(16).padStart(6, '0')}`
        )
      };
    }
    mockVisualizationStore.version = 1;
    mockVisualizationStore.visualizations = [viz];
    legendActions.reset();
    legendActions.setVisibility(true);

    render(LegendOverlay);

    for (const label of labels) {
      expect(countLegendLabels(label)).toBe(1);
    }
  });

  it('collapses the tail of an absurd category count into a counted row', () => {
    const viz = buildPointCategoriesViz();
    const labels = Array.from(
      { length: MAX_LEGEND_CATEGORIES + 12 },
      (_, index) => `Category ${index + 1}`
    );
    if (viz.symbol?.classification) {
      viz.symbol.classification = {
        ...viz.symbol.classification,
        labels,
        categoryValues: labels,
        disabledLabels: [],
        colors: labels.map(
          (_, index) => `#${(index + 1).toString(16).padStart(6, '0')}`
        )
      };
    }
    mockVisualizationStore.version = 1;
    mockVisualizationStore.visualizations = [viz];
    legendActions.reset();
    legendActions.setVisibility(true);

    render(LegendOverlay);

    expect(countLegendLabels(`Category ${MAX_LEGEND_CATEGORIES}`)).toBe(1);
    expect(countLegendLabels(`Category ${MAX_LEGEND_CATEGORIES + 1}`)).toBe(0);
    expect(countLegendLabels(m.categories_hidden_count({ count: 12 }))).toBe(1);
  });

  it('renders categorical missing data as a compact footer', () => {
    const viz = buildPointCategoriesViz();
    viz.missingData = {
      show: true,
      shape: MissingDataShape.CIRCLE,
      size: 4,
      color: '#c6c6c6'
    };
    mockVisualizationStore.version = 1;
    mockVisualizationStore.visualizations = [viz];
    legendActions.reset();
    legendActions.setVisibility(true);

    const { container } = render(LegendOverlay);

    expect(
      container.querySelector('.legend-svg--categorical')
    ).toBeInTheDocument();
    expect(
      container.querySelector('.legend-svg--missing-data')
    ).not.toBeInTheDocument();
    expect(countLegendLabels('Absence de données')).toBe(1);
  });

  it('renders unique point symbols with the selected shape and configured size', () => {
    mockVisualizationStore.version = 1;
    mockVisualizationStore.visualizations = [buildUniquePointViz()];
    legendActions.reset();
    legendActions.setVisibility(true);

    const { container } = render(LegendOverlay);

    const symbolLegend = container.querySelector('.legend-svg--symbols');
    const triangle = Array.from(
      symbolLegend?.querySelectorAll('path') ?? []
    ).find((path) => path.getAttribute('d') === 'M0,-8L8,7H-8Z');

    expect(symbolLegend).toBeInTheDocument();
    expect(
      container.querySelector('.legend-svg--missing-data')
    ).not.toBeInTheDocument();
    expect(triangle).toBeInTheDocument();
    expect(triangle?.getAttribute('transform')).toContain('scale(1.5)');
    expect(screen.getByText('Symboles')).toBeInTheDocument();
    expect(countLegendLabels('Absence de données')).toBe(1);
  });

  it('renders point classed fill legends with the active fill value column and class count', () => {
    mockVisualizationStore.version = 1;
    mockVisualizationStore.visualizations = [buildPointClassedFillViz()];
    legendActions.reset();
    legendActions.setVisibility(true);

    const { container } = render(LegendOverlay);

    expect(
      container.querySelector('.legend-svg--categorical')
    ).toBeInTheDocument();
    expect(screen.getByText('capacity')).toBeInTheDocument();
    expect(screen.queryByText('category')).not.toBeInTheDocument();
    expect(screen.getByText('< 610')).toBeInTheDocument();
    expect(screen.getByText('610 – 980')).toBeInTheDocument();
    expect(screen.getByText('980 – 1 200')).toBeInTheDocument();
    expect(screen.getByText('≥ 1 200')).toBeInTheDocument();
  });

  it('keeps narrow decimal class labels distinct', () => {
    const viz = buildPointClassedFillViz();
    if (viz.symbol?.fillClassification) {
      viz.symbol.fillClassification = {
        ...viz.symbol.fillClassification,
        classes: 5,
        breaks: [0.184, 0.208, 0.232, 0.256]
      };
    }
    mockVisualizationStore.version = 1;
    mockVisualizationStore.visualizations = [viz];
    legendActions.reset();
    legendActions.setVisibility(true);

    render(LegendOverlay);

    expect(screen.getByText('< 0,18')).toBeInTheDocument();
    expect(screen.getByText('0,18 – 0,21')).toBeInTheDocument();
    expect(screen.getByText('0,21 – 0,23')).toBeInTheDocument();
    expect(screen.getByText('0,23 – 0,26')).toBeInTheDocument();
    expect(screen.getByText('≥ 0,26')).toBeInTheDocument();
  });

  it('renders classed choropleth colors with the integrated quantitative SVG legend', () => {
    mockVisualizationStore.version = 1;
    mockVisualizationStore.visualizations = [buildClassedPolygonViz()];
    legendActions.reset();
    legendActions.setVisibility(true);

    const { container } = render(LegendOverlay);

    expect(
      container.querySelector('.legend-svg--quantitative')
    ).toBeInTheDocument();
    expect(container.querySelector('.quantitative_legend')).toBeInTheDocument();
    expect(
      container.querySelectorAll('.quantitative_legend .box rect')
    ).toHaveLength(4);
    expect(
      container.querySelector('.legend-proportional-scale')
    ).not.toBeInTheDocument();
  });

  it('labels the classed choropleth scale with the rounded bounds', () => {
    const viz = buildClassedPolygonViz();
    const classification = {
      ...viz.classification,
      roundedMin: 30_000,
      roundedMax: 16_000_000
    } as VisualizationConfig['classification'];
    viz.classification = classification;
    if (viz.polygon) {
      viz.polygon.classification = classification;
    }

    mockVisualizationStore.version = 1;
    mockVisualizationStore.visualizations = [viz];
    legendActions.reset();
    legendActions.setVisibility(true);

    const { container } = render(LegendOverlay);

    const labels =
      container
        .querySelector('.quantitative_legend')
        ?.textContent?.replace(/\s/g, ' ') ?? '';

    expect(labels).toContain('30 000');
    expect(labels).toContain('16 000 000');
    expect(labels).not.toContain('15 907 951');
  });

  it('renders polygon classes on proportional visualizations when symbols are disabled', () => {
    mockVisualizationStore.version = 1;
    mockVisualizationStore.visualizations = [
      buildProportionalPolygonClassesOnlyViz()
    ];
    legendActions.reset();
    legendActions.setVisibility(true);

    const { container } = render(LegendOverlay);

    expect(
      container.querySelector('.legend-svg--quantitative')
    ).toBeInTheDocument();
    expect(container.querySelector('.quantitative_legend')).toBeInTheDocument();
    expect(
      container.querySelector('.legend-svg--symbols')
    ).not.toBeInTheDocument();
  });

  it('keeps polygon-only legend subtitles focused on active polygon columns', () => {
    const viz = buildProportionalPolygonClassesOnlyViz();
    viz.mapping = {
      ...viz.mapping,
      sizeColumn: 'area'
    };
    if (viz.symbol) {
      viz.symbol = {
        ...viz.symbol,
        sizeColumn: 'area'
      };
    }
    mockVisualizationStore.version = 1;
    mockVisualizationStore.visualizations = [viz];
    legendActions.reset();
    legendActions.setVisibility(true);

    const { container } = render(LegendOverlay);
    const subtitle = container.querySelector(
      '.quantitative_legend .subtitle'
    )?.textContent;

    expect(subtitle).toContain('population');
    expect(subtitle).not.toContain('area');
  });

  it('renders density legends through the common SVG component', () => {
    mockVisualizationStore.version = 1;
    mockVisualizationStore.visualizations = [buildDensityPolygonViz()];
    legendActions.reset();
    legendActions.setVisibility(true);

    const { container } = render(LegendOverlay);

    expect(container.querySelector('.legend-svg--density')).toBeInTheDocument();
    expect(
      container.querySelector('.khartis_density_legend')
    ).toBeInTheDocument();
  });

  it('renders patterned categorical legends without HTML swatches', () => {
    mockVisualizationStore.version = 1;
    mockVisualizationStore.visualizations = [buildPatternedPolygonViz()];
    legendActions.reset();
    legendActions.setVisibility(true);

    const { container } = render(LegendOverlay);

    expect(
      container.querySelector('.legend-svg--patterns')
    ).toBeInTheDocument();
    expect(container.querySelector('pattern')).toBeInTheDocument();
    expect(
      container.querySelector('.legend-color-scale')
    ).not.toBeInTheDocument();
  });

  it('renders line width legends through SVG rows', () => {
    mockVisualizationStore.version = 1;
    mockVisualizationStore.visualizations = [buildLineWidthViz()];
    legendActions.reset();
    legendActions.setVisibility(true);

    const { container } = render(LegendOverlay);

    expect(
      container.querySelector('.legend-svg--line-width')
    ).toBeInTheDocument();
    expect(
      container.querySelector('.khartis_line_width_legend')
    ).toBeInTheDocument();
    expect(
      container.querySelector('.legend-proportional-scale')
    ).not.toBeInTheDocument();
  });

  it('renders point size class legends with class labels derived from breaks', () => {
    mockVisualizationStore.version = 1;
    mockVisualizationStore.visualizations = [buildPointSizeClassesViz()];
    legendActions.reset();
    legendActions.setVisibility(true);

    const { container } = render(LegendOverlay);

    expect(container.querySelector('.legend-svg--symbols')).toBeInTheDocument();
    expect(screen.getByText('capacity_total')).toBeInTheDocument();
    expect(screen.getByText('< 610')).toBeInTheDocument();
    expect(screen.getByText('610 – 980')).toBeInTheDocument();
    expect(screen.getByText('980 – 1 200')).toBeInTheDocument();
    expect(screen.getByText('≥ 1 200')).toBeInTheDocument();
    expect(screen.queryAllByText('1 200')).toHaveLength(0);
  });

  it('uses symbol missing data visibility for point size legends', () => {
    const viz = buildPointSizeClassesViz();
    viz.missingData = {
      show: true,
      shape: MissingDataShape.CIRCLE,
      size: 6,
      color: '#d9d9d9'
    };
    if (viz.symbol?.missingData) {
      viz.symbol.missingData = {
        ...viz.symbol.missingData,
        show: false
      };
    }
    mockVisualizationStore.version = 1;
    mockVisualizationStore.visualizations = [viz];
    legendActions.reset();
    legendActions.setVisibility(true);

    const { container } = render(LegendOverlay);

    expect(container.querySelector('.legend-svg--symbols')).toBeInTheDocument();
    expect(countLegendLabels('Absence de données')).toBe(0);
  });

  it('renders text categorical legends through the common SVG system', () => {
    mockVisualizationStore.version = 1;
    mockVisualizationStore.visualizations = [buildTextCategoriesViz()];
    legendActions.reset();
    legendActions.setVisibility(true);

    const { container } = render(LegendOverlay);

    expect(
      container.querySelector('.legend-svg--text-color')
    ).toBeInTheDocument();
    expect(container.querySelector('.categorical_legend')).toBeInTheDocument();
    expect(screen.getByText('Préfecture')).toBeInTheDocument();
    expect(screen.getByText('Sous-préfecture')).toBeInTheDocument();
  });

  it('renders missing data only once across multi-segment legends', () => {
    const viz = buildTextBivariateViz();
    if (!viz.text) {
      throw new Error('Text primitive is required for this test');
    }
    viz.text = {
      ...viz.text,
      missingData: {
        show: true,
        shape: MissingDataShape.CIRCLE,
        size: 6,
        color: '#c6c6c6'
      }
    };
    mockVisualizationStore.version = 1;
    mockVisualizationStore.visualizations = [viz];
    legendActions.reset();
    legendActions.setVisibility(true);

    render(LegendOverlay);

    expect(countLegendLabels('Absence de données')).toBe(1);
  });

  it('renders proportional text size legends through the original symbol legend generator', () => {
    mockVisualizationStore.version = 1;
    mockVisualizationStore.visualizations = [buildTextProportionalViz()];
    legendActions.reset();
    legendActions.setVisibility(true);

    const { container } = render(LegendOverlay);

    expect(
      container.querySelector('.legend-svg--text-size')
    ).toBeInTheDocument();
    expect(container.querySelector('.symbol_legend')).toBeInTheDocument();
    expect(countLegendLabels('Absence de données')).toBe(1);
  });

  it('renders bivariate text legends as compact color and size blocks', () => {
    mockVisualizationStore.version = 1;
    mockVisualizationStore.visualizations = [buildTextBivariateViz()];
    legendActions.reset();
    legendActions.setVisibility(true);

    const { container } = render(LegendOverlay);

    expect(
      container.querySelector('.legend-svg--text-color')
    ).toBeInTheDocument();
    expect(
      container.querySelector('.legend-svg--text-size')
    ).toBeInTheDocument();
    expect(
      container.querySelectorAll('.legend-svg').length
    ).toBeGreaterThanOrEqual(2);
  });

  it('gives each primitive of a visualization its own legend frame', () => {
    mockVisualizationStore.version = 1;
    mockVisualizationStore.visualizations = [buildPolygonAndSymbolViz()];
    legendActions.reset();
    legendActions.setVisibility(true);

    const { container } = render(LegendOverlay);

    expect(container.querySelectorAll('.legend-container')).toHaveLength(2);
  });

  it('bounds a classified legend by the filtered scope, not the whole column', () => {
    mockVisualizationStore.version = 1;
    mockVisualizationStore.visualizations = [buildClassedPolygonViz()];
    mockRowScopeStore.getScopedDomain.mockReturnValue({
      min: 1_200_000,
      max: 9_000_000
    });
    legendActions.reset();
    legendActions.setVisibility(true);

    const { container } = render(LegendOverlay);
    const digits = [...container.querySelectorAll('.legend-svg text')]
      .map((node) => (node.textContent ?? '').replace(/\D/g, ''))
      .filter(Boolean);

    expect(digits).toContain('1200000');
    expect(digits).toContain('9000000');
    expect(digits).not.toContain('30359');
    expect(digits).not.toContain('15907951');
  });

  it('stacks primitive legend frames down from the anchor corner', async () => {
    mockVisualizationStore.version = 1;
    mockVisualizationStore.visualizations = [buildPolygonAndSymbolViz()];
    legendActions.reset();
    legendActions.setVisibility(true);

    const { container } = render(LegendOverlay);
    const overlay = container.querySelector('.legend-overlay');
    const frames = container.querySelectorAll('.legend-container');

    if (
      !(overlay instanceof HTMLDivElement) ||
      !(frames[0] instanceof HTMLDivElement) ||
      !(frames[1] instanceof HTMLDivElement)
    ) {
      throw new Error('Legend frames were not rendered');
    }

    bindElementBox(overlay, { left: 0, top: 0, width: 300, height: 200 });
    bindElementBox(frames[0], { left: 0, top: 0, width: 50, height: 40 });
    bindElementBox(frames[1], { left: 0, top: 0, width: 60, height: 30 });

    formatActions.setSize(300, 200);

    await waitFor(() => {
      expect(frames[0].getAttribute('style')).toContain('left: 238px');
      expect(frames[0].getAttribute('style')).toContain('top: 12px');
      expect(frames[1].getAttribute('style')).toContain('left: 228px');
    });

    const secondTop = Number(
      /top: ([\d.]+)px/.exec(frames[1].getAttribute('style') ?? '')?.[1]
    );
    expect(secondTop).toBeGreaterThanOrEqual(60);
    // The default stack stays out of the saved project until the user drags.
    expect(getLegendState().items.every((item) => !item.dragPosition)).toBe(
      true
    );
  });

  it('moves one primitive legend frame without moving the others', async () => {
    globalState.selectedTool = StylingTools.Legend;
    mockVisualizationStore.version = 1;
    mockVisualizationStore.visualizations = [buildPolygonAndSymbolViz()];
    legendActions.reset();
    legendActions.setVisibility(true);

    const { container } = render(LegendOverlay);
    const overlay = container.querySelector('.legend-overlay');
    const frames = container.querySelectorAll('.legend-container');

    if (
      !(overlay instanceof HTMLDivElement) ||
      !(frames[0] instanceof HTMLDivElement) ||
      !(frames[1] instanceof HTMLDivElement)
    ) {
      throw new Error('Legend frames were not rendered');
    }

    bindElementBox(overlay, { left: 0, top: 0, width: 300, height: 200 });
    bindElementBox(frames[0], { left: 14, top: 10, width: 50, height: 40 });
    bindElementBox(frames[1], { left: 14, top: 60, width: 50, height: 40 });

    await fireEvent.pointerDown(frames[1], { clientX: 18, clientY: 68 });
    await fireEvent.pointerMove(window, { clientX: 41, clientY: 93 });

    const [first, second] = getLegendState().items;
    expect(first.dragPosition ?? null).toBeNull();
    expect(second.dragPosition).toEqual({ x: 36, y: 84 });
  });

  it('snaps legend dragging to the shared page grid when enabled', async () => {
    globalState.selectedTool = StylingTools.Legend;

    const { container } = render(LegendOverlay);
    const overlay = container.querySelector('.legend-overlay');
    const legend = container.querySelector('.legend-container');

    expect(overlay).toBeInstanceOf(HTMLDivElement);
    expect(legend).toBeInstanceOf(HTMLDivElement);

    if (
      !(overlay instanceof HTMLDivElement) ||
      !(legend instanceof HTMLDivElement)
    ) {
      return;
    }

    const overlayBox = { left: 0, top: 0, width: 300, height: 200 };
    const legendBox = { left: 14, top: 10, width: 50, height: 40 };

    bindElementBox(overlay, overlayBox);
    bindElementBox(legend, legendBox);

    await fireEvent.pointerDown(legend, {
      clientX: 18,
      clientY: 18
    });

    expect(
      document.body.classList.contains(DRAGGING_STYLING_TARGET_BODY_CLASS)
    ).toBe(true);

    await fireEvent.pointerMove(window, {
      clientX: 41,
      clientY: 43
    });

    expect(getFirstLegendFramePosition()).toEqual({ x: 36, y: 36 });

    await fireEvent.pointerUp(window);

    expect(
      document.body.classList.contains(DRAGGING_STYLING_TARGET_BODY_CLASS)
    ).toBe(false);
  });

  it('keeps legend dragging free-form when the grid is disabled', async () => {
    globalState.selectedTool = StylingTools.Legend;
    formatActions.toggleGrid();

    const { container } = render(LegendOverlay);
    const overlay = container.querySelector('.legend-overlay');
    const legend = container.querySelector('.legend-container');

    expect(overlay).toBeInstanceOf(HTMLDivElement);
    expect(legend).toBeInstanceOf(HTMLDivElement);

    if (
      !(overlay instanceof HTMLDivElement) ||
      !(legend instanceof HTMLDivElement)
    ) {
      return;
    }

    const overlayBox = { left: 0, top: 0, width: 300, height: 200 };
    const legendBox = { left: 14, top: 10, width: 50, height: 40 };

    bindElementBox(overlay, overlayBox);
    bindElementBox(legend, legendBox);

    await fireEvent.pointerDown(legend, {
      clientX: 18,
      clientY: 18
    });
    await fireEvent.pointerMove(window, {
      clientX: 41,
      clientY: 43
    });

    expect(getFirstLegendFramePosition()).toEqual({ x: 37, y: 35 });
  });

  it('moves the focused legend with arrow keys', async () => {
    formatActions.toggleGrid();

    const { container } = render(LegendOverlay);
    const overlay = container.querySelector('.legend-overlay');
    const legend = container.querySelector('.legend-container');

    expect(overlay).toBeInstanceOf(HTMLDivElement);
    expect(legend).toBeInstanceOf(HTMLDivElement);

    if (
      !(overlay instanceof HTMLDivElement) ||
      !(legend instanceof HTMLDivElement)
    ) {
      return;
    }

    bindElementBox(overlay, { left: 0, top: 0, width: 300, height: 200 });
    bindElementBox(legend, { left: 14, top: 10, width: 50, height: 40 });

    await fireEvent.keyDown(legend, { key: 'ArrowRight' });

    expect(getFirstLegendFramePosition()).toEqual({ x: 15, y: 10 });
    expect(globalState.selectedTool).toBe(StylingTools.Legend);
  });

  it('keeps dragged legend coordinates logical when the rendered page is scaled', async () => {
    globalState.selectedTool = StylingTools.Legend;
    globalActions.setPageZoomScale(0.5);

    const { container } = render(LegendOverlay);
    const overlay = container.querySelector('.legend-overlay');
    const legend = container.querySelector('.legend-container');

    expect(overlay).toBeInstanceOf(HTMLDivElement);
    expect(legend).toBeInstanceOf(HTMLDivElement);

    if (
      !(overlay instanceof HTMLDivElement) ||
      !(legend instanceof HTMLDivElement)
    ) {
      return;
    }

    bindElementBox(overlay, { left: 0, top: 0, width: 300, height: 200 });
    bindElementBox(legend, { left: 7, top: 5, width: 50, height: 40 });

    await fireEvent.pointerDown(legend, {
      clientX: 9,
      clientY: 9
    });
    await fireEvent.pointerMove(window, {
      clientX: 20.5,
      clientY: 21.5
    });

    expect(getFirstLegendFramePosition()).toEqual({ x: 36, y: 36 });
  });

  it('reclamps a dragged legend after the page size shrinks', async () => {
    const { container } = render(LegendOverlay);
    const overlay = container.querySelector('.legend-overlay');
    const legend = container.querySelector('.legend-container');

    expect(overlay).toBeInstanceOf(HTMLDivElement);
    expect(legend).toBeInstanceOf(HTMLDivElement);

    if (
      !(overlay instanceof HTMLDivElement) ||
      !(legend instanceof HTMLDivElement)
    ) {
      return;
    }

    const overlayBox = { left: 0, top: 0, width: 300, height: 200 };
    const legendBox = { left: 240, top: 144, width: 50, height: 40 };

    bindElementBox(overlay, overlayBox);
    bindElementBox(legend, legendBox);

    legendActions.updateLegendItem(getFirstLegendItem().id, {
      dragPosition: { x: 240, y: 144 }
    });

    overlayBox.width = 180;
    overlayBox.height = 120;
    formatActions.setSize(180, 120);

    await waitFor(() => {
      expect(getFirstLegendFramePosition()).toEqual({ x: 120, y: 72 });
    });
  });

  it('recenters the page when a centered legend loses focus', async () => {
    const { legend } = setupLegendViewport();

    await fireEvent.dblClick(legend);

    await waitFor(() => {
      expect(globalState.zoom.pagePanOffset).toEqual({ x: 90, y: 60 });
    });

    await fireEvent.blur(legend);

    await waitFor(() => {
      expect(globalState.zoom.pagePanOffset).toEqual({ x: 0, y: 0 });
    });
  });

  it('centers legend focus in the visible area beside the tool popover', async () => {
    const { legend } = setupLegendOccludedViewport();

    await fireEvent.dblClick(legend);

    await waitFor(() => {
      expect(globalState.zoom.pagePanOffset).toEqual({ x: 168, y: 60 });
    });
  });
});

function buildDoubleProportionalViz(): VisualizationConfig {
  return {
    id: 'viz-1',
    name: 'Population',
    type: 'proportional',
    datasetId: 'dataset-1',
    enabled: true,
    primitiveFilters: ['point'],
    primitiveOrder: ['point'],
    modes: {
      symbol: SymbolMode.PROPORTIONAL,
      proportionalType: ProportionalType.DOUBLE
    },
    symbol: {
      enabled: true,
      mode: SymbolMode.PROPORTIONAL,
      shape: ShapeType.CIRCLE,
      size: 12,
      minSize: 4,
      maxSize: 24,
      sizeScale: 'linear',
      opacity: 1,
      fillMode: FillMode.UNIQUE,
      fillColor: '#4585f5',
      fillColorB: '#ff812a',
      strokeMode: StrokeMode.UNIQUE,
      strokeColor: '#ffffff',
      strokeWidth: 1,
      strokeOpacity: 1,
      proportionalType: ProportionalType.DOUBLE,
      categoryShape: CategoryShapeMode.UNIQUE,
      commonScale: true,
      positionMode: SymbolDoublePosition.OVERLAY,
      valueColumn: 'secondary-population',
      sizeColumn: 'population'
    },
    style: {
      fillColor: '#4585f5',
      fillColorB: '#ff812a',
      fillOpacity: 100,
      strokeColor: '#ffffff',
      strokeWidth: 1,
      strokeOpacity: 100
    },
    mapping: {
      sizeColumn: 'population',
      valueColumn: 'secondary-population',
      geometryColumn: 'geom'
    },
    symbols: {
      type: ShapeType.CIRCLE,
      minSize: 4,
      maxSize: 24,
      sizeScale: 'linear'
    }
  } as VisualizationConfig;
}

function buildSingleProportionalViz(): VisualizationConfig {
  const base = buildDoubleProportionalViz();

  return {
    ...base,
    id: 'viz-prop-single',
    modes: {
      symbol: SymbolMode.PROPORTIONAL,
      proportionalType: ProportionalType.SINGLE
    },
    symbol: {
      ...base.symbol,
      proportionalType: ProportionalType.SINGLE,
      valueColumn: undefined
    },
    mapping: {
      sizeColumn: 'population',
      geometryColumn: 'geom'
    }
  } as VisualizationConfig;
}

function buildOwnScaleDoubleProportionalViz(): VisualizationConfig {
  const base = buildDoubleProportionalViz();

  return {
    ...base,
    id: 'viz-prop-own-scale',
    symbol: {
      ...base.symbol,
      commonScale: false
    }
  } as VisualizationConfig;
}

function buildPointCategoriesViz(): VisualizationConfig {
  return {
    id: 'viz-cat',
    name: 'Segments',
    type: 'categorical',
    datasetId: 'dataset-1',
    enabled: true,
    primitiveFilters: ['point'],
    primitiveOrder: ['point'],
    modes: {
      symbol: SymbolMode.CATEGORIES,
      categoryShape: CategoryShapeMode.DIFFERENT
    },
    symbol: {
      enabled: true,
      mode: SymbolMode.CATEGORIES,
      shape: ShapeType.CIRCLE,
      size: 10,
      minSize: 6,
      maxSize: 14,
      sizeScale: 'linear',
      opacity: 1,
      fillMode: FillMode.CATEGORIES,
      fillColor: '#4585f5',
      strokeMode: StrokeMode.CATEGORIES,
      strokeColor: '#ffffff',
      strokeWidth: 1,
      strokeOpacity: 1,
      proportionalType: ProportionalType.SINGLE,
      categoryShape: CategoryShapeMode.DIFFERENT,
      categoryColumn: 'segment',
      classification: {
        method: ClassificationMethod.MANUAL,
        classes: 3,
        labels: ['Actif', 'Pause', 'Dormant'],
        disabledLabels: ['Pause'],
        colors: ['#f287ac', '#00ad92', '#c39800'],
        categoryShapes: [ShapeType.CIRCLE, ShapeType.SQUARE, ShapeType.TRIANGLE]
      },
      strokeClassification: {
        method: ClassificationMethod.MANUAL,
        classes: 3,
        labels: ['Actif', 'Pause', 'Dormant'],
        disabledLabels: ['Pause'],
        colors: ['#f287ac', '#00ad92', '#c39800']
      }
    },
    style: {
      fillColor: '#4585f5',
      fillOpacity: 100,
      strokeColor: '#ffffff',
      strokeWidth: 1,
      strokeOpacity: 100
    },
    mapping: {
      categoryColumn: 'segment',
      geometryColumn: 'geom'
    },
    symbols: {
      type: ShapeType.CIRCLE,
      minSize: 6,
      maxSize: 14,
      sizeScale: 'linear'
    }
  } as VisualizationConfig;
}

function buildPointClassedFillViz(): VisualizationConfig {
  return {
    id: 'viz-point-classed-fill',
    name: 'Capacity',
    type: 'categorical',
    datasetId: 'dataset-1',
    enabled: true,
    primitiveFilters: ['point'],
    primitiveOrder: ['point'],
    symbol: {
      enabled: true,
      mode: SymbolMode.UNIQUE,
      shape: ShapeType.CIRCLE,
      size: 10,
      minSize: 6,
      maxSize: 14,
      sizeScale: 'linear',
      opacity: 1,
      fillMode: FillMode.CLASSES,
      fillColor: '#4585f5',
      strokeMode: StrokeMode.UNIQUE,
      strokeColor: '#ffffff',
      strokeWidth: 1,
      strokeOpacity: 1,
      proportionalType: ProportionalType.SINGLE,
      categoryShape: CategoryShapeMode.UNIQUE,
      fillValueColumn: 'capacity',
      fillClassification: {
        method: ClassificationMethod.QUANTILES,
        classes: 4,
        breaks: [610, 980, 1200],
        colors: ['#d0e2ff', '#78a9ff', '#4589ff', '#0f62fe', '#0043ce']
      },
      missingData: {
        show: true,
        shape: MissingDataShape.CIRCLE,
        size: 6,
        color: '#d9d9d9'
      }
    },
    style: {
      fillColor: '#4585f5',
      fillOpacity: 100,
      strokeColor: '#ffffff',
      strokeWidth: 1,
      strokeOpacity: 100
    },
    mapping: {
      categoryColumn: 'category',
      colorColumn: 'category',
      geometryColumn: 'geom'
    }
  } as VisualizationConfig;
}

function buildUniquePointViz(): VisualizationConfig {
  return {
    id: 'viz-point-unique',
    name: 'Symbols',
    type: 'categorical',
    datasetId: 'dataset-1',
    enabled: true,
    primitiveFilters: ['point'],
    primitiveOrder: ['point'],
    symbol: {
      enabled: true,
      mode: SymbolMode.UNIQUE,
      shape: ShapeType.TRIANGLE,
      size: 100,
      minSize: 6,
      maxSize: 100,
      sizeScale: 'linear',
      opacity: 1,
      fillMode: FillMode.UNIQUE,
      fillColor: '#4585f5',
      strokeMode: StrokeMode.UNIQUE,
      strokeColor: '#ffffff',
      strokeWidth: 1,
      strokeOpacity: 1,
      proportionalType: ProportionalType.SINGLE,
      categoryShape: CategoryShapeMode.UNIQUE,
      missingData: {
        show: true,
        shape: MissingDataShape.CIRCLE,
        size: 6,
        color: '#d9d9d9'
      }
    },
    style: {
      fillColor: '#4585f5',
      fillOpacity: 100,
      strokeColor: '#ffffff',
      strokeWidth: 1,
      strokeOpacity: 100
    },
    mapping: {
      geometryColumn: 'geom'
    }
  } as VisualizationConfig;
}

function buildPolygonAndSymbolViz(): VisualizationConfig {
  return {
    ...buildClassedPolygonViz(),
    id: 'viz-poly-point',
    name: 'Population',
    primitiveFilters: ['polygon', 'point'],
    primitiveOrder: ['polygon', 'point'],
    symbol: buildUniquePointViz().symbol
  } as VisualizationConfig;
}

function buildClassedPolygonViz(): VisualizationConfig {
  const classification = {
    method: ClassificationMethod.QUANTILES,
    classes: 4,
    breaks: [100_000, 500_000, 1_000_000],
    colors: ['#f7fbff', '#c6dbef', '#6baed6', '#2171b5']
  };

  return {
    id: 'viz-poly',
    name: 'Density',
    type: 'choropleth',
    datasetId: 'dataset-1',
    enabled: true,
    primitiveFilters: ['polygon'],
    primitiveOrder: ['polygon'],
    modes: {
      fill: FillMode.CLASSES
    },
    polygon: {
      enabled: true,
      fillMode: FillMode.CLASSES,
      fillColor: '#4585f5',
      fillOpacity: 100,
      strokeMode: StrokeMode.UNIQUE,
      strokeColor: '#ffffff',
      strokeWidth: 1,
      strokeOpacity: 100,
      strokeDashed: false,
      valueColumn: 'population',
      classification
    },
    classification,
    style: {
      fillColor: '#4585f5',
      fillOpacity: 100,
      strokeColor: '#ffffff',
      strokeWidth: 1,
      strokeOpacity: 100
    },
    mapping: {
      valueColumn: 'population',
      geometryColumn: 'geom'
    }
  } as VisualizationConfig;
}

function buildProportionalPolygonClassesOnlyViz(): VisualizationConfig {
  return {
    ...buildClassedPolygonViz(),
    id: 'viz-prop-poly',
    type: 'proportional',
    primitiveFilters: ['polygon'],
    primitiveOrder: ['polygon'],
    symbol: {
      enabled: false,
      mode: SymbolMode.PROPORTIONAL,
      shape: ShapeType.CIRCLE,
      size: 12,
      minSize: 4,
      maxSize: 24,
      sizeScale: 'linear',
      opacity: 1,
      fillMode: FillMode.UNIQUE,
      fillColor: '#4585f5',
      strokeMode: StrokeMode.UNIQUE,
      strokeColor: '#ffffff',
      strokeWidth: 1,
      strokeOpacity: 1,
      proportionalType: ProportionalType.SINGLE,
      categoryShape: CategoryShapeMode.UNIQUE,
      sizeColumn: 'population'
    }
  } as VisualizationConfig;
}

function buildDensityPolygonViz(): VisualizationConfig {
  return {
    id: 'viz-density',
    name: 'Density',
    type: 'choropleth',
    datasetId: 'dataset-1',
    enabled: true,
    primitiveFilters: ['polygon'],
    primitiveOrder: ['polygon'],
    modes: {
      fill: FillMode.DENSITY
    },
    polygon: {
      enabled: true,
      fillMode: FillMode.DENSITY,
      fillColor: '#4585f5',
      fillOpacity: 100,
      strokeMode: StrokeMode.UNIQUE,
      strokeColor: '#ffffff',
      strokeWidth: 1,
      strokeOpacity: 100,
      strokeDashed: false
    },
    density: {
      ratio: 42,
      dotSize: 2,
      color: '#4585f5'
    },
    style: {
      fillColor: '#4585f5',
      fillOpacity: 100,
      strokeColor: '#ffffff',
      strokeWidth: 1,
      strokeOpacity: 100
    },
    mapping: {
      valueColumn: 'population',
      geometryColumn: 'geom'
    }
  } as VisualizationConfig;
}

function buildPatternedPolygonViz(): VisualizationConfig {
  const classification = {
    method: ClassificationMethod.MANUAL,
    classes: 2,
    labels: ['Urbain', 'Rural'],
    colors: ['#f7fbff', '#2171b5'],
    patternId: 'diagonal'
  };

  return {
    id: 'viz-pattern',
    name: 'Land use',
    type: 'categorical',
    datasetId: 'dataset-1',
    enabled: true,
    primitiveFilters: ['polygon'],
    primitiveOrder: ['polygon'],
    modes: {
      fill: FillMode.CATEGORIES
    },
    polygon: {
      enabled: true,
      fillMode: FillMode.CATEGORIES,
      fillColor: '#4585f5',
      fillOpacity: 100,
      strokeMode: StrokeMode.UNIQUE,
      strokeColor: '#ffffff',
      strokeWidth: 1,
      strokeOpacity: 100,
      strokeDashed: false,
      categoryColumn: 'land_use',
      classification
    },
    classification,
    style: {
      fillColor: '#4585f5',
      fillOpacity: 100,
      strokeColor: '#ffffff',
      strokeWidth: 1,
      strokeOpacity: 100
    },
    mapping: {
      categoryColumn: 'land_use',
      geometryColumn: 'geom'
    }
  } as VisualizationConfig;
}

function buildLineWidthViz(): VisualizationConfig {
  const classification = {
    method: ClassificationMethod.QUANTILES,
    classes: 3,
    breaks: [10, 20],
    colors: ['#4585f5', '#4585f5', '#4585f5']
  };

  return {
    id: 'viz-line',
    name: 'Flows',
    type: 'proportional',
    datasetId: 'dataset-1',
    enabled: true,
    primitiveFilters: ['line'],
    primitiveOrder: ['line'],
    line: {
      enabled: true,
      colorMode: ColorMode.UNIQUE,
      thicknessMode: ThicknessMode.CLASSES,
      color: '#1e3a5f',
      width: 2,
      maxWidth: 12,
      opacity: 1,
      dashed: true,
      valueColumn: 'population',
      sizeColumn: 'population',
      thicknessClassification: classification
    },
    lineThicknessClassification: classification,
    style: {
      lineColor: '#1e3a5f',
      lineWidth: 2,
      lineMaxWidth: 12,
      lineOpacity: 1,
      lineDashed: true
    },
    mapping: {
      valueColumn: 'population',
      sizeColumn: 'population',
      geometryColumn: 'geom'
    }
  } as VisualizationConfig;
}

function buildPointSizeClassesViz(): VisualizationConfig {
  return {
    id: 'viz-point-size-classes',
    name: 'Capacity total',
    type: 'proportional',
    datasetId: 'dataset-1',
    enabled: true,
    primitiveFilters: ['point'],
    primitiveOrder: ['point'],
    symbol: {
      enabled: true,
      mode: SymbolMode.CLASSES,
      shape: ShapeType.CIRCLE,
      minSize: 6,
      maxSize: 24,
      sizeScale: 'linear',
      opacity: 1,
      fillMode: FillMode.UNIQUE,
      fillColor: '#4585f5',
      strokeMode: StrokeMode.UNIQUE,
      strokeColor: '#ffffff',
      strokeWidth: 1,
      strokeOpacity: 1,
      proportionalType: ProportionalType.SINGLE,
      categoryShape: CategoryShapeMode.UNIQUE,
      valueColumn: 'capacity_total',
      sizeColumn: 'capacity_total',
      classification: {
        method: ClassificationMethod.QUANTILES,
        classes: 5,
        breaks: [610, 980, 1200],
        colors: ['#d0e2ff', '#78a9ff', '#4589ff', '#0f62fe', '#0043ce']
      },
      missingData: {
        show: true,
        shape: MissingDataShape.CIRCLE,
        size: 6,
        color: '#d9d9d9'
      }
    },
    classification: {
      method: ClassificationMethod.QUANTILES,
      classes: 5,
      breaks: [610, 980, 1200],
      colors: ['#d0e2ff', '#78a9ff', '#4589ff', '#0f62fe', '#0043ce']
    },
    style: {
      fillColor: '#4585f5',
      fillOpacity: 100,
      strokeColor: '#ffffff',
      strokeWidth: 1,
      strokeOpacity: 100
    },
    mapping: {
      valueColumn: 'capacity_total',
      sizeColumn: 'capacity_total',
      geometryColumn: 'geom'
    }
  } as VisualizationConfig;
}

function buildTextCategoriesViz(): VisualizationConfig {
  const classification = {
    method: ClassificationMethod.MANUAL,
    classes: 2,
    labels: ['Préfecture', 'Sous-préfecture'],
    colors: ['#0f62fe', '#ff832b']
  };

  return {
    id: 'viz-text-cat',
    name: 'Statut administratif',
    type: 'categorical',
    datasetId: 'dataset-1',
    enabled: true,
    primitiveFilters: ['text'],
    primitiveOrder: ['text'],
    modes: {
      color: ColorMode.CATEGORIES,
      size: SizeMode.FIXED
    },
    text: {
      enabled: true,
      labelColumn: 'label',
      colorMode: ColorMode.CATEGORIES,
      sizeMode: SizeMode.FIXED,
      color: '#111111',
      opacity: 1,
      size: 12,
      categoryColumn: 'status',
      classification,
      missingData: {
        show: false,
        shape: MissingDataShape.CIRCLE,
        size: 6,
        color: '#c6c6c6'
      }
    },
    textClassification: classification,
    style: {
      textOpacity: 1,
      textColor: '#111111',
      textSize: 12
    },
    mapping: {
      labelColumn: 'label',
      categoryColumn: 'status',
      geometryColumn: 'geom'
    }
  } as VisualizationConfig;
}

function buildTextProportionalViz(): VisualizationConfig {
  return {
    id: 'viz-text-size',
    name: 'Population',
    type: 'proportional',
    datasetId: 'dataset-1',
    enabled: true,
    primitiveFilters: ['text'],
    primitiveOrder: ['text'],
    modes: {
      color: ColorMode.UNIQUE,
      size: SizeMode.PROPORTIONAL
    },
    text: {
      enabled: true,
      labelColumn: 'label',
      colorMode: ColorMode.UNIQUE,
      sizeMode: SizeMode.PROPORTIONAL,
      color: '#1f1f1f',
      opacity: 1,
      size: 13,
      valueColumn: 'population',
      missingData: {
        show: true,
        shape: MissingDataShape.CIRCLE,
        size: 6,
        color: '#c6c6c6'
      }
    },
    style: {
      textOpacity: 1,
      textColor: '#1f1f1f',
      textSize: 13
    },
    mapping: {
      labelColumn: 'label',
      valueColumn: 'population',
      geometryColumn: 'geom'
    },
    missingData: {
      show: true,
      shape: MissingDataShape.CIRCLE,
      size: 6,
      color: '#c6c6c6'
    }
  } as VisualizationConfig;
}

function buildTextBivariateViz(): VisualizationConfig {
  const classification = {
    method: ClassificationMethod.MANUAL,
    classes: 2,
    labels: ['Métropole', 'Ville moyenne'],
    colors: ['#0f62fe', '#ff832b']
  };

  return {
    id: 'viz-text-bi',
    name: 'Armature urbaine',
    type: 'bivariate',
    datasetId: 'dataset-1',
    enabled: true,
    primitiveFilters: ['text'],
    primitiveOrder: ['text'],
    modes: {
      color: ColorMode.CATEGORIES,
      size: SizeMode.PROPORTIONAL
    },
    text: {
      enabled: true,
      labelColumn: 'label',
      colorMode: ColorMode.CATEGORIES,
      sizeMode: SizeMode.PROPORTIONAL,
      color: '#111111',
      opacity: 1,
      size: 12,
      categoryColumn: 'status',
      valueColumn: 'population',
      classification,
      missingData: {
        show: false,
        shape: MissingDataShape.CIRCLE,
        size: 6,
        color: '#c6c6c6'
      }
    },
    textClassification: classification,
    style: {
      textOpacity: 1,
      textColor: '#111111',
      textSize: 12
    },
    mapping: {
      labelColumn: 'label',
      categoryColumn: 'status',
      valueColumn: 'population',
      geometryColumn: 'geom'
    }
  } as VisualizationConfig;
}
