import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import {
  createPolygonHandlers,
  type PolygonHandlersDeps
} from './polygon-handlers.svelte';

vi.mock('$lib/features/commons/stores/visualization.store.svelte', () => ({
  PrimitiveFilterType: {
    POINT: 'point',
    POLYGON: 'polygon',
    LINE: 'line',
    TEXT: 'text'
  },
  getPolygonPrimitive: vi.fn((viz) => viz?.polygon)
}));

interface DepsBag {
  visualization: {
    id: string;
    polygon: Record<string, unknown>;
    density?: unknown;
  };
  updateSelectedVisualization: Mock;
  buildNextPrimitiveFilters: Mock;
  updatePrimitiveClassificationState: Mock;
  applyPrimitiveMappingUpdate: Mock;
  applyPrimitiveStrokeMappingUpdate: Mock;
  invertPrimitivePalette: Mock;
  invertPrimitiveStrokePalette: Mock;
  ensurePrimitiveClassificationDefaults: Mock;
  ensureAutoColumns: Mock;
  ensurePrimitiveStrokeClassificationDefaults: Mock;
  ensurePrimitiveStrokeAutoColumns: Mock;
  handlers: ReturnType<typeof createPolygonHandlers>;
}

function makeBag(extra: { density?: unknown } = {}): DepsBag {
  const polygon = {
    enabled: true,
    fillColor: '#abc',
    fillMode: 'unique',
    fillOpacity: 0.5,
    strokeColor: '#000',
    strokeMode: 'unique',
    strokeWidth: 2,
    strokeOpacity: 1,
    strokeDashed: false,
    missingData: { color: '#fff', show: true }
  };
  const visualization = { id: 'viz', polygon, ...extra };
  const mocks = {
    updateSelectedVisualization: vi.fn(),
    buildNextPrimitiveFilters: vi.fn().mockReturnValue([]),
    updatePrimitiveClassificationState: vi.fn(),
    applyPrimitiveMappingUpdate: vi.fn(),
    applyPrimitiveStrokeMappingUpdate: vi.fn(),
    invertPrimitivePalette: vi.fn(),
    invertPrimitiveStrokePalette: vi.fn(),
    ensurePrimitiveClassificationDefaults: vi.fn(),
    ensureAutoColumns: vi.fn(),
    ensurePrimitiveStrokeClassificationDefaults: vi.fn(),
    ensurePrimitiveStrokeAutoColumns: vi.fn()
  };
  const deps = {
    getSelectedVisualization: () => visualization,
    ...mocks
  } as unknown as PolygonHandlersDeps;
  const handlers = createPolygonHandlers(deps);
  return { visualization, ...mocks, handlers };
}

describe('createPolygonHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handlePolygonChange updates polygon and skips primitiveFilters when enabled is absent', () => {
    const bag = makeBag();
    bag.handlers.handlePolygonChange({ fillColor: '#def' } as never);
    expect(bag.updateSelectedVisualization).toHaveBeenCalledWith(
      expect.objectContaining({
        polygon: expect.objectContaining({ fillColor: '#def' })
      })
    );
    const args = bag.updateSelectedVisualization.mock.calls[0][0];
    expect(args.primitiveFilters).toBeUndefined();
  });

  it('handlePolygonChange recomputes primitiveFilters when enabled is updated', () => {
    const bag = makeBag();
    bag.handlers.handlePolygonChange({ enabled: false } as never);
    expect(bag.buildNextPrimitiveFilters).toHaveBeenCalledWith({
      polygon: false
    });
  });

  it('handlePolygonStyleChange uses fallback for fillOpacity but not for fillColor', () => {
    const bag = makeBag();
    bag.handlers.handlePolygonStyleChange({
      fillColor: undefined,
      fillOpacity: undefined
    } as never);
    const arg = bag.updateSelectedVisualization.mock.calls[0][0];
    expect(arg.polygon.fillColor).toBeUndefined();
    expect(arg.polygon.fillOpacity).toBe(0.5);
  });

  it('handlePolygonModesChange renames fill/stroke and triggers ensure callbacks', () => {
    const bag = makeBag();
    bag.handlers.handlePolygonModesChange({
      fill: 'classes',
      stroke: 'unique'
    } as never);
    const [updates, afterUpdate] =
      bag.updateSelectedVisualization.mock.calls[0];
    expect(updates.polygon.fillMode).toBe('classes');
    expect(updates.polygon.strokeMode).toBe('unique');

    afterUpdate({ id: 'next' });
    expect(bag.ensurePrimitiveClassificationDefaults).toHaveBeenCalledWith(
      'polygon',
      { id: 'next' }
    );
    expect(bag.ensureAutoColumns).toHaveBeenCalled();
    expect(bag.ensurePrimitiveStrokeClassificationDefaults).toHaveBeenCalled();
    expect(bag.ensurePrimitiveStrokeAutoColumns).toHaveBeenCalled();
  });

  it('handlePolygonClassificationChange delegates to updatePrimitiveClassificationState', () => {
    const bag = makeBag();
    bag.handlers.handlePolygonClassificationChange({
      method: 'jenks'
    } as never);
    expect(bag.updatePrimitiveClassificationState).toHaveBeenCalledWith(
      'polygon',
      { method: 'jenks' }
    );
  });

  it('handlePolygonDensityChange writes density and preserves existing fields', () => {
    const bag = makeBag({ density: { dot: 1 } });
    bag.handlers.handlePolygonDensityChange({ size: 2 } as never);
    expect(bag.updateSelectedVisualization).toHaveBeenCalledWith({
      density: { dot: 1, size: 2 }
    });
  });
});
