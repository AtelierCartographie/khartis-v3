import { ANNOTATION_ROLE } from '$lib/features/commons/constants';
import { m } from '$lib/paraglide/messages';
import { getLocale, locales, type Locale } from '$lib/paraglide/runtime.js';
import type { PageElementRole } from '../../types/annotations.types';

type PageElementMessageBundle = {
  annotations_placeholder_title: () => string;
  annotations_placeholder_subtitle: () => string;
  annotations_placeholder_source: () => string;
  annotations_placeholder_note: () => string;
  basemap_source: () => string;
  map_export_signature: () => string;
};

function createPageElementMessageBundle(
  locale: Locale
): PageElementMessageBundle {
  return {
    annotations_placeholder_title: () =>
      String(m.annotations_placeholder_title({}, { locale })),
    annotations_placeholder_subtitle: () =>
      String(m.annotations_placeholder_subtitle({}, { locale })),
    annotations_placeholder_source: () =>
      String(m.annotations_placeholder_source({}, { locale })),
    annotations_placeholder_note: () =>
      String(m.annotations_placeholder_note({}, { locale })),
    basemap_source: () => String(m.basemap_source({}, { locale })),
    map_export_signature: () => String(m.map_export_signature({}, { locale }))
  };
}

const PAGE_ELEMENT_MESSAGE_BUNDLES = new Map<Locale, PageElementMessageBundle>(
  locales.map((locale) => [locale, createPageElementMessageBundle(locale)])
);

function getPageElementMessageBundle(locale: Locale): PageElementMessageBundle {
  return (
    PAGE_ELEMENT_MESSAGE_BUNDLES.get(locale) ??
    createPageElementMessageBundle(locale)
  );
}

export function getPageElementDefaultContent(
  role: PageElementRole,
  basemapSource: string,
  withPlaceholders: boolean,
  locale: Locale = getLocale()
): string {
  const bundle = getPageElementMessageBundle(locale);

  switch (role) {
    case ANNOTATION_ROLE.TITLE:
      return withPlaceholders ? bundle.annotations_placeholder_title() : '';
    case ANNOTATION_ROLE.SUBTITLE:
      return withPlaceholders ? bundle.annotations_placeholder_subtitle() : '';
    case ANNOTATION_ROLE.SOURCE:
      return withPlaceholders ? bundle.annotations_placeholder_source() : '';
    case ANNOTATION_ROLE.BASEMAP_SOURCE:
      return basemapSource || (withPlaceholders ? bundle.basemap_source() : '');
    case ANNOTATION_ROLE.SIGNATURE:
      return withPlaceholders ? bundle.annotations_placeholder_note() : '';
    case ANNOTATION_ROLE.CREDIT:
      return bundle.map_export_signature();
    case ANNOTATION_ROLE.NOTE:
      return withPlaceholders ? bundle.annotations_placeholder_note() : '';
    default:
      return '';
  }
}

export function getKnownPageElementDefaultContents(
  role: PageElementRole,
  basemapSource: string,
  withPlaceholders: boolean
): Set<string> {
  return new Set(
    locales.map((locale) =>
      getPageElementDefaultContent(
        role,
        basemapSource,
        withPlaceholders,
        locale
      )
    )
  );
}
