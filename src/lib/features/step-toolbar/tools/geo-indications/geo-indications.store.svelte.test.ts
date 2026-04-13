import { beforeEach, describe, expect, it } from 'vitest';
import { PageModel } from '$lib/features/commons/constants/ui.constants';
import { formatActions } from '../format/format.store.svelte';
import {
  geoIndicationsActions,
  geoIndicationsState
} from './geo-indications.store.svelte';

describe('geo indications store responsive defaults', () => {
  beforeEach(() => {
    formatActions.reset();
    geoIndicationsActions.reset();
  });

  it('promotes default sizes to the A3 profile on first enable', () => {
    formatActions.setModel(PageModel.A3_LANDSCAPE);

    geoIndicationsActions.toggleScale();
    geoIndicationsActions.toggleOrientation();
    geoIndicationsActions.toggleInsetMap();

    expect(geoIndicationsState.scale.fontSize).toBe(14);
    expect(geoIndicationsState.orientation.size).toBe(12);
    expect(geoIndicationsState.insetMap.size).toBe(200);
  });

  it('keeps custom geo-indication sizes when they were already changed', () => {
    geoIndicationsActions.setScaleFontSize(18);
    geoIndicationsActions.setOrientationSize(18);
    geoIndicationsActions.setInsetMapSize(320);
    formatActions.setModel(PageModel.SCREEN_LANDSCAPE);

    geoIndicationsActions.toggleScale();
    geoIndicationsActions.toggleOrientation();
    geoIndicationsActions.toggleInsetMap();

    expect(geoIndicationsState.scale.fontSize).toBe(18);
    expect(geoIndicationsState.orientation.size).toBe(18);
    expect(geoIndicationsState.insetMap.size).toBe(320);
  });
});
