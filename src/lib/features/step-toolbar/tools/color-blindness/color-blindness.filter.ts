import { ColorBlindnessType } from '$lib/features/commons/constants/ui.constants';

/**
 * SVG feColorMatrix values for color blindness simulation.
 * Based on Machado, Oliveira & Fernandes 2009 physiological model.
 *
 * Format (20 values for 4×5 matrix):
 * "R→R R→G R→B 0 0  G→R G→G G→B 0 0  B→R B→G B→B 0 0  0 0 0 1 0"
 */
const MATRICES: Partial<Record<ColorBlindnessType, string>> = {
  [ColorBlindnessType.PROTANOPIA]:
    '0.152286 1.052599 -0.204887 0 0 0.114503 0.786281 0.099216 0 0 -0.003882 -0.048116 1.051998 0 0 0 0 0 1 0',
  [ColorBlindnessType.DEUTERANOPIA]:
    '0.367322 0.860646 -0.227968 0 0 0.280085 0.672501 0.047413 0 0 -0.011820 0.042940 0.968881 0 0 0 0 0 1 0',
  [ColorBlindnessType.TRITANOPIA]:
    '1.255528 -0.076749 -0.178779 0 0 -0.078411 0.930809 0.147602 0 0 0.004733 0.691367 0.303900 0 0 0 0 0 1 0',
  [ColorBlindnessType.PROTANOMALY]:
    '0.458064 0.679578 -0.137642 0 0 0.092785 0.846313 0.060902 0 0 -0.007494 -0.016807 1.024301 0 0 0 0 0 1 0',
  [ColorBlindnessType.DEUTERANOMALY]:
    '0.547494 0.607765 -0.155259 0 0 0.181692 0.781742 0.036566 0 0 -0.010410 0.027275 0.983136 0 0 0 0 0 1 0',
  [ColorBlindnessType.TRITANOMALY]:
    '1.017277 0.027029 -0.044306 0 0 -0.006113 0.958479 0.047634 0 0 0.006379 0.248708 0.744913 0 0 0 0 0 1 0',
  [ColorBlindnessType.ACHROMATOPSIA]:
    '0.299 0.587 0.114 0 0 0.299 0.587 0.114 0 0 0.299 0.587 0.114 0 0 0 0 0 1 0',
  [ColorBlindnessType.ACHROMATOMALY]:
    '0.618 0.320 0.062 0 0 0.163 0.775 0.062 0 0 0.163 0.320 0.516 0 0 0 0 0 1 0'
};

/**
 * Returns the SVG feColorMatrix values string for the given type,
 * or null when no simulation is needed (NONE).
 */
export function getColorBlindnessMatrix(
  type: ColorBlindnessType
): string | null {
  if (type === ColorBlindnessType.NONE) return null;
  return MATRICES[type] ?? null;
}
