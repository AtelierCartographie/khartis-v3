import { beforeEach, describe, expect, it, vi } from 'vitest';
import { geoEquirectangular } from 'd3-geo';
import type { ProjectionLike } from '@ateliercartographie/geoarrow-deck-stream';
import type { BasemapMetadata } from '../types/basemap.types';

const mocks = vi.hoisted(() => ({
  fitProjectionToBbox: vi.fn()
}));

vi.mock(
  '$lib/features/commons/utils/projection.utils',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('$lib/features/commons/utils/projection.utils')
    >()),
    fitProjectionToBbox: mocks.fitProjectionToBbox
  })
);

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

  it('registers a structured-cloneable worker spec for a reactive fit bbox', async () => {
    const { fitBasemapRenderProjection } =
      await import('./fit-basemap-render-projection.utils');
    const { getProjectionSpec } =
      await import('./geoarrow-stream-bridge.utils');
    const projection = geoEquirectangular();
    const fitBbox = $state<[number, number, number, number]>([0, 0, 5, 1]);

    fitBasemapRenderProjection({
      projection,
      metadata: {
        proj_to: { type: 'simple', proj4: '+proj=natearth2' }
      } as BasemapMetadata,
      fitBbox,
      width: 800,
      height: 600,
      padding: 40
    });

    expect(() => structuredClone(getProjectionSpec(projection))).not.toThrow();
  });

  it('leaves composite projections unchanged', async () => {
    // Composite presets (e.g. FRANCE_DOM_TOM) expose no `fitExtent` — each
    // sub-projection is already fitted to its fixed layout cell — so they must
    // not be re-fitted here, otherwise the DOM-TOM insets would be disturbed.
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

  it('frames a regional basemap with a 10% margin around its projected bbox', async () => {
    const { fitBasemapRenderProjection } =
      await import('./fit-basemap-render-projection.utils');
    const { getProjectionSpec } =
      await import('./geoarrow-stream-bridge.utils');
    const projection = geoEquirectangular().scale(100).translate([0, 0]);
    const degree = (100 * Math.PI) / 180;

    fitBasemapRenderProjection({
      projection,
      metadata: {
        bbox: [0, 0, 10, 5],
        proj_to: { type: 'simple', proj4: '+proj=eqc' }
      } as BasemapMetadata,
      fitBbox: [0, 0, 10, 5],
      width: 800,
      height: 600,
      padding: 40
    });

    const frame = projection.clipExtent();
    expect(frame?.[0][0]).toBeCloseTo(-1 * degree, 6);
    expect(frame?.[0][1]).toBeCloseTo(-5.5 * degree, 6);
    expect(frame?.[1][0]).toBeCloseTo(11 * degree, 6);
    expect(frame?.[1][1]).toBeCloseTo(0.5 * degree, 6);
    expect(getProjectionSpec(projection)).toMatchObject({
      params: { clipExtent: frame }
    });
  });

  it('keeps the sphere of a world basemap unframed', async () => {
    const { fitBasemapRenderProjection } =
      await import('./fit-basemap-render-projection.utils');
    const projection = geoEquirectangular();

    fitBasemapRenderProjection({
      projection,
      metadata: {
        bbox: [-180, -90, 180, 90],
        proj_to: { type: 'simple', proj4: '+proj=eqearth' }
      } as BasemapMetadata,
      fitBbox: [-170, -60, 170, 80],
      width: 800,
      height: 600,
      padding: 40
    });

    expect(projection.clipExtent()).toBeNull();
  });
});
