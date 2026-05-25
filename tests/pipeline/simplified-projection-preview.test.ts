import { describe, expect, it } from 'vitest';
import { computeSimplifiedProjectionPreview } from '$lib/features/step-toolbar/tools/projections/simplified-projection-preview';
import type { ProjectionState } from '$lib/features/step-toolbar/types/projections.types';
import { ViewMode } from '$lib/features/commons/constants/ui.constants';

const DEFAULT_STATE: ProjectionState = {
  selected: 'mercator',
  viewMode: ViewMode.LIST,
  longitude: 0,
  latitude: 0,
  rotation: 0
};

const SELECTED_PROJECTION_STATE: ProjectionState = {
  ...DEFAULT_STATE,
  selected: 'robinson',
  overrideActive: true,
  overrideSource: 'manual'
};

describe('computeSimplifiedProjectionPreview', () => {
  it('does not mask layers when a projection is selected but no manual parameters are set', () => {
    expect(
      computeSimplifiedProjectionPreview(true, SELECTED_PROJECTION_STATE)
    ).toBe(false);
  });

  it('does not mask layers when applying a suggestion or custom CRS without manual parameters', () => {
    expect(
      computeSimplifiedProjectionPreview(true, {
        ...DEFAULT_STATE,
        customCode: '+proj=robin +datum=WGS84',
        overrideActive: true,
        overrideSource: 'manual'
      })
    ).toBe(false);
  });

  it('masks layers while manual longitude is being adjusted', () => {
    expect(
      computeSimplifiedProjectionPreview(true, {
        ...SELECTED_PROJECTION_STATE,
        longitude: 15
      })
    ).toBe(true);
  });

  it('masks layers while manual latitude or rotation is being adjusted', () => {
    expect(
      computeSimplifiedProjectionPreview(true, {
        ...SELECTED_PROJECTION_STATE,
        latitude: 48
      })
    ).toBe(true);
    expect(
      computeSimplifiedProjectionPreview(true, {
        ...SELECTED_PROJECTION_STATE,
        rotation: 30
      })
    ).toBe(true);
  });

  it('respects the simplified preview toggle when manual parameters are set', () => {
    expect(
      computeSimplifiedProjectionPreview(true, {
        ...SELECTED_PROJECTION_STATE,
        rotation: 30,
        simplifiedPreview: false
      })
    ).toBe(false);
  });

  it('defaults the simplified preview to on for manual parameters', () => {
    expect(
      computeSimplifiedProjectionPreview(true, {
        ...SELECTED_PROJECTION_STATE,
        rotation: 30,
        simplifiedPreview: undefined
      })
    ).toBe(true);
  });

  it('never masks layers outside orthographic mode', () => {
    expect(
      computeSimplifiedProjectionPreview(false, {
        ...SELECTED_PROJECTION_STATE,
        rotation: 30
      })
    ).toBe(false);
  });

  it('never masks layers for an auto (basemap-preferred) override', () => {
    expect(
      computeSimplifiedProjectionPreview(true, {
        ...DEFAULT_STATE,
        rotation: 30,
        overrideActive: true,
        overrideSource: 'auto'
      })
    ).toBe(false);
  });
});
