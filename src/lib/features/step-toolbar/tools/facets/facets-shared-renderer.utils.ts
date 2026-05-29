import type { VisualizationConfig } from '$lib/features/commons/stores/visualization.store.svelte';
import type { FacetsLayout } from './facets.store.svelte';

export const FACET_TITLE_HEIGHT = 28;
export const FACET_MIN_CELL = 80;
export const FACETS_WRAPPER_PADDING = 16;

export interface FacetRenderFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FacetRenderDescriptor {
  facetId: string;
  vizId: string;
  title: string;
  frame: FacetRenderFrame;
  viewId: string;
}

export interface FacetsGridMetrics {
  cellWidth: number;
  cellHeight: number;
  columns: number;
  rows: number;
  gridWidth: number;
  gridHeight: number;
  originX: number;
  originY: number;
}

function clampToPositiveInteger(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

export function buildFacetsGridMetrics({
  mapCount,
  layout,
  containerWidth,
  containerHeight,
  pageAspectRatio
}: {
  mapCount: number;
  layout: FacetsLayout;
  containerWidth: number;
  containerHeight: number;
  pageAspectRatio: number;
}): FacetsGridMetrics {
  const totalMaps = Math.max(0, mapCount);
  const columns = Math.max(1, Math.min(layout.columns, totalMaps || 1));
  const rows = totalMaps > 0 ? Math.ceil(totalMaps / columns) : 1;
  // The grid is centered inside the content box (container minus the wrapper
  // padding), so column/row sizing must start from that same content box —
  // otherwise gridWidth can reach containerWidth, exceed contentWidth, and the
  // last column overflows the canvas on the right (facet rendered clipped).
  const contentWidth = Math.max(1, containerWidth - FACETS_WRAPPER_PADDING * 2);
  const contentHeight = Math.max(
    1,
    containerHeight - FACETS_WRAPPER_PADDING * 2
  );
  const availableWidth = contentWidth - (columns - 1) * layout.gap;
  const availableHeight =
    contentHeight - (rows - 1) * layout.gap - FACET_TITLE_HEIGHT * rows;

  const widthPerColumn = Math.max(
    FACET_MIN_CELL,
    Math.floor(availableWidth / columns)
  );
  const heightPerRow = Math.max(
    FACET_MIN_CELL,
    Math.floor(availableHeight / rows)
  );
  const aspectRatio = pageAspectRatio > 0 ? pageAspectRatio : 0.75;
  const constrainedByHeight = Math.floor(heightPerRow / aspectRatio);
  const constrainedByWidth = Math.floor(widthPerColumn * aspectRatio);
  const cellWidth = Math.min(widthPerColumn, constrainedByHeight);
  const cellHeight = Math.min(heightPerRow, constrainedByWidth);
  const gridWidth = columns * cellWidth + (columns - 1) * layout.gap;
  const gridHeight =
    rows * (cellHeight + FACET_TITLE_HEIGHT) + (rows - 1) * layout.gap;

  return {
    cellWidth,
    cellHeight,
    columns,
    rows,
    gridWidth,
    gridHeight,
    originX:
      FACETS_WRAPPER_PADDING + Math.max(0, (contentWidth - gridWidth) / 2),
    originY:
      FACETS_WRAPPER_PADDING + Math.max(0, (contentHeight - gridHeight) / 2)
  };
}

export function buildFacetRenderDescriptors({
  visualizations,
  layout,
  containerWidth,
  containerHeight,
  pageAspectRatio
}: {
  visualizations: VisualizationConfig[];
  layout: FacetsLayout;
  containerWidth: number;
  containerHeight: number;
  pageAspectRatio: number;
}): FacetRenderDescriptor[] {
  const metrics = buildFacetsGridMetrics({
    mapCount: visualizations.length,
    layout,
    containerWidth,
    containerHeight,
    pageAspectRatio
  });

  return visualizations.map((visualization, index) => {
    const column = index % metrics.columns;
    const row = Math.floor(index / metrics.columns);
    const x = clampToPositiveInteger(
      metrics.originX + column * (metrics.cellWidth + layout.gap),
      metrics.originX
    );
    const y = clampToPositiveInteger(
      metrics.originY +
        row * (metrics.cellHeight + FACET_TITLE_HEIGHT + layout.gap) +
        FACET_TITLE_HEIGHT,
      metrics.originY + FACET_TITLE_HEIGHT
    );

    return {
      facetId: visualization.id,
      vizId: visualization.id,
      title: visualization.name,
      frame: {
        x,
        y,
        width: metrics.cellWidth,
        height: metrics.cellHeight
      },
      viewId: `facet-view-${visualization.id}`
    };
  });
}
