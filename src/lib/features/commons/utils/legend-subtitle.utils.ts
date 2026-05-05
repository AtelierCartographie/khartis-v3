import type { VisualizationConfig } from '$lib/features/commons/stores/visualization.store.svelte';
import {
  ColorMode,
  FillMode,
  ProportionalType,
  SymbolMode,
  ThicknessMode
} from '$lib/features/commons/constants/visualization.constants';

export function joinLegendSubtitleParts(
  parts: Array<string | null | undefined>
): string {
  const unique: string[] = [];

  for (const part of parts) {
    const normalized = part?.trim();
    if (!normalized || unique.includes(normalized)) {
      continue;
    }

    unique.push(normalized);
  }

  return unique.join(' / ');
}

export function getVisualizationLegendSubtitleParts(
  visualization: VisualizationConfig
): Array<string | undefined> {
  const symbolEnabled = Boolean(visualization.symbol?.enabled);
  const polygonEnabled = Boolean(visualization.polygon?.enabled);
  const lineEnabled = Boolean(visualization.line?.enabled);
  const textEnabled = Boolean(visualization.text?.enabled);

  if (symbolEnabled && !polygonEnabled && !lineEnabled && !textEnabled) {
    return getPointLegendSubtitleParts(visualization);
  }

  if (polygonEnabled && !symbolEnabled && !lineEnabled && !textEnabled) {
    return visualization.polygon?.fillMode === 'categories'
      ? [
          visualization.polygon?.categoryColumn ??
            visualization.mapping.categoryColumn,
          visualization.polygon?.valueColumn ??
            visualization.mapping.valueColumn
        ]
      : [
          visualization.polygon?.valueColumn ??
            visualization.mapping.valueColumn,
          visualization.polygon?.categoryColumn ??
            visualization.mapping.categoryColumn
        ];
  }

  if (lineEnabled && !symbolEnabled && !polygonEnabled && !textEnabled) {
    return getLineLegendSubtitleParts(visualization);
  }

  if (textEnabled && !symbolEnabled && !polygonEnabled && !lineEnabled) {
    return visualization.text?.colorMode === 'categories'
      ? [
          visualization.text?.categoryColumn,
          visualization.text?.valueColumn,
          visualization.text?.labelColumn
        ]
      : [
          visualization.text?.valueColumn,
          visualization.text?.categoryColumn,
          visualization.text?.labelColumn
        ];
  }

  return visualization.modes?.fill === 'categories'
    ? [
        visualization.mapping.categoryColumn,
        visualization.mapping.valueColumn,
        visualization.mapping.sizeColumn,
        visualization.mapping.colorColumn
      ]
    : [
        visualization.mapping.sizeColumn,
        visualization.mapping.valueColumn,
        visualization.mapping.categoryColumn,
        visualization.mapping.colorColumn
      ];
}

export function getVisualizationLegendSubtitle(
  visualization: VisualizationConfig
): string {
  return joinLegendSubtitleParts(
    getVisualizationLegendSubtitleParts(visualization)
  );
}

function getPointLegendSubtitleParts(
  visualization: VisualizationConfig
): Array<string | undefined> {
  const symbol = visualization.symbol;
  if (!symbol?.enabled) {
    return [];
  }

  const parts: Array<string | undefined> = [];

  if (
    symbol.mode === SymbolMode.PROPORTIONAL ||
    symbol.mode === SymbolMode.CLASSES
  ) {
    parts.push(symbol.sizeColumn ?? visualization.mapping.sizeColumn);
  } else if (symbol.mode === SymbolMode.CATEGORIES) {
    parts.push(symbol.categoryColumn ?? visualization.mapping.categoryColumn);
  }

  if (symbol.proportionalType === ProportionalType.DOUBLE) {
    parts.push(symbol.valueColumn ?? visualization.mapping.valueColumn);
  }

  if (symbol.fillMode === FillMode.CATEGORIES) {
    parts.unshift(
      symbol.fillCategoryColumn ??
        visualization.mapping.colorColumn ??
        visualization.mapping.categoryColumn
    );
  } else if (symbol.fillMode === FillMode.CLASSES) {
    parts.push(
      symbol.fillValueColumn ??
        visualization.mapping.colorColumn ??
        visualization.mapping.valueColumn
    );
  }

  return parts;
}

function getLineLegendSubtitleParts(
  visualization: VisualizationConfig
): Array<string | undefined> {
  const line = visualization.line;
  if (!line?.enabled) {
    return [];
  }

  const parts: Array<string | undefined> = [];

  if (
    line.thicknessMode === ThicknessMode.PROPORTIONAL ||
    line.thicknessMode === ThicknessMode.CLASSES
  ) {
    parts.push(line.sizeColumn ?? visualization.mapping.sizeColumn);
  }

  if (line.colorMode === ColorMode.CATEGORIES) {
    parts.unshift(line.categoryColumn ?? visualization.mapping.categoryColumn);
  } else if (line.colorMode === ColorMode.CLASSES) {
    parts.push(
      line.valueColumn ??
        visualization.mapping.colorColumn ??
        visualization.mapping.valueColumn
    );
  }

  return parts;
}
