import { describe, expect, it } from 'vitest';

import {
  placeLabelBlocks,
  projectFeatureRings,
  ringsSurround,
  type LabelPlacementFrame,
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
  land: [],
  spacing: 0,
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
    const free = placeLabelBlocks('viz', [ENTRY], OPTIONS).get(
      ENTRY.id
    )?.center;
    expect(free).toBeTruthy();
    const pageItem = toBlockBox(free!);

    const covered = placeLabelBlocks('viz', [ENTRY], {
      ...OPTIONS,
      obstacles: [pageItem]
    }).get(ENTRY.id)?.center;
    expect(covered).toBeTruthy();
    expect(overlaps(toBlockBox(covered!), pageItem)).toBe(false);

    expect(
      placeLabelBlocks('viz', [ENTRY], OPTIONS).get(ENTRY.id)?.center
    ).toEqual(free);
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
    expect(centers.get(pinned.id)?.center).toEqual([0, 40]);
  });

  it('should keep an area label wholly inside its outline, without a leader', () => {
    const square: LabelOffset[] = [
      [150, 170],
      [250, 170],
      [250, 230],
      [150, 230],
      [150, 170]
    ];
    const block = placeLabelBlocks(
      'viz-area',
      [{ ...ENTRY, symbolRadius: 0, rings: [square] }],
      OPTIONS
    ).get(ENTRY.id);

    expect(block?.center).toEqual([0, 0]);
    expect(block?.areaLeader).toBeNull();
  });

  it('should set an area label on two lines when one line does not fit inside', () => {
    const narrow: LabelOffset[] = [
      [170, 170],
      [230, 170],
      [230, 230],
      [170, 230],
      [170, 170]
    ];
    const block = placeLabelBlocks(
      'viz-two-lines',
      [
        {
          ...ENTRY,
          halfSize: [40, 6],
          symbolRadius: 0,
          rings: [narrow],
          layouts: [[22, 12]]
        }
      ],
      OPTIONS
    ).get(ENTRY.id);

    expect(block?.layout).toBe(1);
    expect(block?.center).toEqual([0, 0]);
  });
});

describe('placeLabelBlocks on land and with spacing', () => {
  it('should send a coastal label to the sea side when the land is given', () => {
    // Land on the right of x = 205; the town on the shore.
    const land: LabelOffset[][] = [
      [
        [205, 0],
        [400, 0],
        [400, 400],
        [205, 400]
      ]
    ];
    const town: AutoLabelEntry = {
      ...ENTRY,
      anchor: [208, 200],
      symbolRadius: 3
    };
    const right = placeLabelBlocks('viz-shore', [town], OPTIONS).get(town.id);
    expect(right!.center[0]).toBeGreaterThan(0);
    const sea = placeLabelBlocks('viz-sea', [town], { ...OPTIONS, land }).get(
      town.id
    );
    expect(sea!.center[0]).toBeLessThan(0);
  });

  it('should keep clear space between two labels', () => {
    const a: AutoLabelEntry = { ...ENTRY, id: 1, anchor: [150, 200] };
    const b: AutoLabelEntry = {
      ...ENTRY,
      id: 2,
      anchor: [150, 222],
      priority: 0
    };
    const blocks = placeLabelBlocks('viz-spacing', [a, b], {
      ...OPTIONS,
      spacing: 8
    });
    const box = (e: AutoLabelEntry): Box => {
      const [cx, cy] = blocks.get(e.id)!.center;
      const [x, y] = [e.anchor[0] + cx, e.anchor[1] + cy];
      return [
        x - e.halfSize[0],
        y - e.halfSize[1],
        x + e.halfSize[0],
        y + e.halfSize[1]
      ];
    };
    const [p, q] = [box(a), box(b)];
    const gap = Math.max(p[0] - q[2], q[0] - p[2], p[1] - q[3], q[1] - p[3]);
    expect(gap).toBeGreaterThanOrEqual(8 - 1e-9);
  });
});

describe('projectFeatureRings', () => {
  const frame: LabelPlacementFrame = {
    bounds: [0, 0, 100, 100],
    toPagePx: ([x, y]) => [x * 10, y * 10],
    toObstacles: () => []
  };

  it('should project the rings of the wanted rows, closer vertices merged', () => {
    const rings = projectFeatureRings(
      {
        length: 3,
        positions: new Float32Array([
          0, 0, 0.01, 0, 2, 0, 2, 2, 0, 0, 5, 5, 6, 5, 6, 6, 9, 9, 9.5, 9, 9,
          9.5
        ]),
        startIndices: new Uint32Array([0, 5, 8]),
        featureIds: new Uint32Array([4, 7, 4])
      },
      new Set([4]),
      frame
    );

    expect([...rings.keys()]).toEqual([4]);
    expect(rings.get(4)).toEqual([
      [
        [0, 0],
        [20, 0],
        [20, 20],
        [0, 0]
      ],
      [
        [90, 90],
        [95, 90],
        [90, 95]
      ]
    ]);
  });

  it('should tell whether an anchor lies within the extent of its rings', () => {
    const rings: LabelOffset[][] = [
      [
        [0, 0],
        [10, 0],
        [10, 10]
      ]
    ];
    expect(ringsSurround(rings, [5, 5])).toBe(true);
    expect(ringsSurround(rings, [15, 5])).toBe(false);
  });
});
