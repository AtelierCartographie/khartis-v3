import { clampFontSize } from '$lib/features/step-toolbar/fonts.constants';

export const TEXT_HIERARCHY = {
  EQUAL: 'equal',
  MODERATE: 'moderate',
  STRONG: 'strong'
} as const;

export type TextHierarchy =
  (typeof TEXT_HIERARCHY)[keyof typeof TEXT_HIERARCHY];

export const TEXT_HIERARCHY_ORDER: TextHierarchy[] = [
  TEXT_HIERARCHY.EQUAL,
  TEXT_HIERARCHY.MODERATE,
  TEXT_HIERARCHY.STRONG
];

const TEXT_HIERARCHY_RATIOS: Record<TextHierarchy, number> = {
  [TEXT_HIERARCHY.EQUAL]: 1,
  [TEXT_HIERARCHY.MODERATE]: 0.75,
  [TEXT_HIERARCHY.STRONG]: 0.55
};

export function resolveSecondaryTextSize(
  primarySize: number,
  hierarchy: TextHierarchy
): number {
  return clampFontSize(
    primarySize * TEXT_HIERARCHY_RATIOS[hierarchy],
    primarySize
  );
}

export function resolveTextHierarchy(
  primarySize: number,
  secondarySize: number
): TextHierarchy {
  if (!(primarySize > 0) || !(secondarySize > 0)) {
    return TEXT_HIERARCHY.EQUAL;
  }

  const ratio = secondarySize / primarySize;

  return TEXT_HIERARCHY_ORDER.reduce((closest, hierarchy) =>
    Math.abs(TEXT_HIERARCHY_RATIOS[hierarchy] - ratio) <
    Math.abs(TEXT_HIERARCHY_RATIOS[closest] - ratio)
      ? hierarchy
      : closest
  );
}
