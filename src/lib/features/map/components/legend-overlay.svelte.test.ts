import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CategoryShapeMode,
  FillMode,
  ProportionalType,
  ShapeType,
  StrokeMode,
  SymbolDoublePosition,
  SymbolMode
} from '$lib/features/main-toolbar/constants';
import {
  globalActions,
  globalState
} from '$lib/features/commons/store/global.svelte';
import { StylingTools, ToolbarStep } from '$lib/features/commons/types/global';
import {
  ClassificationMethod,
  type VisualizationConfig
} from '$lib/features/commons/store/visualization.store.svelte';
import { formatActions } from '$lib/features/step-toolbar/tools/format/format.store.svelte';

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
    }
  }
}));

vi.mock(
  '$lib/features/commons/store/visualization.store.svelte',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('$lib/features/commons/store/visualization.store.svelte')
      >();

    return {
      ...actual,
      visualizationStore: mockVisualizationStore
    };
  }
);

vi.mock('$lib/features/commons/store/datasets.store.svelte', () => ({
  datasetsStore: {
    getColumnStatistics: (_datasetId: string, columnName?: string) =>
      mockDatasetsStore.getColumnStatistics(columnName)
  }
}));

import { legendActions } from '$lib/features/step-toolbar/tools/legend/legend.store.svelte';
import { getLegendState } from '$lib/features/step-toolbar/tools/legend/legend.store.svelte';
import LegendOverlay from './legend-overlay.svelte';

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

describe('legend overlay visibility', () => {
  beforeEach(() => {
    cleanup();
    document.getElementById('khartis-step-toolbar')?.remove();
    document.getElementById('khartis-tool-popover')?.remove();
    mockVisualizationStore.version = 0;
    mockVisualizationStore.visualizations = [];
    legendActions.reset();
    formatActions.reset();
    globalActions.resetNavigationState();
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
  });

  it('renders the legend content when visible', () => {
    render(LegendOverlay);

    expect(screen.getByText('Population')).toBeInTheDocument();
  });

  it('keeps the legend mounted but hidden when requested', () => {
    const { container } = render(LegendOverlay, { hidden: true });

    expect(
      container.querySelector('.legend-overlay.hidden')
    ).toBeInTheDocument();
    expect(screen.getByText('Population')).toBeInTheDocument();
  });

  it('compacts double proportional symbols when the map uses overlay mode', () => {
    mockVisualizationStore.version = 1;
    mockVisualizationStore.visualizations = [buildDoubleProportionalViz()];
    legendActions.reset();
    legendActions.setVisibility(true);

    const { container } = render(LegendOverlay);

    const pair = container.querySelector(
      '.legend-proportional-pair[data-position-mode="overlay"]'
    );

    expect(pair).toBeInTheDocument();
    expect(pair?.querySelectorAll('.legend-proportional-symbol')).toHaveLength(
      2
    );
    expect(screen.getByText('15,907,951')).toBeInTheDocument();
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
    expect(container.querySelectorAll('.legend-point-swatch')).toHaveLength(2);
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
    await fireEvent.pointerMove(window, {
      clientX: 41,
      clientY: 43
    });

    expect(getLegendState().dragPosition).toEqual({ x: 36, y: 36 });
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

    expect(getLegendState().dragPosition).toEqual({ x: 37, y: 35 });
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

    legendActions.setDragPosition({ x: 240, y: 144 });

    overlayBox.width = 180;
    overlayBox.height = 120;
    formatActions.setSize(180, 120);

    await waitFor(() => {
      expect(getLegendState().dragPosition).toEqual({ x: 120, y: 72 });
    });
  });

  it('recenters the page when a centered legend loses focus', async () => {
    const { legend } = setupLegendViewport();

    await fireEvent.click(legend);

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

    await fireEvent.click(legend);

    await waitFor(() => {
      expect(globalState.zoom.pagePanOffset).toEqual({ x: 128, y: 60 });
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
