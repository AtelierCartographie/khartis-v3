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

  return m.annotations_text_excerpt({
    text:
      text.length > EXCERPT_LENGTH
        ? `${text.slice(0, EXCERPT_LENGTH - 1)}…`
        : text
  });
}
