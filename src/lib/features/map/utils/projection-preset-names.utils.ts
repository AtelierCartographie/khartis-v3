import type {
  ProjectionPresets,
  ViewLabelPlacement
} from '../types/basemap.types';

export interface ViewLabel {
  name: string;
  placement: ViewLabelPlacement;
}

const VIEW_LABEL_PLACEMENTS: readonly ViewLabelPlacement[] = [
  'top-inside',
  'top-outside',
  'bottom-inside',
  'bottom-outside'
];

// Keyed by entry id. The same territory can sit differently in two presets
// (Guadeloupe above its cell in France, inside it in Europe).
export function resolveViewLabels(
  presets: ProjectionPresets | null | undefined,
  presetId: string | null | undefined,
  locale: string
): Map<string, ViewLabel> {
  const labels = new Map<string, ViewLabel>();
  const entries = presetId ? (presets?.[presetId]?.entries ?? []) : [];
  for (const entry of entries) {
    const name =
      (locale === 'fr' ? entry.name_fr : entry.name_en)?.trim() ||
      entry.name_fr?.trim();
    if (name) {
      labels.set(entry.id, {
        name,
        placement:
          entry.label_placement &&
          VIEW_LABEL_PLACEMENTS.includes(entry.label_placement)
            ? entry.label_placement
            : 'top-inside'
      });
    }
  }
  return labels;
}

export function presetHasInsetNames(
  presets: ProjectionPresets | null | undefined,
  presetId: string | null | undefined
): boolean {
  const entries = presetId ? presets?.[presetId]?.entries : undefined;
  return Boolean(entries?.some((entry) => entry.name_fr || entry.name_en));
}
