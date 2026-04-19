import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectionLike } from 'geoarrow-deck-stream';
import type { BasemapMetadata } from '../types/basemap.types';

const mocks = vi.hoisted(() => ({
  fitProjectionToBbox: vi.fn()
}));

vi.mock('$lib/features/commons/utils/projection.utils', () => ({
  fitProjectionToBbox: mocks.fitProjectionToBbox
}));

describe('fitBasemapRenderProjection', () => {
  beforeEach(() => {
    mocks.fitProjectionToBbox.mockReset();
  });

  it('fits simple basemap projections to the requested bbox', async () => {
    const { fitBasemapRenderProjection } =
      await import('./fit-basemap-render-projection.utils');
    const projection = {
      fitExtent: vi.fn()
    } as unknown as ProjectionLike;

    const result = fitBasemapRenderProjection({
      projection,
      metadata: {
        proj_to: { type: 'simple', proj4: '+proj=natearth2' }
      } as BasemapMetadata,
      fitBbox: [0, 0, 5, 1],
      width: 800,
      height: 600,
      padding: 40
    });

    expect(result).toBe(projection);
    expect(mocks.fitProjectionToBbox).toHaveBeenCalledWith(
      projection,
      [0, 0, 5, 1],
      800,
      600,
      40
    );
  });

  it('leaves composite projections unchanged', async () => {
    const { fitBasemapRenderProjection } =
      await import('./fit-basemap-render-projection.utils');
    const projection = {
      fitExtent: vi.fn()
    } as unknown as ProjectionLike;

    const result = fitBasemapRenderProjection({
      projection,
      metadata: {
        proj_to: { type: 'composite', preset: 'FRANCE_DOM_TOM' }
      } as BasemapMetadata,
      fitBbox: [0, 0, 5, 1],
      width: 800,
      height: 600,
      padding: 40
    });

    expect(result).toBe(projection);
    expect(mocks.fitProjectionToBbox).not.toHaveBeenCalled();
  });
});
