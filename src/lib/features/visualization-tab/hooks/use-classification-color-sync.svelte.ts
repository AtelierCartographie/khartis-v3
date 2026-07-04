import { untrack } from 'svelte';
import { type ClassificationConfig } from '$lib/features/commons/stores/visualization.store.svelte';
import {
  getColorBlindnessState,
  isColorBlindnessActive
} from '$lib/features/step-toolbar/tools/color-blindness';
import {
  areClassificationColorsEqual,
  buildClassificationColorParamsKey,
  resolveClassificationColors,
  SYMBOL_FILL_SCOPE_TARGET,
  TEXT_BACKGROUND_SCOPE_TARGET
} from './use-classification-breaks.svelte';
import type {
  ClassificationTarget,
  StrokeClassificationTarget
} from '../utils/classification-targets.utils';
import type {
  ClassifiablePrimitive,
  StrokeClassifiablePrimitive
} from './use-primitive-panel-controller.svelte';

export type {
  ClassificationTarget,
  StrokeClassificationTarget
} from '../utils/classification-targets.utils';

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
    updates: Partial<ClassificationConfig>,
    options?: { preserveOrigin?: boolean }
  ) => void;
  updatePrimitiveStrokeClassificationState: (
    primitive: StrokeClassifiablePrimitive,
    updates: Partial<ClassificationConfig>,
    options?: { preserveOrigin?: boolean }
  ) => void;
  applySymbolFillUpdate: (
    updates: Partial<ClassificationConfig>,
    options?: { preserveOrigin?: boolean }
  ) => void;
  applyTextBackgroundUpdate: (
    updates: Partial<ClassificationConfig>,
    options?: { preserveOrigin?: boolean }
  ) => void;
  applyTextBackgroundStrokeUpdate: (
    updates: Partial<ClassificationConfig>,
    options?: { preserveOrigin?: boolean }
  ) => void;
}

// Palette colour syncing is derived output, not a custom user edit.
const PRESERVE_ORIGIN = { preserveOrigin: true } as const;

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
          deps.updatePrimitiveClassificationState(
            target.primitive,
            updates,
            PRESERVE_ORIGIN
          )
      );
    }

    const symbolFill = deps.getSymbolFillTarget();
    if (symbolFill) {
      syncClassificationColors(
        symbolFill.classification,
        symbolFill.usesCategories,
        (updates) => deps.applySymbolFillUpdate(updates, PRESERVE_ORIGIN)
      );
    }

    const textBg = deps.getTextBackgroundTarget();
    if (textBg) {
      syncClassificationColors(
        textBg.classification,
        textBg.usesCategories,
        (updates) => deps.applyTextBackgroundUpdate(updates, PRESERVE_ORIGIN)
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
            updates,
            PRESERVE_ORIGIN
          )
      );
    }

    const textBgStroke = deps.getTextBackgroundStrokeTarget();
    if (textBgStroke) {
      syncClassificationColors(
        textBgStroke.classification,
        textBgStroke.usesCategories,
        (updates) =>
          deps.applyTextBackgroundStrokeUpdate(updates, PRESERVE_ORIGIN)
      );
    }
  });
}
