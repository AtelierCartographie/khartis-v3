import type { BBox } from '../types';
import type { ProjectionPresets } from '../types/basemap.types';

export function bboxesIntersect(a: BBox, b: BBox): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

export function isCompositeProjectionPresetCompatibleWithBbox(
  presetId: string,
  bbox: BBox | null | undefined,
  projectionPresets: ProjectionPresets | null | undefined
): boolean {
  if (!bbox || !projectionPresets) {
    return true;
  }

  const preset = projectionPresets[presetId];
  if (!preset?.entries?.length) {
    return false;
  }

  return preset.entries.some((entry) =>
    bboxesIntersect(bbox, [
      entry.bounds[0][0],
      entry.bounds[0][1],
      entry.bounds[1][0],
      entry.bounds[1][1]
    ])
  );
}
