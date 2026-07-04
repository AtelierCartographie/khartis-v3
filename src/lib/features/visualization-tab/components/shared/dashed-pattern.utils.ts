import { BasemapDottedPattern } from '$lib/features/commons/constants/visualization.constants';
import * as m from '$lib/paraglide/messages';

export interface DashedPatternItem {
  id: BasemapDottedPattern;
  text: string;
}

export function buildDashedPatternItems(): DashedPatternItem[] {
  return [
    { id: BasemapDottedPattern.DOTS, text: m.dashed_pattern_dots() },
    { id: BasemapDottedPattern.DASHES, text: m.dashed_pattern_dashes() },
    { id: BasemapDottedPattern.DASH_DOT, text: m.dashed_pattern_dash_dot() },
    {
      id: BasemapDottedPattern.LONG_DASH,
      text: m.dashed_pattern_long_dash()
    }
  ];
}

export function coerceDashedPattern(
  value: BasemapDottedPattern | string | number | null | undefined
): BasemapDottedPattern {
  return (
    Object.values(BasemapDottedPattern).find((pattern) => pattern === value) ??
    BasemapDottedPattern.DOTS
  );
}
