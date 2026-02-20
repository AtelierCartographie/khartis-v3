import { describe, expect, it } from 'vitest';
import { getColorBlindnessMatrix } from './color-blindness.filter';
import { ColorBlindnessType } from '$lib/features/commons/constants/ui.constants';

describe('getColorBlindnessMatrix', () => {
  it('returns null for NONE', () => {
    expect(getColorBlindnessMatrix(ColorBlindnessType.NONE)).toBeNull();
  });

  it('returns a non-null string for every simulated type', () => {
    const simulated = [
      ColorBlindnessType.PROTANOPIA,
      ColorBlindnessType.DEUTERANOPIA,
      ColorBlindnessType.TRITANOPIA,
      ColorBlindnessType.PROTANOMALY,
      ColorBlindnessType.DEUTERANOMALY,
      ColorBlindnessType.TRITANOMALY,
      ColorBlindnessType.ACHROMATOPSIA,
      ColorBlindnessType.ACHROMATOMALY
    ];

    for (const type of simulated) {
      expect(
        getColorBlindnessMatrix(type),
        `matrix for ${type}`
      ).not.toBeNull();
    }
  });

  it('returns a string with exactly 20 values for each type', () => {
    const simulated = [
      ColorBlindnessType.PROTANOPIA,
      ColorBlindnessType.DEUTERANOPIA,
      ColorBlindnessType.TRITANOPIA,
      ColorBlindnessType.PROTANOMALY,
      ColorBlindnessType.DEUTERANOMALY,
      ColorBlindnessType.TRITANOMALY,
      ColorBlindnessType.ACHROMATOPSIA,
      ColorBlindnessType.ACHROMATOMALY
    ];

    for (const type of simulated) {
      const matrix = getColorBlindnessMatrix(type)!;
      const values = matrix.trim().split(/\s+/);
      expect(values, `${type} should have 20 values`).toHaveLength(20);
    }
  });

  it('alpha row is always "0 0 0 1 0" (last 5 values)', () => {
    const simulated = [
      ColorBlindnessType.PROTANOPIA,
      ColorBlindnessType.DEUTERANOPIA,
      ColorBlindnessType.TRITANOPIA,
      ColorBlindnessType.PROTANOMALY,
      ColorBlindnessType.DEUTERANOMALY,
      ColorBlindnessType.TRITANOMALY,
      ColorBlindnessType.ACHROMATOPSIA,
      ColorBlindnessType.ACHROMATOMALY
    ];

    for (const type of simulated) {
      const matrix = getColorBlindnessMatrix(type)!;
      const values = matrix.trim().split(/\s+/);
      expect(values.slice(15), `${type} alpha row`).toEqual([
        '0',
        '0',
        '0',
        '1',
        '0'
      ]);
    }
  });

  it('offset columns are always zero (positions 3, 4, 8, 9, 13, 14)', () => {
    const simulated = [
      ColorBlindnessType.PROTANOPIA,
      ColorBlindnessType.DEUTERANOPIA,
      ColorBlindnessType.TRITANOPIA,
      ColorBlindnessType.PROTANOMALY,
      ColorBlindnessType.DEUTERANOMALY,
      ColorBlindnessType.TRITANOMALY,
      ColorBlindnessType.ACHROMATOPSIA,
      ColorBlindnessType.ACHROMATOMALY
    ];

    const zeroIndices = [3, 4, 8, 9, 13, 14];

    for (const type of simulated) {
      const matrix = getColorBlindnessMatrix(type)!;
      const values = matrix.trim().split(/\s+/);
      for (const i of zeroIndices) {
        expect(values[i], `${type} index ${i}`).toBe('0');
      }
    }
  });
});
