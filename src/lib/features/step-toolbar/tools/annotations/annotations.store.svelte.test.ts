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
      x: 48,
      y: 48
    });
    expect(itemsByRole.get(ANNOTATION_ROLE.SUBTITLE)?.position).toEqual({
      x: 48,
      y: 72
    });
    expect(itemsByRole.get(ANNOTATION_ROLE.SOURCE)?.position).toEqual({
      x: 576,
      y: 456
    });
    expect(itemsByRole.get(ANNOTATION_ROLE.CREDIT)?.position).toEqual({
      x: 576,
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
    expect(itemsByRole.get(ANNOTATION_ROLE.TITLE)?.style?.textAlign).toBe(
      TextAlign.Left
    );
    expect(itemsByRole.get(ANNOTATION_ROLE.SUBTITLE)?.style?.textAlign).toBe(
      TextAlign.Left
    );
  });

  it('reconciles legacy auto-positioned title and subtitle from center to left alignment', () => {
    annotationsActions.initPageElements({ withPlaceholders: true });

    const title = getAnnotationsState().items.find(
      (item) => item.role === ANNOTATION_ROLE.TITLE
    );
    const subtitle = getAnnotationsState().items.find(
      (item) => item.role === ANNOTATION_ROLE.SUBTITLE
    );

    expect(title).toBeDefined();
    expect(subtitle).toBeDefined();
    if (!title || !subtitle) {
      return;
    }

    annotationsActions.updateAnnotation(title.id, {
      style: { ...title.style, textAlign: TextAlign.Center }
    });
    annotationsActions.updateAnnotation(subtitle.id, {
      style: { ...subtitle.style, textAlign: TextAlign.Center }
    });

    annotationsActions.initPageElements({ withPlaceholders: true });

    const reconciledTitle = getAnnotationsState().items.find(
      (item) => item.id === title.id
    );
    const reconciledSubtitle = getAnnotationsState().items.find(
      (item) => item.id === subtitle.id
    );

    expect(reconciledTitle?.style?.textAlign).toBe(TextAlign.Left);
    expect(reconciledSubtitle?.style?.textAlign).toBe(TextAlign.Left);
  });

  it('preserves explicit textAlign on manually positioned title and subtitle', () => {
    annotationsActions.initPageElements({ withPlaceholders: true });

    const title = getAnnotationsState().items.find(
      (item) => item.role === ANNOTATION_ROLE.TITLE
    );

    expect(title).toBeDefined();
    if (!title) {
      return;
    }

    annotationsActions.moveAnnotation(title.id, { x: 200, y: 200 });
    annotationsActions.updateAnnotation(title.id, {
      style: { ...title.style, textAlign: TextAlign.Center }
    });

    annotationsActions.initPageElements({ withPlaceholders: true });

    const reconciledTitle = getAnnotationsState().items.find(
      (item) => item.id === title.id
    );

    expect(reconciledTitle?.positionMode).toBe('manual');
    expect(reconciledTitle?.style?.textAlign).toBe(TextAlign.Center);
  });

  it('spawns added text notes in the bottom-right map frame stack', () => {
    annotationsActions.initPageElements({ withPlaceholders: true });
    annotationsActions.addAnnotation(AnnotationKind.TEXT, 'Manual note');

    const note = getAnnotationsState().items.find(
      (item) => item.role === ANNOTATION_ROLE.NOTE
    );

    expect(note?.position).toEqual({ x: 576, y: 432 });
    expect(note?.coordinateSpace).toBe('page');
    expect(note?.positionMode).toBe('manual');
  });

  it('clamps manually moved page elements inside the map frame', () => {
    formatActions.toggleGrid();
    annotationsActions.initPageElements({ withPlaceholders: true });

    const title = getAnnotationsState().items.find(
      (item) => item.role === ANNOTATION_ROLE.TITLE
    );

    expect(title).toBeDefined();
    if (!title) {
      return;
    }

    annotationsActions.moveAnnotation(title.id, { x: 0, y: 0 });

    const movedTitle = getAnnotationsState().items.find(
      (item) => item.id === title.id
    );

    expect(movedTitle?.position).toEqual({ x: 32, y: 32 });
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

  it('keeps legacy annotations without coordinateSpace in map space when moved', () => {
    annotationsActions.setState({
      items: [
        {
          id: 'legacy-shape',
          type: AnnotationKind.SHAPE,
          content: SHAPE_TYPE.ARROW,
          position: { x: 12, y: 24 },
          style: { shapeWidth: 120, shapeHeight: 60 }
        }
      ]
    });

    annotationsActions.moveAnnotation('legacy-shape', { x: 40, y: 72 });

    const [legacyShape] = getAnnotationsState().items;

    expect(legacyShape.coordinateSpace).toBe('map');
    expect(legacyShape.position).toEqual({ x: 36, y: 72 });
  });

  it('starts placement without spawning the annotation until commit', () => {
    annotationsActions.beginPlacement(AnnotationKind.SHAPE, SHAPE_TYPE.ARROW);

    const placingState = getAnnotationsState();

    expect(placingState.items).toHaveLength(0);
    expect(placingState.creationMode).toBe('placing');
    expect(placingState.pendingType).toBe(AnnotationKind.SHAPE);
    expect(placingState.pendingStyle?.shapeWidth).toBe(120);
    expect(placingState.pendingStyle?.shapeHeight).toBe(60);

    annotationsActions.updatePlacement({
      coordinateSpace: 'page',
      type: AnnotationKind.SHAPE,
      position: { x: 96, y: 128 },
      size: { width: 140, height: 70 },
      content: SHAPE_TYPE.ARROW,
      style: { rotation: 15 }
    });

    const createdShape = annotationsActions.commitPlacement();

    expect(createdShape).toBeTruthy();
    expect(createdShape?.coordinateSpace).toBe('page');
    expect(createdShape?.position).toEqual({ x: 96, y: 128 });
    expect(createdShape?.style?.shapeWidth).toBe(140);
    expect(createdShape?.style?.shapeHeight).toBe(70);
    expect(createdShape?.style?.rotation).toBe(15);
    expect(getAnnotationsState().creationMode).toBe('idle');
    expect(getAnnotationsState().items).toHaveLength(1);
  });

  it('cancels placement without creating a shape or image', () => {
    annotationsActions.beginPlacement(
      AnnotationKind.IMAGE,
      'data:image/svg+xml;base64,PHN2Zy8+'
    );
    annotationsActions.updatePlacement({
      coordinateSpace: 'page',
      type: AnnotationKind.IMAGE,
      position: { x: 32, y: 48 },
      size: { width: 120, height: 120 },
      content: 'data:image/svg+xml;base64,PHN2Zy8+'
    });

    annotationsActions.cancelPlacement();

    expect(getAnnotationsState().creationMode).toBe('idle');
    expect(getAnnotationsState().pendingType).toBeNull();
    expect(getAnnotationsState().previewGeometry).toBeNull();
    expect(getAnnotationsState().items).toHaveLength(0);
  });

  it('keeps zone drawings in progress until at least three points exist', () => {
    annotationsActions.beginDrawing(DrawingType.ZONE);
    annotationsActions.updateDrawing([
      { x: 0, y: 0 },
      { x: 80, y: 24 }
    ]);

    annotationsActions.finishDrawing();

    expect(getAnnotationsState().creationMode).toBe('drawing');
    expect(getAnnotationsState().drawingInProgress).toHaveLength(2);
    expect(
      getAnnotationsState().items.filter(
        (item) => item.type === AnnotationKind.DRAWING
      )
    ).toHaveLength(0);
  });

  it('stores the default smoothing value on finished freehand drawings', () => {
    annotationsActions.beginDrawing(DrawingType.LINE);
    annotationsActions.updateDrawing([
      { x: 0, y: 0 },
      { x: 32, y: 4 },
      { x: 36, y: 72 },
      { x: 88, y: 76 }
    ]);

    const drawing = annotationsActions.finishDrawing();

    expect(drawing?.style?.smoothness).toBe(0);
  });
});
