import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fillSpy, strokeSpy, MOCK_METHOD, MOCK_PRIMITIVE } = vi.hoisted(() => ({
  fillSpy: vi.fn(),
  strokeSpy: vi.fn(),
  MOCK_METHOD: {
    JENKS: 'jenks',
    QUANTILES: 'quantile',
    EQUAL_INTERVAL: 'equal-interval',
    STANDARD_DEVIATION: 'standard-deviation',
    MANUAL: 'manual',
    Q6: 'q6',
    NESTED_MEANS: 'nested-means',
    HEAD_TAIL: 'head-tail'
  } as const,
  MOCK_PRIMITIVE: {
    POINT: 'point',
    LINE: 'line',
    POLYGON: 'polygon',
    TEXT: 'text'
  } as const
}));

vi.mock('$lib/features/commons/store/visualization.store.svelte', () => ({
  ClassificationMethod: MOCK_METHOD,
  PrimitiveFilterType: MOCK_PRIMITIVE,
  visualizationStore: {
    updatePrimitiveClassification: (
      id: string,
      primitive: unknown,
      updates: unknown
    ) => fillSpy(id, primitive, updates),
    updatePrimitiveStrokeClassification: (
      id: string,
      primitive: unknown,
      updates: unknown
    ) => strokeSpy(id, primitive, updates)
  }
}));

import {
  ClassificationMethod,
  PrimitiveFilterType,
  type PrimitiveFilter
} from '$lib/features/commons/store/visualization.store.svelte';
import {
  useClassification,
  type ClassificationRole
} from './use-classification.svelte';

const POINT: PrimitiveFilter = PrimitiveFilterType.POINT;
const POLYGON: PrimitiveFilter = PrimitiveFilterType.POLYGON;

function createHandle(role: ClassificationRole, id: string | undefined) {
  return useClassification(
    () => id,
    () => POLYGON,
    role
  );
}

describe('useClassification', () => {
  beforeEach(() => {
    fillSpy.mockReset();
    strokeSpy.mockReset();
  });

  it('should route fill-role updates to updatePrimitiveClassification', () => {
    const handle = createHandle('fill', 'viz-1');
    handle.update({ method: ClassificationMethod.JENKS });
    expect(fillSpy).toHaveBeenCalledWith('viz-1', POLYGON, {
      method: ClassificationMethod.JENKS
    });
    expect(strokeSpy).not.toHaveBeenCalled();
  });

  it('should route stroke-role updates to updatePrimitiveStrokeClassification', () => {
    const handle = createHandle('stroke', 'viz-1');
    handle.update({ colors: ['#111', '#222'] });
    expect(strokeSpy).toHaveBeenCalledWith('viz-1', POLYGON, {
      colors: ['#111', '#222']
    });
    expect(fillSpy).not.toHaveBeenCalled();
  });

  it('should never leak: a stroke handle cannot trigger the fill setter regardless of payload', () => {
    const strokeHandle = createHandle('stroke', 'viz-1');
    strokeHandle.update({ paletteId: 'accent' });
    strokeHandle.update({ method: ClassificationMethod.QUANTILES });
    strokeHandle.update({ colors: ['#aaa'] });
    expect(fillSpy).not.toHaveBeenCalled();
    expect(strokeSpy).toHaveBeenCalledTimes(3);
  });

  it('should never leak: a fill handle cannot trigger the stroke setter regardless of payload', () => {
    const fillHandle = createHandle('fill', 'viz-1');
    fillHandle.update({ paletteId: 'rose' });
    fillHandle.update({ inverted: true });
    expect(strokeSpy).not.toHaveBeenCalled();
    expect(fillSpy).toHaveBeenCalledTimes(2);
  });

  it('should call the right setter with a different primitive filter', () => {
    const pointHandle = useClassification(
      () => 'viz-2',
      () => POINT,
      'stroke'
    );
    pointHandle.update({ method: ClassificationMethod.JENKS });
    expect(strokeSpy).toHaveBeenCalledWith('viz-2', POINT, {
      method: ClassificationMethod.JENKS
    });
  });

  it('should noop when vizId is undefined', () => {
    const handle = createHandle('fill', undefined);
    handle.update({ method: ClassificationMethod.JENKS });
    expect(fillSpy).not.toHaveBeenCalled();
    expect(strokeSpy).not.toHaveBeenCalled();
  });

  it('should re-read vizId and primitive on every update (lazy accessors)', () => {
    let currentId: string | undefined = 'viz-A';
    let currentPrimitive: PrimitiveFilter = POLYGON;
    const handle = useClassification(
      () => currentId,
      () => currentPrimitive,
      'fill'
    );
    handle.update({ method: ClassificationMethod.JENKS });
    currentId = 'viz-B';
    currentPrimitive = POINT;
    handle.update({ method: ClassificationMethod.QUANTILES });
    expect(fillSpy).toHaveBeenNthCalledWith(1, 'viz-A', POLYGON, {
      method: ClassificationMethod.JENKS
    });
    expect(fillSpy).toHaveBeenNthCalledWith(2, 'viz-B', POINT, {
      method: ClassificationMethod.QUANTILES
    });
  });
});
