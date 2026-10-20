const TEXT_STACK_GAP_PX = 2;
const TEXT_SYMBOL_GAP_PX = 4;

export function resolveTextLabelPlacement(params: {
  hasPointSymbol: boolean;
  pointRadius: number;
  hasSecondaryLabel: boolean;
  primarySize: number;
  secondarySize: number;
  paddingY: number;
}): {
  primaryAlignmentBaseline: 'center' | 'bottom';
  secondaryAlignmentBaseline: 'center' | 'bottom';
  primaryPixelOffset: [number, number];
  secondaryPixelOffset: [number, number];
} {
  const { hasPointSymbol, pointRadius, primarySize, secondarySize, paddingY } =
    params;

  if (!hasPointSymbol || pointRadius <= 0) {
    return {
      primaryAlignmentBaseline: 'center',
      secondaryAlignmentBaseline: 'center',
      primaryPixelOffset: [0, 0],
      secondaryPixelOffset: [
        0,
        primarySize / 2 + paddingY + TEXT_STACK_GAP_PX + secondarySize / 2
      ]
    };
  }

  const horizontalOffset = pointRadius + TEXT_SYMBOL_GAP_PX;
  const stack = resolveLabelStack(params);

  return {
    primaryAlignmentBaseline: 'center',
    secondaryAlignmentBaseline: 'center',
    primaryPixelOffset: [horizontalOffset, stack.primaryShift],
    secondaryPixelOffset: [horizontalOffset, stack.secondaryShift]
  };
}

interface LabelStackParams {
  hasSecondaryLabel: boolean;
  primarySize: number;
  secondarySize: number;
  paddingY: number;
}

/**
 * Vertical shifts of the primary and secondary labels from the centre of
 * the block they form, and the block's half height, padding included.
 */
export function resolveLabelStack({
  hasSecondaryLabel,
  primarySize,
  secondarySize,
  paddingY
}: LabelStackParams): {
  primaryShift: number;
  secondaryShift: number;
  halfHeight: number;
} {
  const primaryHeight = primarySize + paddingY * 2;
  const secondaryHeight = secondarySize + paddingY * 2;

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

/** Offsets of a label block the user moved, centred on `center`. */
export function resolveManualLabelPlacement(
  center: [number, number],
  params: LabelStackParams
): {
  primaryPixelOffset: [number, number];
  secondaryPixelOffset: [number, number];
} {
  const stack = resolveLabelStack(params);

  return {
    primaryPixelOffset: [center[0], center[1] + stack.primaryShift],
    secondaryPixelOffset: [center[0], center[1] + stack.secondaryShift]
  };
}
