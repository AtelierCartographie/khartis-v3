import { describe, expect, it } from 'vitest';
import { get_max_scale, get_model_matrix_from_bbox } from './projscreen';

describe('projscreen fit helpers', () => {
  it('reduces the fit scale when padding increases', () => {
    const bbox: [number, number, number, number] = [0, 0, 100, 50];
    const canvas = { width: 400, height: 200 };

    expect(get_max_scale(canvas, bbox, 40)).toBeLessThan(
      get_max_scale(canvas, bbox, 0)
    );
  });

  it('updates the fitted model matrix when the canvas ratio changes', () => {
    const bbox: [number, number, number, number] = [0, 0, 100, 50];

    const wideMatrix = Array.from(
      get_model_matrix_from_bbox(bbox, { width: 400, height: 200 })
    );
    const tallMatrix = Array.from(
      get_model_matrix_from_bbox(bbox, { width: 200, height: 400 })
    );

    expect(wideMatrix[0]).not.toBe(tallMatrix[0]);
    expect(wideMatrix[5]).not.toBe(tallMatrix[5]);
  });

  it('applies fit padding to the model matrix scale', () => {
    const bbox: [number, number, number, number] = [0, 0, 100, 50];

    const baseMatrix = Array.from(
      get_model_matrix_from_bbox(bbox, { width: 400, height: 200 })
    );
    const paddedMatrix = Array.from(
      get_model_matrix_from_bbox(bbox, { width: 400, height: 200 }, false, 40)
    );

    expect(paddedMatrix[0]).toBeLessThan(baseMatrix[0]);
    expect(paddedMatrix[5]).toBeLessThan(baseMatrix[5]);
  });
});
