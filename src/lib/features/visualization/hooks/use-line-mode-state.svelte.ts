import type {
  LineColorModeState,
  LinePrimitiveConfig,
  LineThicknessModeState,
  VisualizationConfig,
  VisualizationModes
} from '$lib/features/commons/stores/visualization.store.svelte';
import {
  isHiddenTechnicalColumnName,
  isIdLikeColumnName
} from '$lib/features/commons/utils/visualization-columns.utils';
import {
  ColorMode,
  DEFAULT_COLORS,
  ThicknessMode,
  VISUALIZATION_DEFAULTS
} from '$lib/features/commons/constants/visualization.constants';
import { snapshotByKeys } from '../utils/mode-snapshot.utils';

type LineModeUpdates = Pick<VisualizationModes, 'color' | 'thickness'>;
type MappingUpdates = Partial<VisualizationConfig['mapping']>;

const LINE_COLOR_MODE_STATE_KEYS = [
  'color',
  'valueColumn',
  'categoryColumn',
  'classification'
] as const satisfies readonly (keyof LineColorModeState)[];

const LINE_THICKNESS_MODE_STATE_KEYS = [
  'width',
  'maxWidth',
  'valueColumn',
  'sizeColumn',
  'thicknessClassification'
] as const satisfies readonly (keyof LineThicknessModeState)[];

