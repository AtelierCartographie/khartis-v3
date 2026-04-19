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

  const secondaryBottomOffset = -(pointRadius + TEXT_SYMBOL_GAP_PX);
  const secondaryHeight = secondarySize + paddingY * 2;

  return {
    primaryAlignmentBaseline: 'bottom',
    secondaryAlignmentBaseline: 'bottom',
    primaryPixelOffset: [
      0,
      hasSecondaryLabel
        ? secondaryBottomOffset - secondaryHeight - TEXT_STACK_GAP_PX
        : secondaryBottomOffset
    ],
    secondaryPixelOffset: [0, secondaryBottomOffset]
  };
}
