import {
  AnnotationKind,
  DrawingType
} from '$lib/features/commons/constants/ui.constants';
import {
  formatActions,
  getFormatState,
  PAGE_GRID_SIZE_PX
} from '$lib/features/step-toolbar/tools/format/format.store.svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/features/map/services/basemap.service.svelte', () => ({
  basemapService: {
    currentBasemap: null
  }
}));

const { annotationsActions, getAnnotationsState } =
  await import('./annotations.store.svelte');

describe('annotations grid magnetism', () => {
  beforeEach(() => {
    formatActions.reset();
    annotationsActions.reset();
  });

  it('uses black text color by default', () => {
    expect(getAnnotationsState().defaultStyle.color).toBe('#000000');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('places new text annotations on the right side and snaps to grid', () => {
    annotationsActions.addAnnotation(AnnotationKind.TEXT, 'Demo');

    const state = getAnnotationsState();
    const created = state.items[0];
    const format = getFormatState();
    const mapWidth = Math.max(
      1,
      format.width - format.margins.left - format.margins.right
    );

    expect(created).toBeDefined();
    expect(created.position.x).toBeGreaterThan(mapWidth / 2);
    expect(created.position.x % PAGE_GRID_SIZE_PX).toBe(0);
    expect(created.position.y % PAGE_GRID_SIZE_PX).toBe(0);
  });

  it('does not create text annotation when content is empty', () => {
    annotationsActions.addAnnotation(AnnotationKind.TEXT, '   ');

    expect(getAnnotationsState().items).toHaveLength(0);
    expect(getAnnotationsState().selectedId).toBeNull();
  });

  it('stacks new annotations to avoid overlap in a single column first', () => {
    annotationsActions.addAnnotation(AnnotationKind.TEXT, 'A');
    annotationsActions.addAnnotation(AnnotationKind.SHAPE, 'rectangle');

    const [first, second] = getAnnotationsState().items;

    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(second.position.y).toBeGreaterThan(first.position.y);
    expect(second.position.y - first.position.y).toBeGreaterThanOrEqual(
      PAGE_GRID_SIZE_PX * 3
    );
  });

  it('supports global annotations visibility toggle', () => {
    expect(getAnnotationsState().visible).toBe(true);

    annotationsActions.setVisibility(false);
    expect(getAnnotationsState().visible).toBe(false);

    annotationsActions.setVisibility(true);
    expect(getAnnotationsState().visible).toBe(true);
  });

  it('snaps dragged annotations to the grid when enabled', () => {
    annotationsActions.addAnnotation(AnnotationKind.TEXT, 'Drag me');
    const id = getAnnotationsState().items[0]?.id;

    expect(id).toBeDefined();
    if (!id) {
      throw new Error('Expected annotation id to be defined');
    }

    annotationsActions.moveAnnotation(id, { x: 37, y: 53 });

    const moved = getAnnotationsState().items[0];
    expect(moved.position).toEqual({ x: 48, y: 48 });
  });

  it('keeps free movement when grid is disabled', () => {
    annotationsActions.addAnnotation(AnnotationKind.TEXT, 'No grid');
    const id = getAnnotationsState().items[0]?.id;

    expect(id).toBeDefined();
    if (!id) {
      throw new Error('Expected annotation id to be defined');
    }

    formatActions.toggleGrid();
    annotationsActions.moveAnnotation(id, { x: 37, y: 53 });

    const moved = getAnnotationsState().items[0];
    expect(moved.position).toEqual({ x: 37, y: 53 });
  });

  it('creates drawing annotations with points payload and drawing style', () => {
    annotationsActions.addAnnotation(AnnotationKind.DRAWING, DrawingType.ZONE);

    const created = getAnnotationsState().items[0];

    expect(created).toBeDefined();
    expect(Array.isArray(created.content)).toBe(true);
    expect((created.content as Array<{ x: number; y: number }>).length).toBe(4);
    expect(created.style?.drawingType).toBe(DrawingType.ZONE);
  });

  it('duplicates non-text annotations without corrupting their payload', () => {
    annotationsActions.addAnnotation(AnnotationKind.SHAPE, 'line');

    const originalId = getAnnotationsState().items[0]?.id;
    if (!originalId) {
      throw new Error('Expected original annotation id to be defined');
    }

    annotationsActions.duplicateAnnotation(originalId);

    const [, duplicated] = getAnnotationsState().items;
    expect(duplicated).toBeDefined();
    expect(duplicated.content).toBe('line');
  });

  it('aligns auto-created page elements to the grid when enabled', () => {
    annotationsActions.initPageElements({
      withPlaceholders: true,
      visible: true
    });

    const items = getAnnotationsState().items.filter(
      (item) => item.role != null
    );

    expect(items.length).toBeGreaterThan(0);
    expect(
      items.every(
        (item) =>
          item.position.x % PAGE_GRID_SIZE_PX === 0 &&
          item.position.y % PAGE_GRID_SIZE_PX === 0
      )
    ).toBe(true);
  });

  it('keeps bottom-right credits off the last grid row with one grid gap', () => {
    annotationsActions.initPageElements({
      withPlaceholders: true,
      visible: true
    });

    const items = getAnnotationsState().items;
    const basemapSource = items.find((item) => item.role === 'basemap_source');
    const credit = items.find((item) => item.role === 'credit');

    expect(basemapSource).toBeDefined();
    expect(credit).toBeDefined();

    if (!basemapSource || !credit) {
      throw new Error('Expected basemap source and credit annotations');
    }

    expect(credit.position.x).toBe(basemapSource.position.x);
    expect(credit.position.y - basemapSource.position.y).toBe(
      PAGE_GRID_SIZE_PX * 2
    );

    const format = getFormatState();
    const minY = format.margins.top + 12;
    const maxY = Math.max(minY, format.height - format.margins.bottom - 4);
    const lastGridRowY =
      Math.floor(maxY / PAGE_GRID_SIZE_PX) * PAGE_GRID_SIZE_PX;

    expect(lastGridRowY - credit.position.y).toBeGreaterThanOrEqual(
      PAGE_GRID_SIZE_PX
    );
  });

  it('applyStyle updates both defaultStyle and the selected annotation', () => {
    annotationsActions.addAnnotation(AnnotationKind.TEXT, 'Styled');
    const id = getAnnotationsState().items[0]?.id;

    expect(id).toBeDefined();
    if (!id) throw new Error('Expected annotation id');

    annotationsActions.selectAnnotation(id);
    annotationsActions.applyStyle({ opacity: 50, bold: true });

    const state = getAnnotationsState();
    const item = state.items.find((i) => i.id === id);

    expect(state.defaultStyle.opacity).toBe(50);
    expect(state.defaultStyle.bold).toBe(true);
    expect(item?.style?.opacity).toBe(50);
    expect(item?.style?.bold).toBe(true);
  });

  it('applyStyle only updates defaultStyle when no annotation is selected', () => {
    annotationsActions.addAnnotation(AnnotationKind.TEXT, 'Before');
    const id = getAnnotationsState().items[0]?.id;

    expect(id).toBeDefined();
    if (!id) throw new Error('Expected annotation id');

    annotationsActions.selectAnnotation(null);
    annotationsActions.applyStyle({ fontSize: 32 });

    const state = getAnnotationsState();
    const item = state.items.find((i) => i.id === id);

    expect(state.defaultStyle.fontSize).toBe(32);
    expect(item?.style?.fontSize).toBe(12);
  });

  it('keeps original layout positions when grid is disabled before init', () => {
    formatActions.toggleGrid();
    annotationsActions.initPageElements({
      withPlaceholders: true,
      visible: true
    });

    const items = getAnnotationsState().items.filter(
      (item) => item.role != null
    );
    const hasOffGridPosition = items.some(
      (item) =>
        item.position.x % PAGE_GRID_SIZE_PX !== 0 ||
        item.position.y % PAGE_GRID_SIZE_PX !== 0
    );

    expect(items.length).toBeGreaterThan(0);
    expect(hasOffGridPosition).toBe(true);
  });
});