function hasOwnKey<T extends object>(value: T, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isReusableSharedValueColumn(value?: string): value is string {
  return (
    !!value &&
    !isHiddenTechnicalColumnName(value) &&
    (!isIdLikeColumnName(value) || value === 'id')
  );
}

export function snapshotLineColorModeState(
  line: LinePrimitiveConfig
): LineColorModeState {
  return snapshotByKeys(line, LINE_COLOR_MODE_STATE_KEYS) as LineColorModeState;
}

export function snapshotLineThicknessModeState(
  line: LinePrimitiveConfig
): LineThicknessModeState {
  return snapshotByKeys(
    line,
    LINE_THICKNESS_MODE_STATE_KEYS
  ) as LineThicknessModeState;
}

function getDefaultLineColorModeState(mode: ColorMode): LineColorModeState {
  switch (mode) {
    case ColorMode.UNIQUE:
      return { color: DEFAULT_COLORS.line };
    case ColorMode.CLASSES:
    case ColorMode.CATEGORIES:
    case ColorMode.NONE:
    default:
      return {};
  }
}

function getDefaultLineThicknessModeState(
  mode: ThicknessMode
): LineThicknessModeState {
  switch (mode) {
    case ThicknessMode.UNIQUE:
      return { width: VISUALIZATION_DEFAULTS.lineWidth };
    case ThicknessMode.PROPORTIONAL:
    case ThicknessMode.CLASSES:
      return { maxWidth: VISUALIZATION_DEFAULTS.lineMaxWidth };
    case ThicknessMode.NONE:
    default:
      return {};
  }
}

function resolveSharedValueColumn(options: {
  line: LinePrimitiveConfig;
  nextColorMode: ColorMode;
  nextThicknessMode: ThicknessMode;
  colorChanging: boolean;
  thicknessChanging: boolean;
  nextColorState: LineColorModeState;
  nextThicknessState: LineThicknessModeState;
}): string | undefined {
  const {
    line,
    nextColorMode,
    nextThicknessMode,
    colorChanging,
    thicknessChanging,
    nextColorState,
    nextThicknessState
  } = options;

  const usesColorClasses = nextColorMode === ColorMode.CLASSES;
  const usesThicknessClasses = nextThicknessMode === ThicknessMode.CLASSES;
  if (!usesColorClasses && !usesThicknessClasses) {
    return undefined;
  }

  const preservesCurrentValueColumn =
    !!line.valueColumn &&
    ((!colorChanging &&
      line.colorMode === ColorMode.CLASSES &&
      usesColorClasses) ||
      (!thicknessChanging &&
        line.thicknessMode === ThicknessMode.CLASSES &&
        usesThicknessClasses));

  if (preservesCurrentValueColumn) {
    return line.valueColumn;
  }

  if (usesThicknessClasses && nextThicknessState.valueColumn) {
    return nextThicknessState.valueColumn;
  }

  if (usesColorClasses && nextColorState.valueColumn) {
    return nextColorState.valueColumn;
  }

  const promotedSizeColumn = usesThicknessClasses
    ? thicknessChanging
      ? nextThicknessState.sizeColumn
      : line.sizeColumn
    : undefined;

  if (isReusableSharedValueColumn(promotedSizeColumn)) {
    return promotedSizeColumn;
  }

  return undefined;
}

export function resolveLineModeTransition(
  line: LinePrimitiveConfig,
  updates: Partial<LineModeUpdates>
): {
  nextLineUpdates: Partial<LinePrimitiveConfig>;
  nextMappingUpdates: MappingUpdates;
  nextVisualizationUpdates: Partial<
    Pick<
      VisualizationConfig,
      'lineClassification' | 'lineThicknessClassification'
    >
  >;
} {
  const colorChanging =
    hasOwnKey(updates, 'color') &&
    updates.color !== undefined &&
    updates.color !== line.colorMode;
  const thicknessChanging =
    hasOwnKey(updates, 'thickness') &&
    updates.thickness !== undefined &&
    updates.thickness !== line.thicknessMode;

  const nextColorMode = colorChanging ? updates.color! : line.colorMode;
  const nextThicknessMode = thicknessChanging
    ? updates.thickness!
    : line.thicknessMode;

  const nextColorModeStates = colorChanging
    ? {
        ...(line.colorModeStates ?? {}),
        [line.colorMode]: snapshotLineColorModeState(line)
      }
    : line.colorModeStates;
  const nextThicknessModeStates = thicknessChanging
    ? {
        ...(line.thicknessModeStates ?? {}),
        [line.thicknessMode]: snapshotLineThicknessModeState(line)
      }
    : line.thicknessModeStates;

  const nextColorState = colorChanging
    ? {
        ...getDefaultLineColorModeState(nextColorMode),
        ...(nextColorModeStates?.[nextColorMode] ?? {})
      }
    : snapshotLineColorModeState(line);
  const nextThicknessState = thicknessChanging
    ? {
        ...getDefaultLineThicknessModeState(nextThicknessMode),
        ...(nextThicknessModeStates?.[nextThicknessMode] ?? {})
      }
    : snapshotLineThicknessModeState(line);

  const nextValueColumn = resolveSharedValueColumn({
    line,
    nextColorMode,
    nextThicknessMode,
    colorChanging,
    thicknessChanging,
    nextColorState,
    nextThicknessState
  });
  const nextCategoryColumn =
    nextColorMode === ColorMode.CATEGORIES
      ? colorChanging
        ? nextColorState.categoryColumn
        : line.categoryColumn
      : undefined;
  const nextSizeColumn =
    nextThicknessMode === ThicknessMode.PROPORTIONAL
      ? thicknessChanging
        ? nextThicknessState.sizeColumn
        : line.sizeColumn
      : undefined;
  const nextClassification =
    nextColorMode === ColorMode.CLASSES ||
    nextColorMode === ColorMode.CATEGORIES
      ? colorChanging
        ? nextColorState.classification
        : line.classification
      : undefined;
  const nextThicknessClassification =
    nextThicknessMode === ThicknessMode.CLASSES
      ? thicknessChanging
        ? nextThicknessState.thicknessClassification
        : line.thicknessClassification
      : undefined;

  const nextLineUpdates: Partial<LinePrimitiveConfig> = {
    ...(colorChanging ? { colorMode: nextColorMode } : {}),
    ...(thicknessChanging ? { thicknessMode: nextThicknessMode } : {}),
    ...(colorChanging || thicknessChanging
      ? {
          valueColumn: nextValueColumn,
          colorModeStates: nextColorModeStates,
          thicknessModeStates: nextThicknessModeStates
        }
      : {}),
    ...(colorChanging
      ? {
          classification: nextClassification,
          categoryColumn: nextCategoryColumn,
          ...(nextColorMode === ColorMode.UNIQUE
            ? { color: nextColorState.color ?? DEFAULT_COLORS.line }
            : {})
        }
      : {}),
    ...(thicknessChanging
      ? {
          sizeColumn: nextSizeColumn,
          thicknessClassification: nextThicknessClassification,
          ...(nextThicknessMode === ThicknessMode.UNIQUE
            ? {
                width:
                  nextThicknessState.width ?? VISUALIZATION_DEFAULTS.lineWidth
              }
            : {}),
          ...(nextThicknessMode === ThicknessMode.PROPORTIONAL ||
          nextThicknessMode === ThicknessMode.CLASSES
            ? {
                maxWidth:
                  nextThicknessState.maxWidth ??
                  VISUALIZATION_DEFAULTS.lineMaxWidth
              }
            : {})
        }
      : {})
  };

  const nextMappingUpdates: MappingUpdates = {
    ...(colorChanging || thicknessChanging
      ? { valueColumn: nextValueColumn }
      : {}),
    ...(colorChanging ? { categoryColumn: nextCategoryColumn } : {}),
    ...(thicknessChanging ? { sizeColumn: nextSizeColumn } : {})
  };

  return {
    nextLineUpdates,
    nextMappingUpdates,
    nextVisualizationUpdates: {
      ...(colorChanging ? { lineClassification: nextClassification } : {}),
      ...(thicknessChanging
        ? { lineThicknessClassification: nextThicknessClassification }
        : {})
    }
  };
}
