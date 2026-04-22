import type {
  LinePrimitiveConfig,
  VisualizationConfig,
  VisualizationModes
} from '$lib/features/commons/store/visualization.store.svelte';
import { ColorMode, ThicknessMode } from '../constants';

type LineModeUpdates = Pick<VisualizationModes, 'color' | 'thickness'>;
type MappingUpdates = Partial<VisualizationConfig['mapping']>;

function hasOwnKey<T extends object>(value: T, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export function resolveLineModeTransition(
  line: LinePrimitiveConfig,
  updates: Partial<LineModeUpdates>
): {
  nextLineUpdates: Partial<LinePrimitiveConfig>;
  nextMappingUpdates: MappingUpdates;
} {
  const nextColorMode = hasOwnKey(updates, 'color')
    ? (updates.color ?? line.colorMode)
    : line.colorMode;
  const nextThicknessMode = hasOwnKey(updates, 'thickness')
    ? (updates.thickness ?? line.thicknessMode)
    : line.thicknessMode;

  const usesValueColumn =
    nextColorMode === ColorMode.CLASSES ||
    nextThicknessMode === ThicknessMode.CLASSES;
  const usesCategoryColumn = nextColorMode === ColorMode.CATEGORIES;
  const usesSizeColumn = nextThicknessMode === ThicknessMode.PROPORTIONAL;
  const currentUsesValueColumn =
    line.colorMode === ColorMode.CLASSES ||
    line.thicknessMode === ThicknessMode.CLASSES;

  const nextLineUpdates: Partial<LinePrimitiveConfig> = {
    ...(hasOwnKey(updates, 'color') ? { colorMode: nextColorMode } : {}),
    ...(hasOwnKey(updates, 'thickness')
      ? { thicknessMode: nextThicknessMode }
      : {})
  };
  const nextMappingUpdates: MappingUpdates = {};

  if (!currentUsesValueColumn && usesValueColumn && line.sizeColumn) {
    nextLineUpdates.valueColumn = line.sizeColumn;
    nextMappingUpdates.valueColumn = line.sizeColumn;
  }

  if (!usesValueColumn && line.valueColumn !== undefined) {
    nextLineUpdates.valueColumn = undefined;
    nextMappingUpdates.valueColumn = undefined;
  }

  if (!usesCategoryColumn && line.categoryColumn !== undefined) {
    nextLineUpdates.categoryColumn = undefined;
    nextMappingUpdates.categoryColumn = undefined;
  }

  if (!usesSizeColumn && line.sizeColumn !== undefined) {
    nextLineUpdates.sizeColumn = undefined;
    nextMappingUpdates.sizeColumn = undefined;
  }

  return { nextLineUpdates, nextMappingUpdates };
}
