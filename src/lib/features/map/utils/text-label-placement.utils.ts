import type { LabelAlignment, LabelOffset } from './label-layout.utils';

const TEXT_STACK_GAP_PX = 2;
const TEXT_SYMBOL_GAP_PX = 4;

/** Heights of the rendered text, every wrapped line included. */
export interface LabelStackParams {
  hasSecondaryLabel: boolean;
  primaryHeight: number;
  secondaryHeight: number;
}

/**
 * Vertical shifts of the primary and secondary labels from the centre of
 * the block they form, and the block's half height. Each label is placed
 * against its own height, so a label wrapped on two lines never widens the
 * gap of the others.
 */
export function resolveLabelStack({
  hasSecondaryLabel,
  primaryHeight,
  secondaryHeight
}: LabelStackParams): {
  primaryShift: number;
  secondaryShift: number;
  halfHeight: number;
} {
  return {
    primaryShift: hasSecondaryLabel
      ? -((secondaryHeight + TEXT_STACK_GAP_PX) / 2)
      : 0,
    secondaryShift: (primaryHeight + TEXT_STACK_GAP_PX) / 2,
    halfHeight: hasSecondaryLabel
      ? (primaryHeight + TEXT_STACK_GAP_PX + secondaryHeight) / 2
      : primaryHeight / 2
  };
}

export function resolveTextLabelPlacement(
  params: LabelStackParams & { hasPointSymbol: boolean; pointRadius: number }
): {
  primaryPixelOffset: [number, number];
  secondaryPixelOffset: [number, number];
} {
  const { hasPointSymbol, pointRadius, primaryHeight, secondaryHeight } =
    params;

  if (!hasPointSymbol || pointRadius <= 0) {
    return {
      primaryPixelOffset: [0, 0],
      secondaryPixelOffset: [
        0,
        primaryHeight / 2 + TEXT_STACK_GAP_PX + secondaryHeight / 2
      ]
    };
  }

  const horizontalOffset = pointRadius + TEXT_SYMBOL_GAP_PX;
  const stack = resolveLabelStack(params);

  return {
    primaryPixelOffset: [horizontalOffset, stack.primaryShift],
    secondaryPixelOffset: [horizontalOffset, stack.secondaryShift]
  };
}

/**
 * Offsets of a label block the user moved, centred on `center`. Both labels
 * share the text anchor of `alignment`, so their lines stay flush.
 */
export function resolveManualLabelPlacement(
  center: LabelOffset,
  textHalfWidth: number,
  alignment: LabelAlignment,
  params: LabelStackParams
): {
  primaryPixelOffset: [number, number];
  secondaryPixelOffset: [number, number];
} {
  const stack = resolveLabelStack(params);
  const x =
    alignment === 'start'
      ? center[0] - textHalfWidth
      : alignment === 'end'
        ? center[0] + textHalfWidth
        : center[0];

  return {
    primaryPixelOffset: [x, center[1] + stack.primaryShift],
    secondaryPixelOffset: [x, center[1] + stack.secondaryShift]
  };
}
