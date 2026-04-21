import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ShapeTypeOrdinal,
  LINEAR_SHAPE_ORDINALS,
  isLinearShapeOrdinal,
  MultiShapeLayer
} from './multi-shape-layer';

const source = readFileSync(
  resolve(import.meta.dirname, 'multi-shape-layer.ts'),
  'utf8'
);

describe('MultiShapeLayer — ShapeTypeOrdinal enum', () => {
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

  it('detects linear shapes via isLinearShapeOrdinal', () => {
    expect(isLinearShapeOrdinal(ShapeTypeOrdinal.BAR)).toBe(true);
    expect(isLinearShapeOrdinal(ShapeTypeOrdinal.SPIKE)).toBe(true);
    expect(isLinearShapeOrdinal(ShapeTypeOrdinal.CIRCLE)).toBe(false);
    expect(isLinearShapeOrdinal(ShapeTypeOrdinal.STAR)).toBe(false);
  });
});

describe('MultiShapeLayer — class contract', () => {
  it('extends deck.gl ScatterplotLayer to share ID/update lifecycle', () => {
    expect(MultiShapeLayer.layerName).toBe('MultiShapeLayer');
    expect(typeof MultiShapeLayer.defaultProps).toBe('object');
  });

  it('declares getShape, barWidth, offsetX, offsetY and halfMask defaults', () => {
    const props = MultiShapeLayer.defaultProps as Record<string, unknown>;
    expect(props.getShape).toMatchObject({ type: 'accessor', value: 0 });
    expect(props.barWidth).toMatchObject({ type: 'number', value: 24 });
    expect(props.offsetX).toMatchObject({ type: 'number', value: 0 });
    expect(props.offsetY).toMatchObject({ type: 'number', value: 0 });
    expect(props.halfMask).toMatchObject({ type: 'number', value: 0 });
  });
});

describe('MultiShapeLayer — source invariants (keep SDF shader consistent)', () => {
  it('registers instanceShapes attribute accessing getShape', () => {
    expect(source).toMatch(/instanceShapes:[\s\S]{0,80}accessor:\s*'getShape'/);
    expect(source).toContain('size: 1');
  });

  it('injects vShape and vRadius outputs in the vertex shader', () => {
    expect(source).toContain('vShape = instanceShapes;');
    expect(source).toContain('vRadius = instanceRadius;');
  });

  it('declares multiShape uniform block with barWidth/offsetX/offsetY/halfMask', () => {
    expect(source).toMatch(/uniform multiShapeUniforms\s*\{/);
    expect(source).toContain('float barWidth;');
    expect(source).toContain('float offsetX;');
    expect(source).toContain('float offsetY;');
    expect(source).toContain('float halfMask;');
  });

  it('calls super.draw after setting shaderInputs to avoid GPU state leaks', () => {
    const drawBlock = source.match(
      /draw\(opts: Parameters<ScatterplotLayer\['draw'\]>\[0\]\): void \{[\s\S]*?super\.draw\(opts\);\s*\}/
    );
    expect(drawBlock).not.toBeNull();
  });
});
