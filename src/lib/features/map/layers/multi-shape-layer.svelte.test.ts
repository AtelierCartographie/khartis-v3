import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ShapeTypeOrdinal,
  LINEAR_SHAPE_ORDINALS,
  MultiShapeLayer
} from './multi-shape-layer';

const source = readFileSync(
  resolve(import.meta.dirname, 'multi-shape-layer.ts'),
  'utf8'
);

describe('MultiShapeLayer — ShapeTypeOrdinal mapping', () => {
  it('assigns stable ordinals to every shape (keep in sync with SDF shader branches)', () => {
    expect(ShapeTypeOrdinal.CIRCLE).toBe(0);
    expect(ShapeTypeOrdinal.SQUARE).toBe(1);
    expect(ShapeTypeOrdinal.BAR).toBe(2);
    expect(ShapeTypeOrdinal.SPIKE).toBe(3);
    expect(ShapeTypeOrdinal.CROSS).toBe(4);
    expect(ShapeTypeOrdinal.DIAMOND).toBe(5);
    expect(ShapeTypeOrdinal.TRIANGLE).toBe(6);
    expect(ShapeTypeOrdinal.STAR).toBe(7);
    expect(ShapeTypeOrdinal.RECTANGLE).toBe(8);
  });

  it('marks BAR and SPIKE as linear-only shapes (restricted to PROPORTIONAL/CLASSES)', () => {
    expect(LINEAR_SHAPE_ORDINALS).toContain(ShapeTypeOrdinal.BAR);
    expect(LINEAR_SHAPE_ORDINALS).toContain(ShapeTypeOrdinal.SPIKE);
    expect(LINEAR_SHAPE_ORDINALS).not.toContain(ShapeTypeOrdinal.CIRCLE);
    expect(LINEAR_SHAPE_ORDINALS).not.toContain(ShapeTypeOrdinal.SQUARE);
  });
});

describe('MultiShapeLayer — class contract', () => {
  it('extends deck.gl ScatterplotLayer to share ID/update lifecycle', () => {
    expect(MultiShapeLayer.layerName).toBe('MultiShapeLayer');
    expect(typeof MultiShapeLayer.defaultProps).toBe('object');
  });

  it('declares getShape, barWidth, offsetX, offsetY, halfMask, shapeScale, dash and pattern defaults', () => {
    const props = MultiShapeLayer.defaultProps as Record<string, unknown>;
    expect(props.getShape).toMatchObject({ type: 'accessor', value: 0 });
    expect(props.barWidth).toMatchObject({ type: 'number', value: 6 });
    expect(props.offsetX).toMatchObject({ type: 'number', value: 0 });
    expect(props.offsetY).toMatchObject({ type: 'number', value: 0 });
    expect(props.halfMask).toMatchObject({ type: 'number', value: 0 });
    expect(props.shapeScale).toMatchObject({ type: 'number', value: 1 });
    expect(props.dashed).toMatchObject({ type: 'boolean', value: false });
    expect(props.dashLength).toMatchObject({ type: 'number', value: 3 });
    expect(props.gapLength).toMatchObject({ type: 'number', value: 2 });
    expect(props.patternEnabled).toMatchObject({
      type: 'boolean',
      value: false
    });
    expect(props.patternType).toMatchObject({ type: 'number', value: 1 });
  });
});

describe('MultiShapeLayer — source invariants (keep SDF shader consistent)', () => {
  it('calibrates 2D shapes against the stock ScatterplotLayer circle', () => {
    // Quad scaled by 1/SYMBOL_SDF_EXTENT for 2D shapes only, and the SDF
    // circle is authored at SYMBOL_SDF_EXTENT of the quad — one constant.
    expect(source).toContain('outerRadiusPixels /= ${SYMBOL_SDF_EXTENT};');
    expect(source).toContain(
      'return (length(uv) - ${SYMBOL_SDF_EXTENT}) * radiusPixels + radiusPixels;'
    );
  });

  it('anchors linear shapes (BAR/SPIKE) at their base in the vertex shader', () => {
    // The condition is generated from LINEAR_SHAPE_ORDINALS — one source of truth.
    expect(source).toContain('bool isBottomAnchoredShape(float shape)');
    expect(source).toContain('return ${LINEAR_SHAPE_GLSL_CONDITION};');
    // Quad lift applied in both billboard (pixels) and map-space branches.
    expect(source).toContain('offset.y += anchorShiftPixels;');
    expect(source).toContain(
      'offset.y += project_pixel_size(anchorShiftPixels);'
    );
  });

  it('keeps triangle symbols oriented like the UI and legend', () => {
    const triangleBlock = source.match(
      /case \$\{ShapeTypeOrdinal\.TRIANGLE\}: \/\/ TRIANGLE[\s\S]*?case \$\{ShapeTypeOrdinal\.STAR\}: \/\/ STAR/
    )?.[0];

    expect(triangleBlock).toBeDefined();
    expect(triangleBlock).toContain('return sdEquilateralTriangle(pos, r)');
    expect(triangleBlock).not.toContain('vec2(pos.x, -pos.y)');
  });
});
