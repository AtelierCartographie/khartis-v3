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
  const {
    hasPointSymbol,
    pointRadius,
    hasSecondaryLabel,
    primarySize,
    secondarySize,
    paddingY
  } = params;

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
  const primaryHeight = primarySize + paddingY * 2;
  const secondaryHeight = secondarySize + paddingY * 2;
  const primaryVerticalOffset = hasSecondaryLabel
    ? -((secondaryHeight + TEXT_STACK_GAP_PX) / 2)
    : 0;
  const secondaryVerticalOffset = (primaryHeight + TEXT_STACK_GAP_PX) / 2;

  return {
    primaryAlignmentBaseline: 'center',
    secondaryAlignmentBaseline: 'center',
    primaryPixelOffset: [horizontalOffset, primaryVerticalOffset],
    secondaryPixelOffset: [horizontalOffset, secondaryVerticalOffset]
  };
}
