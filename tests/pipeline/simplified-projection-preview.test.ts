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
  it('does not mask layers when the simplified preview is off', () => {
    expect(
      computeSimplifiedProjectionPreview(true, {
        ...SELECTED_PROJECTION_STATE,
        simplifiedPreview: false
      })
    ).toBe(false);
  });

  it('masks layers when the simplified preview is on for a manual override', () => {
    expect(
      computeSimplifiedProjectionPreview(true, {
        ...SELECTED_PROJECTION_STATE,
        simplifiedPreview: true
      })
    ).toBe(true);
  });

  it('masks custom CRS and suggestions when the simplified preview is on', () => {
    expect(
      computeSimplifiedProjectionPreview(true, {
        ...DEFAULT_STATE,
        customCode: '+proj=robin +datum=WGS84',
        overrideActive: true,
        overrideSource: 'manual',
        simplifiedPreview: true
      })
    ).toBe(true);
  });

  it('keeps masking while manual longitude, latitude or rotation are adjusted', () => {
    expect(
      computeSimplifiedProjectionPreview(true, {
        ...SELECTED_PROJECTION_STATE,
        longitude: 15,
        simplifiedPreview: true
      })
    ).toBe(true);
    expect(
      computeSimplifiedProjectionPreview(true, {
        ...SELECTED_PROJECTION_STATE,
        latitude: 48,
        simplifiedPreview: true
      })
    ).toBe(true);
    expect(
      computeSimplifiedProjectionPreview(true, {
        ...SELECTED_PROJECTION_STATE,
        rotation: 30,
        simplifiedPreview: true
      })
    ).toBe(true);
  });

  it('defaults the simplified preview to off for manual parameters', () => {
    expect(
      computeSimplifiedProjectionPreview(true, {
        ...SELECTED_PROJECTION_STATE,
        rotation: 30,
        simplifiedPreview: undefined
      })
    ).toBe(false);
  });

  it('never masks layers outside orthographic mode', () => {
    expect(
      computeSimplifiedProjectionPreview(false, {
        ...SELECTED_PROJECTION_STATE,
        rotation: 30,
        simplifiedPreview: true
      })
    ).toBe(false);
  });

  it('never masks layers for an auto (basemap-preferred) override', () => {
    expect(
      computeSimplifiedProjectionPreview(true, {
        ...DEFAULT_STATE,
        rotation: 30,
        overrideActive: true,
        overrideSource: 'auto',
        simplifiedPreview: true
      })
    ).toBe(false);
  });
});
