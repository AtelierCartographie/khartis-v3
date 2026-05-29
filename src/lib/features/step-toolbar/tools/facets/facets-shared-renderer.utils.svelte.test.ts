import { describe, expect, it } from 'vitest';
import {
  FACET_TITLE_HEIGHT,
  buildFacetRenderDescriptors,
  buildFacetsGridMetrics
} from './facets-shared-renderer.utils';

describe('facets shared renderer utils', () => {
  it('builds centered grid metrics for the available viewport', () => {
    const metrics = buildFacetsGridMetrics({
      mapCount: 4,
      layout: { columns: 2, gap: 16 },
      containerWidth: 800,
      containerHeight: 600,
      pageAspectRatio: 0.75
    });

    expect(metrics.columns).toBe(2);
    expect(metrics.rows).toBe(2);
    expect(metrics.cellWidth).toBeGreaterThan(0);
    expect(metrics.cellHeight).toBeGreaterThan(0);
    expect(metrics.originX).toBeGreaterThanOrEqual(16);
    expect(metrics.originY).toBeGreaterThanOrEqual(16);
  });

  it('creates one descriptor per facet with stable view ids and map frames', () => {
    const descriptors = buildFacetRenderDescriptors({
      visualizations: [
        { id: 'facet-a', name: 'Population' },
        { id: 'facet-b', name: 'GDP' },
        { id: 'facet-c', name: 'Density' }
      ] as never,
      layout: { columns: 2, gap: 16 },
      containerWidth: 900,
      containerHeight: 700,
      pageAspectRatio: 0.75
    });

    expect(descriptors).toHaveLength(3);
    expect(descriptors[0]).toMatchObject({
      facetId: 'facet-a',
      vizId: 'facet-a',
      title: 'Population',
      viewId: 'facet-view-facet-a'
    });
    expect(descriptors[1].frame.x).toBeGreaterThan(descriptors[0].frame.x);
    expect(descriptors[2].frame.y).toBeGreaterThanOrEqual(
      descriptors[0].frame.y + FACET_TITLE_HEIGHT
    );
  });

  it('keeps the grid within the container so the last column is never clipped', () => {
    // A width-constrained layout used to let gridWidth reach containerWidth and
    // overflow the right edge by the wrapper padding, clipping the last facet.
    const containerWidth = 987;
    const metrics = buildFacetsGridMetrics({
      mapCount: 2,
      layout: { columns: 2, gap: 16 },
      containerWidth,
      containerHeight: 700,
      pageAspectRatio: 0.75
    });

    expect(metrics.originX + metrics.gridWidth).toBeLessThanOrEqual(
      containerWidth
    );

    const descriptors = buildFacetRenderDescriptors({
      visualizations: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' }
      ] as never,
      layout: { columns: 2, gap: 16 },
      containerWidth,
      containerHeight: 700,
      pageAspectRatio: 0.75
    });

    for (const descriptor of descriptors) {
      expect(descriptor.frame.x + descriptor.frame.width).toBeLessThanOrEqual(
        containerWidth
      );
    }
  });
});
