import { beforeEach, describe, expect, it } from 'vitest';
import { ANNOTATION_ROLE, SHAPE_TYPE } from '$lib/features/commons/constants';
import {
  AnnotationKind,
  DrawingType,
  FormatMode,
  PageModel
} from '$lib/features/commons/constants/ui.constants';
import { TextAlign } from '$lib/features/commons/types/enums';
import { formatActions } from '$lib/features/step-toolbar/tools/format/format.store.svelte';
import {
  annotationsActions,
  getAnnotationsState
} from './annotations.store.svelte';

describe('annotations store', () => {
  beforeEach(() => {
    formatActions.reset();
    annotationsActions.reset();
  });

  it('preserves manually moved page elements when the layout is redistributed', () => {
    annotationsActions.initPageElements({ withPlaceholders: true });

    const title = getAnnotationsState().items.find(
      (item) => item.role === ANNOTATION_ROLE.TITLE
    );

    expect(title).toBeDefined();
    if (!title) {
      return;
    }

    annotationsActions.moveAnnotation(title.id, { x: 120, y: 168 });
    annotationsActions.redistributePageElements({
      width: 1200,
      height: 900,
      margins: {
        top: 40,
        right: 40,
        bottom: 40,
        left: 40
      }
    });

    const movedTitle = getAnnotationsState().items.find(
      (item) => item.id === title.id
    );

    expect(movedTitle?.position).toEqual({ x: 120, y: 168 });
    expect(movedTitle?.positionMode).toBe('manual');
  });

  it('syncs the predefined style when selecting a title page element', () => {
    annotationsActions.initPageElements({ withPlaceholders: true });

    const title = getAnnotationsState().items.find(
      (item) => item.role === ANNOTATION_ROLE.TITLE
    );

    expect(title).toBeDefined();
    if (!title) {
      return;
    }

    annotationsActions.selectAnnotation(title.id);

    expect(getAnnotationsState().predefinedStyle).toBe(ANNOTATION_ROLE.TITLE);
  });

  it('places the default page elements with more breathing room around the map frame', () => {
    annotationsActions.initPageElements({ withPlaceholders: true });

    const itemsByRole = new Map(
      getAnnotationsState()
        .items.filter((item) => item.role)
        .map((item) => [item.role, item])
    );

    expect(itemsByRole.get(ANNOTATION_ROLE.TITLE)?.position).toEqual({
      x: 44,
      y: 44
    });
    expect(itemsByRole.get(ANNOTATION_ROLE.SUBTITLE)?.position).toEqual({
      x: 44,
      y: 68
    });
    expect(itemsByRole.get(ANNOTATION_ROLE.SOURCE)?.position).toEqual({
      x: 564,
      y: 456
    });
    expect(itemsByRole.get(ANNOTATION_ROLE.CREDIT)?.position).toEqual({
      x: 564,
      y: 528
    });
    expect(itemsByRole.get(ANNOTATION_ROLE.SOURCE)?.style?.textAlign).toBe(
      TextAlign.Right
    );
    expect(
      itemsByRole.get(ANNOTATION_ROLE.BASEMAP_SOURCE)?.style?.textAlign
    ).toBe(TextAlign.Right);
    expect(itemsByRole.get(ANNOTATION_ROLE.SIGNATURE)?.style?.textAlign).toBe(
      TextAlign.Right
    );
    expect(itemsByRole.get(ANNOTATION_ROLE.CREDIT)?.style?.textAlign).toBe(
      TextAlign.Right
    );
  });

  it('uses the custom page sizing profile when page elements are initialized', () => {
    formatActions.setModel(PageModel.SCREEN_LANDSCAPE);
    formatActions.setMode(FormatMode.CUSTOM);
    formatActions.setSize(680, 680);

    annotationsActions.initPageElements({ withPlaceholders: true });

    const title = getAnnotationsState().items.find(
      (item) => item.role === ANNOTATION_ROLE.TITLE
    );

    expect(title?.style?.fontSize).toBe(14);
  });

  it('spawns the first free text annotation in a neutral page zone', () => {
    annotationsActions.addAnnotation(AnnotationKind.TEXT, 'Free text');

    const annotation = getAnnotationsState().items.find(
      (item) =>
        item.role === ANNOTATION_ROLE.NOTE && item.type === AnnotationKind.TEXT
    );

    expect(annotation).toBeDefined();
    expect(annotation?.position).toEqual({ x: 624, y: 0 });
  });

  it('spawns the first image annotation clear of the left tool panel', () => {
    annotationsActions.addAnnotation(
      AnnotationKind.IMAGE,
      'data:image/svg+xml;base64,PHN2Zy8+'
    );

    const annotation = getAnnotationsState().items.find(
      (item) => item.role == null && item.type === AnnotationKind.IMAGE
    );

    expect(annotation).toBeDefined();
    expect(annotation?.position).toEqual({ x: 72, y: 24 });
  });

  it('keeps zone drawings in progress until at least three points exist', () => {
    annotationsActions.startDrawingMode(DrawingType.ZONE);
    annotationsActions.setDrawingInProgress([
      { x: 0, y: 0 },
      { x: 80, y: 24 }
    ]);

    annotationsActions.finalizeDrawingMode();

    expect(getAnnotationsState().isDrawingMode).toBe(true);
    expect(getAnnotationsState().drawingInProgress).toHaveLength(2);
    expect(
      getAnnotationsState().items.filter(
        (item) => item.type === AnnotationKind.DRAWING
      )
    ).toHaveLength(0);
  });

  it('initializes new arrow shapes with the canonical default size', () => {
    annotationsActions.addAnnotation(AnnotationKind.SHAPE, SHAPE_TYPE.ARROW);

    const shape = getAnnotationsState().items.find(
      (item) => item.type === AnnotationKind.SHAPE
    );

    expect(shape?.style?.shapeWidth).toBe(120);
    expect(shape?.style?.shapeHeight).toBe(60);
  });
});
