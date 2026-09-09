import { cleanup, render, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  globalActions,
  globalState
} from '$lib/features/commons/stores/global.svelte';
import { ToolbarStep } from '$lib/features/commons/types/global';
import { mapInstanceStore } from '$lib/features/commons/stores/map-instance.store.svelte';
import { annotationsActions } from '$lib/features/step-toolbar/tools/annotations/annotations.store.svelte';
import { formatActions } from '$lib/features/step-toolbar/tools/format/format.store.svelte';
import { geoIndicationsActions } from '$lib/features/step-toolbar/tools/geo-indications/geo-indications.store.svelte';
import { legendActions } from '$lib/features/step-toolbar/tools/legend/legend.store.svelte';
import type { FacetsLayout } from './facets.store.svelte';
import FacetsPage from './facets-page.svelte';

const { mockFetch, mockWaitForInitialization, mockInitDuckDb } = vi.hoisted(
  () => ({
    mockFetch: vi.fn(async () => ({ ok: false }) as Response),
    mockWaitForInitialization: vi.fn(async () => undefined),
    mockInitDuckDb: vi.fn(async () => undefined)
  })
);

vi.mock('$lib/features/duckdb', () => ({
  Duck: class DuckMock {},
  initDuckDB: mockInitDuckDb,
  GEO_CONSTANTS: {
    WGS84_CRS: 'EPSG:4326'
  },
  duckDBOrchestrator: {
    waitForInitialization: mockWaitForInitialization
  }
}));

vi.mock('$lib/features/duckdb/orchestrator/orchestrator.svelte', () => ({
  duckDBOrchestrator: {
    waitForInitialization: mockWaitForInitialization
  }
}));

vi.hoisted(() => {
  class WorkerMock {
    postMessage(): void {}

    terminate(): void {}

    addEventListener(): void {}

    removeEventListener(): void {}
  }

  vi.stubGlobal('Worker', WorkerMock);
  vi.stubGlobal('fetch', mockFetch);
});

const baseProps = {
  visualizations: [],
  tables: new Map(),
  geoJSONs: new Map(),
  layout: {
    columns: 2,
    gap: 16,
    frameVisible: true,
    frameColor: '#c6c6c6',
    frameThickness: 1
  } satisfies FacetsLayout,
  width: 600,
  height: 400
};

describe('facets page grid', () => {
  beforeEach(() => {
    cleanup();
    mockFetch.mockClear();
    mockWaitForInitialization.mockClear();
    formatActions.reset();
    formatActions.setSize(600, 400);
    geoIndicationsActions.reset();
    legendActions.reset();
    annotationsActions.reset();
    mapInstanceStore.reset();
    globalActions.resetNavigationState();
  });

  afterEach(() => {
    cleanup();
    formatActions.reset();
    geoIndicationsActions.reset();
    legendActions.reset();
    annotationsActions.reset();
    mapInstanceStore.reset();
    globalActions.resetNavigationState();
  });

  it('renders the shared page grid in styling mode when the grid is enabled', () => {
    globalState.selectedStep = ToolbarStep.Styling;

    const { container } = render(FacetsPage, baseProps);

    expect(container.querySelector('.page-grid')).toBeInTheDocument();
  });

  it('hides the shared page grid outside styling mode', async () => {
    globalState.selectedStep = ToolbarStep.Styling;

    const { container } = render(FacetsPage, baseProps);

    expect(container.querySelector('.page-grid')).toBeInTheDocument();

    globalState.selectedStep = ToolbarStep.Data;

    await waitFor(() => {
      expect(container.querySelector('.page-grid')).not.toBeInTheDocument();
    });
  });
});
