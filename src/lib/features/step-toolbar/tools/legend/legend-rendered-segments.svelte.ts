/**
 * What each legend frame actually draws. The map overlay builds the blocks, so
 * it reports them here and the editor only offers the options that apply.
 * Ephemeral: recomputed from the visualizations on every render.
 */
export type RenderedLegendSegmentKind =
  'class-bar' | 'entries' | 'unique' | 'other';

export interface RenderedLegendSegment {
  key: string;
  kind: RenderedLegendSegmentKind;
  /** The column the block encodes, when it has one. */
  variable?: string;
}

let segmentsByItemId = $state<Record<string, RenderedLegendSegment[]>>({});

function areSegmentsEqual(
  left: RenderedLegendSegment[] | undefined,
  right: RenderedLegendSegment[]
): boolean {
  return (
    left !== undefined &&
    left.length === right.length &&
    left.every(
      (segment, index) =>
        segment.key === right[index].key &&
        segment.kind === right[index].kind &&
        segment.variable === right[index].variable
    )
  );
}

export function getRenderedLegendSegments(
  itemId: string
): RenderedLegendSegment[] {
  return segmentsByItemId[itemId] ?? [];
}

export function setRenderedLegendSegments(
  itemId: string,
  segments: RenderedLegendSegment[]
): void {
  if (areSegmentsEqual(segmentsByItemId[itemId], segments)) {
    return;
  }
  segmentsByItemId = { ...segmentsByItemId, [itemId]: segments };
}
