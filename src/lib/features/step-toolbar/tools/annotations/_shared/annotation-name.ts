import { ANNOTATION_ROLE } from '$lib/features/commons/constants';
import * as m from '$lib/paraglide/messages';
import type { Annotation } from '../../../types/annotations.types';

const EXCERPT_LENGTH = 32;

/**
 * Names a text the way the user knows it: the page element it stands for
 * (Titre, Source…), otherwise the start of what it says.
 */
export function getTextAnnotationName(item: Annotation): string {
  switch (item.role) {
    case ANNOTATION_ROLE.TITLE:
      return m.annotations_style_title();
    case ANNOTATION_ROLE.SUBTITLE:
      return m.annotations_style_subtitle();
    case ANNOTATION_ROLE.SOURCE:
      return m.annotations_role_source();
    case ANNOTATION_ROLE.BASEMAP_SOURCE:
      return m.annotations_role_basemap_source();
    case ANNOTATION_ROLE.CREDIT:
      return m.annotations_role_credit();
    case ANNOTATION_ROLE.SIGNATURE:
    case ANNOTATION_ROLE.NOTE:
      return m.annotations_note();
  }

  const text =
    typeof item.content === 'string'
      ? item.content.trim().replace(/\s+/g, ' ')
      : '';
  if (!text) {
    return m.annotations_text();
  }

  return text.length > EXCERPT_LENGTH
    ? `${text.slice(0, EXCERPT_LENGTH - 1)}…`
    : text;
}

/**
 * Names an item « Flèche 2 », « Dessin 1 »… after its rank among the items
 * the predicate groups with it, in creation order.
 */
export function getOrdinalAnnotationName(
  items: readonly Annotation[],
  item: Annotation,
  name: string,
  sameGroup: (candidate: Annotation) => boolean
): string {
  const siblings = items.filter(sameGroup);
  const rank = siblings.findIndex((candidate) => candidate.id === item.id);
  return m.annotations_item_ordinal({
    name,
    index: String(rank < 0 ? siblings.length + 1 : rank + 1)
  });
}
