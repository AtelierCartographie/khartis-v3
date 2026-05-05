import {
  TextAlignCenter,
  TextAlignLeft,
  TextAlignRight
} from 'carbon-icons-svelte';
import * as m from '$lib/paraglide/messages';

export type TextAlignment = 'left' | 'center' | 'right';

export type AlignmentIcon =
  | typeof TextAlignLeft
  | typeof TextAlignCenter
  | typeof TextAlignRight;

export const TEXT_ALIGNMENTS: readonly TextAlignment[] = [
  'left',
  'center',
  'right'
] as const;

export function nextAlignment(align: TextAlignment): TextAlignment {
  const currentIndex = TEXT_ALIGNMENTS.indexOf(align);
  const next = TEXT_ALIGNMENTS[(currentIndex + 1) % TEXT_ALIGNMENTS.length];
  return next ?? 'left';
}

export function resolveAlignmentIcon(align: TextAlignment): AlignmentIcon {
  switch (align) {
    case 'center':
      return TextAlignCenter;
    case 'right':
      return TextAlignRight;
    default:
      return TextAlignLeft;
  }
}

export function resolveAlignmentLabel(align: TextAlignment): string {
  switch (align) {
    case 'center':
      return m.annotations_align_center();
    case 'right':
      return m.annotations_align_right();
    default:
      return m.annotations_align_left();
  }
}
