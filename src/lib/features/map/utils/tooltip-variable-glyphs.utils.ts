import {
  ColorMode,
  FillMode,
  SizeMode,
  StrokeMode,
  SymbolMode,
  ThicknessMode
} from '$lib/features/commons/constants/visualization.constants';
import {
  getLinePrimitive,
  getPolygonPrimitive,
  getPrimitiveCategoryColumn,
  getPrimitiveSizeColumn,
  getSymbolFillCategoryColumn,
  getSymbolFillValueColumn,
  getSymbolPrimitive,
  getTextPrimitive,
  PrimitiveFilterType,
  type VisualizationConfig
} from '$lib/features/commons/stores/visualization.store.svelte';

import type { TooltipGlyph } from '../types';
import { usesDoubleProportionalSymbols } from '../layers/symbol-layer.utils';
import {
  shouldApplyCategorical,
  shouldApplyChoropleth,
  shouldApplyProportionalSymbols
} from './data-styling.utils';

type GlyphsByColumn = Map<string, TooltipGlyph[]>;

function add(
  glyphs: GlyphsByColumn,
  column: string | undefined,
  glyph: TooltipGlyph
): void {
  if (!column) return;
  const list = glyphs.get(column) ?? [];
  if (
    !list.some(
      (existing) =>
        existing.primitive === glyph.primitive &&
        existing.channel === glyph.channel
    )
  ) {
    list.push(glyph);
  }
  glyphs.set(column, list);
}

function addPolygonGlyphs(glyphs: GlyphsByColumn, viz: VisualizationConfig) {
  const polygon = getPolygonPrimitive(viz);
  if (!polygon?.enabled) return;
  const glyph: TooltipGlyph = {
    primitive: PrimitiveFilterType.POLYGON,
    channel: 'color'
  };
  if (polygon.fillMode === FillMode.DENSITY) {
    add(glyphs, viz.density?.valueColumn, {
      primitive: PrimitiveFilterType.POLYGON,
      channel: 'density'
    });
  } else if (shouldApplyChoropleth(viz, PrimitiveFilterType.POLYGON)) {
    add(glyphs, polygon.valueColumn, glyph);
  } else if (shouldApplyCategorical(viz, PrimitiveFilterType.POLYGON)) {
    add(glyphs, polygon.categoryColumn, glyph);
  }
  const stroke: TooltipGlyph = {
    primitive: PrimitiveFilterType.POLYGON,
    channel: 'stroke'
  };
  if (polygon.strokeMode === StrokeMode.CLASSES) {
    add(glyphs, polygon.strokeValueColumn, stroke);
  } else if (polygon.strokeMode === StrokeMode.CATEGORIES) {
    add(glyphs, polygon.strokeCategoryColumn, stroke);
  }
}

function addSymbolGlyphs(glyphs: GlyphsByColumn, viz: VisualizationConfig) {
  const symbol = getSymbolPrimitive(viz);
  if (!symbol?.enabled) return;
  const shape = symbol.shape;
  const glyph = (channel: TooltipGlyph['channel']): TooltipGlyph => ({
    primitive: PrimitiveFilterType.POINT,
    channel,
    shape
  });

  if (shouldApplyProportionalSymbols(viz)) {
    add(
      glyphs,
      getPrimitiveSizeColumn(viz, PrimitiveFilterType.POINT),
      glyph('size')
    );
  }
  // Double symbols draw a second value beside the first, in its own color.
  if (usesDoubleProportionalSymbols(viz)) {
    add(glyphs, symbol.valueColumn, { ...glyph('size'), secondary: true });
  }
  if (symbol.mode === SymbolMode.CATEGORIES) {
    add(
      glyphs,
      getPrimitiveCategoryColumn(viz, PrimitiveFilterType.POINT),
      glyph('color')
    );
  } else if (shouldApplyChoropleth(viz, PrimitiveFilterType.POINT)) {
    add(glyphs, getSymbolFillValueColumn(viz), glyph('color'));
  } else if (shouldApplyCategorical(viz, PrimitiveFilterType.POINT)) {
    add(glyphs, getSymbolFillCategoryColumn(viz), glyph('color'));
  }
  if (symbol.strokeMode === StrokeMode.CLASSES) {
    add(glyphs, symbol.strokeValueColumn, glyph('stroke'));
  } else if (symbol.strokeMode === StrokeMode.CATEGORIES) {
    add(glyphs, symbol.strokeCategoryColumn, glyph('stroke'));
  }
}

function addLineGlyphs(glyphs: GlyphsByColumn, viz: VisualizationConfig) {
  const line = getLinePrimitive(viz);
  if (!line?.enabled) return;
  const glyph = (channel: TooltipGlyph['channel']): TooltipGlyph => ({
    primitive: PrimitiveFilterType.LINE,
    channel
  });
  if (shouldApplyChoropleth(viz, PrimitiveFilterType.LINE)) {
    add(glyphs, line.valueColumn, glyph('color'));
  } else if (shouldApplyCategorical(viz, PrimitiveFilterType.LINE)) {
    add(glyphs, line.categoryColumn, glyph('color'));
  }
  if (line.thicknessMode === ThicknessMode.PROPORTIONAL) {
    add(glyphs, line.sizeColumn, glyph('size'));
  } else if (line.thicknessMode === ThicknessMode.CLASSES) {
    add(
      glyphs,
      line.thicknessModeStates?.[ThicknessMode.CLASSES]?.valueColumn ??
        line.valueColumn,
      glyph('size')
    );
  }
}

function addTextGlyphs(glyphs: GlyphsByColumn, viz: VisualizationConfig) {
  const text = getTextPrimitive(viz);
  if (!text?.enabled) return;
  const glyph = (channel: TooltipGlyph['channel']): TooltipGlyph => ({
    primitive: PrimitiveFilterType.TEXT,
    channel
  });
  add(glyphs, text.labelColumn, glyph('label'));
  if (text.secondaryLabels.enabled) {
    add(glyphs, text.secondaryLabels.labelColumn, glyph('label'));
  }
  if (text.colorMode === ColorMode.CLASSES) {
    add(glyphs, text.valueColumn, glyph('color'));
  } else if (text.colorMode === ColorMode.CATEGORIES) {
    add(glyphs, text.categoryColumn, glyph('color'));
  }
  if (text.sizeMode !== SizeMode.FIXED) {
    add(
      glyphs,
      text.sizeModeStates?.[text.sizeMode]?.valueColumn ?? text.valueColumn,
      glyph('size')
    );
  }
}

/**
 * How each column of a visualization is drawn: by which primitive (a symbol
 * of a given shape, an area, a line, a text) and through which channel.
 */
export function resolveVariableGlyphs(
  viz: VisualizationConfig
): GlyphsByColumn {
  const glyphs: GlyphsByColumn = new Map();
  addPolygonGlyphs(glyphs, viz);
  addSymbolGlyphs(glyphs, viz);
  addLineGlyphs(glyphs, viz);
  addTextGlyphs(glyphs, viz);
  return glyphs;
}
