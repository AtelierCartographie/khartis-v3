import { describe, expect, it } from 'vitest';

import {
  LINEAR_SHAPES,
  SHAPE_ORDINAL,
  ShapeType,
  SymbolMode,
  availableShapesForSymbolMode,
  isLinearShape
} from '$lib/features/main-toolbar/constants';
import { ShapeTypeOrdinal } from '$lib/features/map/layers/multi-shape-layer';

describe('symbol shape matrix (issue #92)', () => {
  describe('SHAPE_ORDINAL', () => {
    it('should map every ShapeType to a unique ordinal aligned with ShapeTypeOrdinal', () => {
      expect(SHAPE_ORDINAL[ShapeType.CIRCLE]).toBe(ShapeTypeOrdinal.CIRCLE);
      expect(SHAPE_ORDINAL[ShapeType.SQUARE]).toBe(ShapeTypeOrdinal.SQUARE);
      expect(SHAPE_ORDINAL[ShapeType.BAR]).toBe(ShapeTypeOrdinal.BAR);
      expect(SHAPE_ORDINAL[ShapeType.SPIKE]).toBe(ShapeTypeOrdinal.SPIKE);
      expect(SHAPE_ORDINAL[ShapeType.CROSS]).toBe(ShapeTypeOrdinal.CROSS);
      expect(SHAPE_ORDINAL[ShapeType.DIAMOND]).toBe(ShapeTypeOrdinal.DIAMOND);
      expect(SHAPE_ORDINAL[ShapeType.TRIANGLE]).toBe(ShapeTypeOrdinal.TRIANGLE);
      expect(SHAPE_ORDINAL[ShapeType.STAR]).toBe(ShapeTypeOrdinal.STAR);
      expect(SHAPE_ORDINAL[ShapeType.RECTANGLE]).toBe(
        ShapeTypeOrdinal.RECTANGLE
      );
    });

    it('should expose exactly nine distinct ordinals', () => {
      const ordinals = Object.values(SHAPE_ORDINAL);
      expect(ordinals).toHaveLength(9);
      expect(new Set(ordinals).size).toBe(9);
    });
  });

  describe('LINEAR_SHAPES', () => {
    it('should contain exactly BAR and SPIKE', () => {
      expect([...LINEAR_SHAPES]).toEqual([ShapeType.BAR, ShapeType.SPIKE]);
    });

    it('should classify BAR and SPIKE as linear and every other shape as non-linear', () => {
      expect(isLinearShape(ShapeType.BAR)).toBe(true);
      expect(isLinearShape(ShapeType.SPIKE)).toBe(true);
      expect(isLinearShape(ShapeType.CIRCLE)).toBe(false);
      expect(isLinearShape(ShapeType.SQUARE)).toBe(false);
      expect(isLinearShape(ShapeType.CROSS)).toBe(false);
      expect(isLinearShape(ShapeType.DIAMOND)).toBe(false);
      expect(isLinearShape(ShapeType.TRIANGLE)).toBe(false);
      expect(isLinearShape(ShapeType.STAR)).toBe(false);
      expect(isLinearShape(ShapeType.RECTANGLE)).toBe(false);
    });
  });

  describe('availableShapesForSymbolMode', () => {
    it('should expose 7 shapes without BAR/SPIKE for UNIQUE mode', () => {
      const shapes = availableShapesForSymbolMode(SymbolMode.UNIQUE);
      expect(shapes).toEqual([
        ShapeType.CIRCLE,
        ShapeType.SQUARE,
        ShapeType.CROSS,
        ShapeType.DIAMOND,
        ShapeType.TRIANGLE,
        ShapeType.STAR,
        ShapeType.RECTANGLE
      ]);
      expect(shapes).not.toContain(ShapeType.BAR);
      expect(shapes).not.toContain(ShapeType.SPIKE);
    });

    it('should expose the same 7 shapes for CATEGORIES mode as for UNIQUE mode', () => {
      expect(availableShapesForSymbolMode(SymbolMode.CATEGORIES)).toEqual(
        availableShapesForSymbolMode(SymbolMode.UNIQUE)
      );
    });

    it('should expose exactly CIRCLE, SQUARE, BAR, SPIKE for PROPORTIONAL mode', () => {
      expect(availableShapesForSymbolMode(SymbolMode.PROPORTIONAL)).toEqual([
        ShapeType.CIRCLE,
        ShapeType.SQUARE,
        ShapeType.BAR,
        ShapeType.SPIKE
      ]);
    });

    it('should expose the same 4 shapes for CLASSES mode as for PROPORTIONAL mode', () => {
      expect(availableShapesForSymbolMode(SymbolMode.CLASSES)).toEqual(
        availableShapesForSymbolMode(SymbolMode.PROPORTIONAL)
      );
    });

    it('should expose only CIRCLE for DENSITY mode', () => {
      expect(availableShapesForSymbolMode(SymbolMode.DENSITY)).toEqual([
        ShapeType.CIRCLE
      ]);
    });

    it('should only include linear shapes in modes that scale by value (PROPORTIONAL, CLASSES)', () => {
      const linearBearingModes = [SymbolMode.PROPORTIONAL, SymbolMode.CLASSES];
      const nonLinearBearingModes = [
        SymbolMode.UNIQUE,
        SymbolMode.CATEGORIES,
        SymbolMode.DENSITY
      ];

      for (const mode of linearBearingModes) {
        const shapes = availableShapesForSymbolMode(mode);
        expect(shapes.some((shape) => isLinearShape(shape))).toBe(true);
      }
      for (const mode of nonLinearBearingModes) {
        const shapes = availableShapesForSymbolMode(mode);
        expect(shapes.some((shape) => isLinearShape(shape))).toBe(false);
      }
    });
  });
});
