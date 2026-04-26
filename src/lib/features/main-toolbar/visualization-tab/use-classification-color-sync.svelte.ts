import { untrack } from 'svelte';
import {
  PrimitiveFilterType,
  type ClassificationConfig
} from '$lib/features/commons/store/visualization.store.svelte';
import {
  getColorBlindnessState,
  isColorBlindnessActive
} from '$lib/features/step-toolbar/tools/color-blindness/color-blindness.store.svelte';
import {
  areClassificationColorsEqual,
  buildClassificationColorParamsKey,
  resolveClassificationColors,
  SYMBOL_FILL_SCOPE_TARGET,
  TEXT_BACKGROUND_SCOPE_TARGET
} from './use-classification-breaks.svelte';
import type {
  ClassifiablePrimitive,
  StrokeClassifiablePrimitive
} from './use-primitive-panel-controller.svelte';

export interface ClassificationTarget {
  primitive: ClassifiablePrimitive;
  valueColumn: string | undefined;
  categoryColumn: string | undefined;
  classification: ClassificationConfig | undefined;
  usesBreaks: boolean;
  usesCategories: boolean;
}

export interface StrokeClassificationTarget {
  primitive: StrokeClassifiablePrimitive;
  valueColumn: string | undefined;
  categoryColumn: string | undefined;
  classification: ClassificationConfig | undefined;
  usesBreaks: boolean;
  usesCategories: boolean;
}

export interface ScopeTarget {
  classification: ClassificationConfig | undefined;
  usesBreaks: boolean;
  usesCategories: boolean;
  valueColumn?: string;
  categoryColumn?: string;
}

export interface UseClassificationColorSyncDeps {
  getSelectedVisualizationId: () => string | undefined;
  getPrimitiveTargets: () => ClassificationTarget[];
  getStrokeTargets: () => StrokeClassificationTarget[];
  getSymbolFillTarget: () => ScopeTarget | null;
  getTextBackgroundTarget: () => ScopeTarget | null;
  getTextBackgroundStrokeTarget: () => ScopeTarget | null;
  updatePrimitiveClassificationState: (
    primitive: ClassifiablePrimitive,
    updates: Partial<ClassificationConfig>
  ) => void;
  updatePrimitiveStrokeClassificationState: (
    primitive: StrokeClassifiablePrimitive,
    updates: Partial<ClassificationConfig>
  ) => void;
  applySymbolFillUpdate: (updates: Partial<ClassificationConfig>) => void;
  applyTextBackgroundUpdate: (updates: Partial<ClassificationConfig>) => void;
  applyTextBackgroundStrokeUpdate: (
    updates: Partial<ClassificationConfig>
  ) => void;
}

export function buildPrimitiveColorParamsKey(
  primitiveTargets: ClassificationTarget[],
  symbolFillTarget: ScopeTarget | null,
  textBackgroundTarget: ScopeTarget | null
): string {
  const cbEnabled = isColorBlindnessActive(getColorBlindnessState());
  return [
    String(cbEnabled),
    ...primitiveTargets.map((target) =>
      buildClassificationColorParamsKey(String(target.primitive), target)
    ),
    buildClassificationColorParamsKey(
      SYMBOL_FILL_SCOPE_TARGET,
      symbolFillTarget
    ),
    buildClassificationColorParamsKey(
      TEXT_BACKGROUND_SCOPE_TARGET,
      textBackgroundTarget
    )
  ].join('|');
}

export function buildStrokeColorParamsKey(
  strokeTargets: StrokeClassificationTarget[],
  textBackgroundStrokeTarget: ScopeTarget | null
): string {
  const cbEnabled = isColorBlindnessActive(getColorBlindnessState());
  return [
    String(cbEnabled),
    ...strokeTargets.map((target) =>
      buildClassificationColorParamsKey(String(target.primitive), target)
    ),
    buildClassificationColorParamsKey(
      `${TEXT_BACKGROUND_SCOPE_TARGET}-stroke`,
      textBackgroundStrokeTarget
    )
  ].join('|');
}

function syncClassificationColors(
  classification: ClassificationConfig | undefined,
  usesCategories: boolean,
  applyUpdate: (updates: Partial<ClassificationConfig>) => void
): void {
  const colors = resolveClassificationColors({
    classification,
    usesCategories
  });
  if (!colors || areClassificationColorsEqual(classification?.colors, colors)) {
    return;
  }

  applyUpdate({ colors });
}

export function syncPrimitiveColors(
  deps: UseClassificationColorSyncDeps
): void {
  untrack(() => {
    if (!deps.getSelectedVisualizationId()) {
      return;
    }

    for (const target of deps.getPrimitiveTargets()) {
      if (!target.usesBreaks && !target.usesCategories) {
        continue;
      }

      syncClassificationColors(
        target.classification,
        target.usesCategories,
        (updates) =>
          deps.updatePrimitiveClassificationState(target.primitive, updates)
      );
    }

    const symbolFill = deps.getSymbolFillTarget();
    if (symbolFill) {
      syncClassificationColors(
        symbolFill.classification,
        symbolFill.usesCategories,
        deps.applySymbolFillUpdate
      );
    }

    const textBg = deps.getTextBackgroundTarget();
    if (textBg) {
      syncClassificationColors(
        textBg.classification,
        textBg.usesCategories,
        deps.applyTextBackgroundUpdate
      );
    }
  });
}

export function syncStrokeColors(deps: UseClassificationColorSyncDeps): void {
  untrack(() => {
    if (!deps.getSelectedVisualizationId()) {
      return;
    }

    for (const target of deps.getStrokeTargets()) {
      if (!target.usesBreaks && !target.usesCategories) {
        continue;
      }

      syncClassificationColors(
        target.classification,
        target.usesCategories,
        (updates) =>
          deps.updatePrimitiveStrokeClassificationState(
            target.primitive,
            updates
          )
      );
    }

    const textBgStroke = deps.getTextBackgroundStrokeTarget();
    if (textBgStroke) {
      syncClassificationColors(
        textBgStroke.classification,
        textBgStroke.usesCategories,
        deps.applyTextBackgroundStrokeUpdate
      );
    }
  });
}

export const PRIMITIVE_LINE_FILTER = PrimitiveFilterType.LINE;
