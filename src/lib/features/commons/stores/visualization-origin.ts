import { deepClone } from '../utils/clone.utils';
import {
  getVisualizationOriginMode,
  type ClassificationConfig,
  type PrimitiveConfigKind,
  type PrimitiveConfigMap,
  type VisualizationConfig
} from './visualization.types';

const ORIGIN_TRACKED_UPDATE_KEYS = [
  'polygon',
  'symbol',
  'line',
  'text',
  'modes',
  'primitiveFilters',
  'style',
  'mapping',
  'classification',
  'symbolClassification',
  'lineClassification',
  'lineThicknessClassification',
  'textClassification',
  'symbols',
  'missingData',
  'dataFilters'
] as const;

const DERIVED_CLASSIFICATION_UPDATE_KEYS = new Set<keyof ClassificationConfig>([
  'breaks',
  'counts',
  'colors',
  'labels'
]);

function isDerivedClassificationUpdate(
  currentClassification: VisualizationConfig['classification'],
  classification: Partial<ClassificationConfig> | undefined
): boolean {
  if (!classification) {
    return false;
  }

  const updateKeys = (
    Object.keys(classification) as Array<keyof ClassificationConfig>
  ).filter((key) => {
    const currentValue = currentClassification?.[key];
    const nextValue = classification[key];

    return JSON.stringify(currentValue ?? null) !== JSON.stringify(nextValue);
  });

  return (
    updateKeys.length > 0 &&
    updateKeys.every((key) => DERIVED_CLASSIFICATION_UPDATE_KEYS.has(key))
  );
}

const CLASSIFICATION_LIKE_UPDATE_KEYS = new Set<
  keyof Pick<
    VisualizationConfig,
    | 'classification'
    | 'symbolClassification'
    | 'lineClassification'
    | 'lineThicknessClassification'
    | 'textClassification'
  >
>([
  'classification',
  'symbolClassification',
  'lineClassification',
  'lineThicknessClassification',
  'textClassification'
]);

function isClassificationLikeUpdateKey(
  key: (typeof ORIGIN_TRACKED_UPDATE_KEYS)[number]
): key is
  | 'classification'
  | 'symbolClassification'
  | 'lineClassification'
  | 'lineThicknessClassification'
  | 'textClassification' {
  return CLASSIFICATION_LIKE_UPDATE_KEYS.has(
    key as
      | 'classification'
      | 'symbolClassification'
      | 'lineClassification'
      | 'lineThicknessClassification'
      | 'textClassification'
  );
}

function isPrimitiveConfigUpdateKey(
  key: (typeof ORIGIN_TRACKED_UPDATE_KEYS)[number]
): key is PrimitiveConfigKind {
  return (
    key === 'polygon' || key === 'symbol' || key === 'line' || key === 'text'
  );
}

function isDerivedPrimitiveClassificationUpdate(
  currentPrimitive: PrimitiveConfigMap[PrimitiveConfigKind] | undefined,
  nextPrimitive: PrimitiveConfigMap[PrimitiveConfigKind] | undefined
): boolean {
  if (!currentPrimitive || !nextPrimitive) {
    return false;
  }

  const updateKeys = Object.keys(nextPrimitive).filter((key) => {
    const typedKey = key as keyof typeof nextPrimitive;
    return (
      JSON.stringify(currentPrimitive[typedKey] ?? null) !==
      JSON.stringify(nextPrimitive[typedKey] ?? null)
    );
  });

  if (updateKeys.length !== 1) {
    return false;
  }

  const [onlyKey] = updateKeys;
  if (
    onlyKey === 'classification' &&
    isDerivedClassificationUpdate(
      currentPrimitive.classification,
      nextPrimitive.classification
    )
  ) {
    return true;
  }

  return (
    onlyKey === 'thicknessClassification' &&
    'thicknessClassification' in currentPrimitive &&
    'thicknessClassification' in nextPrimitive &&
    isDerivedClassificationUpdate(
      currentPrimitive.thicknessClassification,
      nextPrimitive.thicknessClassification
    )
  );
}

function touchesVisualizationSemantics(
  visualization: VisualizationConfig,
  updates: Partial<VisualizationConfig>
): boolean {
  return ORIGIN_TRACKED_UPDATE_KEYS.some((key) => {
    if (!Object.prototype.hasOwnProperty.call(updates, key)) {
      return false;
    }

    if (isClassificationLikeUpdateKey(key)) {
      const currentClassification =
        key === 'classification'
          ? visualization.classification
          : key === 'symbolClassification'
            ? visualization.symbolClassification
            : key === 'lineClassification'
              ? visualization.lineClassification
              : key === 'lineThicknessClassification'
                ? visualization.lineThicknessClassification
                : visualization.textClassification;

      const nextClassification = updates[key] as
        Partial<ClassificationConfig> | undefined;

      if (
        isDerivedClassificationUpdate(currentClassification, nextClassification)
      ) {
        return false;
      }
    }

    if (isPrimitiveConfigUpdateKey(key)) {
      const currentPrimitive = visualization[key];
      const nextPrimitive = updates[key] as
        PrimitiveConfigMap[PrimitiveConfigKind] | undefined;

      if (
        isDerivedPrimitiveClassificationUpdate(currentPrimitive, nextPrimitive)
      ) {
        return false;
      }
    }

    return true;
  });
}

export function resolveNextVisualizationOrigin(
  visualization: VisualizationConfig,
  updates: Partial<VisualizationConfig>
): VisualizationConfig['origin'] {
  // An explicit `origin` in the update wins outright. This is also the
  // mechanism the derived/automatic post-suggestion mutations use to stay
  // pinned: callers pass `preserveOrigin` (auto-columns, classification
  // defaults, breaks/colour recompute), which spreads the CURRENT origin into
  // `updates` so a freshly-applied suggestion is never mislabelled `custom`.
  if (Object.prototype.hasOwnProperty.call(updates, 'origin')) {
    return updates.origin;
  }

  const currentMode = getVisualizationOriginMode(visualization);
  if (
    currentMode !== 'auto-suggestion' &&
    currentMode !== 'manual-suggestion'
  ) {
    return visualization.origin;
  }

  if (!touchesVisualizationSemantics(visualization, updates)) {
    return visualization.origin;
  }

  return {
    mode: 'custom',
    ...(visualization.origin?.suggestionKey
      ? { suggestionKey: visualization.origin.suggestionKey }
      : {}),
    ...(visualization.origin?.restoreState
      ? { restoreState: deepClone(visualization.origin.restoreState) }
      : {}),
    ...(visualization.origin?.appliedSuggestionState
      ? {
          appliedSuggestionState: deepClone(
            visualization.origin.appliedSuggestionState
          )
        }
      : {})
  };
}

export function resolveDuplicatedVisualizationOrigin(
  origin: VisualizationConfig['origin']
): VisualizationConfig['origin'] {
  if (!origin) {
    return undefined;
  }

  if (
    origin.mode === 'auto-suggestion' ||
    origin.mode === 'manual-suggestion'
  ) {
    return {
      mode: 'custom',
      ...(origin.suggestionKey ? { suggestionKey: origin.suggestionKey } : {})
    };
  }

  return {
    mode: origin.mode,
    ...(origin.suggestionKey ? { suggestionKey: origin.suggestionKey } : {})
  };
}
