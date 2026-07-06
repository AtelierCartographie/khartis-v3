import { describe, expect, it } from 'vitest';
import {
  NEUTRAL_CARTOGRAPHY_COLORS,
  NEUTRAL_CARTOGRAPHY_RGBA_COLORS
} from '$lib/features/commons/constants/colors.constants';
import stylePresetsJson from '../../../../../static/basemaps/style-presets.json';
import type {
  PathStylePreset,
  PolygonStylePreset
} from '../types/basemap.types';

const stylePresets = stylePresetsJson as unknown as Record<
  string,
  PathStylePreset | PolygonStylePreset
>;

function expectPathPresetColor(
  name: string,
  color: readonly [number, number, number, number]
): void {
  const preset = stylePresets[name];
  expect(preset?.layer_type).toBe('path');
  expect((preset as PathStylePreset).color).toEqual([...color]);
}

function expectPolygonPresetFillColor(
  name: string,
  fillColor: readonly [number, number, number, number]
): void {
  const preset = stylePresets[name];
  expect(preset?.layer_type).toBe('solid-polygon');
  expect((preset as PolygonStylePreset).fillColor).toEqual([...fillColor]);
}

describe('neutral cartography colors', () => {
  it('keeps visualization neutral fill distinct from land and sea defaults', () => {
    expect(NEUTRAL_CARTOGRAPHY_COLORS.dataFill).not.toBe(
      NEUTRAL_CARTOGRAPHY_COLORS.land
    );
    expect(NEUTRAL_CARTOGRAPHY_COLORS.land).not.toBe(
      NEUTRAL_CARTOGRAPHY_COLORS.sea
    );
    expect(NEUTRAL_CARTOGRAPHY_COLORS.nutsLand).not.toBe(
      NEUTRAL_CARTOGRAPHY_COLORS.land
    );
  });

  it('keeps static basemap style presets aligned with the neutral palette', () => {
    expectPathPresetColor(
      'limit-level-0',
      NEUTRAL_CARTOGRAPHY_RGBA_COLORS.boundaryFine
    );
    expectPathPresetColor(
      'limit-dashed',
      NEUTRAL_CARTOGRAPHY_RGBA_COLORS.boundaryFine
    );
    expectPathPresetColor(
      'limit-level-1',
      NEUTRAL_CARTOGRAPHY_RGBA_COLORS.boundaryMedium
    );
    expectPathPresetColor(
      'limit-level-2',
      NEUTRAL_CARTOGRAPHY_RGBA_COLORS.boundaryBold
    );
    expectPathPresetColor(
      'limit-country',
      NEUTRAL_CARTOGRAPHY_RGBA_COLORS.boundaryCountry
    );
    expectPathPresetColor(
      'limit-context',
      NEUTRAL_CARTOGRAPHY_RGBA_COLORS.boundaryContext
    );
    expectPolygonPresetFillColor('land', NEUTRAL_CARTOGRAPHY_RGBA_COLORS.land);
    expectPolygonPresetFillColor(
      'nuts-land',
      NEUTRAL_CARTOGRAPHY_RGBA_COLORS.nutsLand
    );
    expectPathPresetColor(
      'graticule',
      NEUTRAL_CARTOGRAPHY_RGBA_COLORS.graticule
    );
    expectPathPresetColor(
      'geographic-lines',
      NEUTRAL_CARTOGRAPHY_RGBA_COLORS.geographicLine
    );
  });
});
