import { ANNOTATION_ROLE } from '$lib/features/commons/constants';
import { projectStore } from '$lib/features/commons/stores/project.store.svelte';
import { m } from '$lib/paraglide/messages';
import { getLocale, locales, type Locale } from '$lib/paraglide/runtime.js';
import type { PageElementRole } from '../../types/annotations.types';

type PageElementMessageBundle = {
  annotations_placeholder_title: () => string;
  annotations_placeholder_subtitle: () => string;
  annotations_placeholder_source: () => string;
  annotations_placeholder_note: () => string;
  annotations_placeholder_credit: (year: string) => string;
  annotations_source_prefix: () => string;
  annotations_basemap_source_text: (source: string) => string;
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
    annotations_placeholder_credit: (year) =>
      String(m.annotations_placeholder_credit({ year }, { locale })),
    annotations_source_prefix: () =>
      String(m.annotations_source_prefix({}, { locale })),
    annotations_basemap_source_text: (source) =>
      String(m.annotations_basemap_source_text({ source }, { locale })),
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

function getBundles(): PageElementMessageBundle[] {
  return locales.map(getPageElementMessageBundle);
}

/** The year the map was made: its project's creation. */
export function resolveMapYear(): number {
  const createdAt = projectStore.currentProject?.manifest.createdAt;
  const date = createdAt ? new Date(createdAt) : null;
  return date && !Number.isNaN(date.getTime())
    ? date.getFullYear()
    : new Date().getFullYear();
}

/** « Fond de carte : Eurostat - GISCO. », with a single final stop. */
export function formatBasemapSourceText(
  source: string,
  locale: Locale = getLocale()
): string {
  const sentence = /[.!?…]$/.test(source.trim())
    ? source.trim()
    : `${source.trim()}.`;
  return getPageElementMessageBundle(locale).annotations_basemap_source_text(
    sentence
  );
}

export function getSourcePrefix(locale: Locale = getLocale()): string {
  return getPageElementMessageBundle(locale).annotations_source_prefix();
}

export function getPageElementDefaultContent(
  role: PageElementRole,
  basemapSource: string,
  withPlaceholders: boolean,
  locale: Locale = getLocale(),
  year: number = resolveMapYear()
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
      return basemapSource
        ? formatBasemapSourceText(basemapSource, locale)
        : withPlaceholders
          ? bundle.basemap_source()
          : '';
    case ANNOTATION_ROLE.CREDIT:
      return bundle.annotations_placeholder_credit(String(year));
    case ANNOTATION_ROLE.NOTE:
      return withPlaceholders ? bundle.annotations_placeholder_note() : '';
    default:
      return '';
  }
}

export function getKnownPageElementDefaultContents(
  role: PageElementRole,
  basemapSource: string,
  withPlaceholders: boolean,
  year?: number
): Set<string> {
  return new Set(
    locales.map((locale) =>
      getPageElementDefaultContent(
        role,
        basemapSource,
        withPlaceholders,
        locale,
        year
      )
    )
  );
}

const YEAR_MARK = '\u0000';

/** The credit still reads « (préciser l'auteur·rice) », whatever its year. */
function isCreditTemplate(content: string): boolean {
  return getBundles().some((bundle) => {
    const [before, after] = bundle
      .annotations_placeholder_credit(YEAR_MARK)
      .split(YEAR_MARK);
    return (
      content.startsWith(before) &&
      content.endsWith(after) &&
      /^\d{4}$/.test(content.slice(before.length, -after.length || undefined))
    );
  });
}

export function isSourcePrefixOnly(content: string): boolean {
  return getBundles().some(
    (bundle) => bundle.annotations_source_prefix().trim() === content.trim()
  );
}

/** The wording a page text is created with, before anything is written. */
export function hasPageElementDefaultWording(item: {
  role?: PageElementRole;
  content: unknown;
}): boolean {
  if (
    !item.role ||
    item.role === ANNOTATION_ROLE.CREDIT ||
    typeof item.content !== 'string'
  ) {
    return false;
  }

  return getKnownPageElementDefaultContents(item.role, '', true).has(
    item.content
  );
}

/**
 * A page text not written yet is a placeholder: greyed on the page and left
 * out of exports. That is its default wording, the « Source : » it turns into
 * when clicked, or the credit still asking for its author.
 */
export function isPageElementPlaceholder(item: {
  role?: PageElementRole;
  content: unknown;
}): boolean {
  if (!item.role || typeof item.content !== 'string') {
    return false;
  }

  switch (item.role) {
    case ANNOTATION_ROLE.CREDIT:
      return isCreditTemplate(item.content);
    case ANNOTATION_ROLE.SOURCE:
      return (
        isSourcePrefixOnly(item.content) || hasPageElementDefaultWording(item)
      );
    default:
      return hasPageElementDefaultWording(item);
  }
}

/** The placeholder a cleared page text falls back to, if it has one. */
export function getPageElementPlaceholder(
  role: PageElementRole,
  year?: number
): string | null {
  return (
    getPageElementDefaultContent(role, '', true, getLocale(), year) || null
  );
}

/**
 * Page texts from projects made before the credit asked for its author and
 * the note was dropped: « Réalisé avec Khartis », an untouched note.
 */
export function isLegacyPageElementContent(
  role: PageElementRole,
  content: unknown
): boolean {
  if (typeof content !== 'string') {
    return false;
  }

  switch (role) {
    case ANNOTATION_ROLE.CREDIT:
      return getBundles().some(
        (bundle) => bundle.map_export_signature() === content
      );
    case ANNOTATION_ROLE.SIGNATURE:
      return (
        content.trim() === '' ||
        getBundles().some(
          (bundle) => bundle.annotations_placeholder_note() === content
        )
      );
    default:
      return false;
  }
}
