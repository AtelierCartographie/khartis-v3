import { describe, expect, it } from 'vitest';

import {
  placeLabelBlocks,
  type AutoLabelEntry,
  type AutoLabelPlacementOptions
} from './label-auto-placement.utils';
import type { LabelOffset } from './label-layout.utils';

type Box = [number, number, number, number];

const ENTRY: AutoLabelEntry = {
  id: 1,
  anchor: [200, 200],
  halfSize: [30, 8],
  symbolRadius: 6,
  priority: 1,
  mode: 'optional'
};

const OPTIONS: AutoLabelPlacementOptions = {
  bounds: [0, 0, 400, 400],
  obstacles: [],
  lines: [],
  align: 'none',
  gap: 2,
  symbolGap: 3,
  minGap: 6
};

function toBlockBox(center: LabelOffset): Box {
  const x = ENTRY.anchor[0] + center[0];
  const y = ENTRY.anchor[1] + center[1];
  return [
    x - ENTRY.halfSize[0],
    y - ENTRY.halfSize[1],
    x + ENTRY.halfSize[0],
    y + ENTRY.halfSize[1]
  ];
}

function overlaps(a: Box, b: Box): boolean {
  return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
}

describe('placeLabelBlocks', () => {
  it('should move a label off a page item and bring it back when the item leaves', () => {
    const free = placeLabelBlocks('viz', [ENTRY], OPTIONS).get(ENTRY.id);
    expect(free).toBeTruthy();
    const pageItem = toBlockBox(free!);

    const covered = placeLabelBlocks('viz', [ENTRY], {
      ...OPTIONS,
      obstacles: [pageItem]
    }).get(ENTRY.id);
    expect(covered).toBeTruthy();
    expect(overlaps(toBlockBox(covered!), pageItem)).toBe(false);

    expect(placeLabelBlocks('viz', [ENTRY], OPTIONS).get(ENTRY.id)).toEqual(
      free
    );
  });

  it('should hide a required label but keep a pinned one when a page item covers their symbol', () => {
    const pinned: AutoLabelEntry = {
      ...ENTRY,
      id: 2,
      anchor: [210, 210],
      mode: 'pinned',
      center: [0, 40]
    };
    const centers = placeLabelBlocks(
      'viz-covered',
      [{ ...ENTRY, mode: 'required' }, pinned],
      { ...OPTIONS, obstacles: [[0, 0, 400, 400]] }
    );

    expect(centers.get(ENTRY.id)).toBeNull();
    expect(centers.get(pinned.id)).toEqual([0, 40]);
  });
});
