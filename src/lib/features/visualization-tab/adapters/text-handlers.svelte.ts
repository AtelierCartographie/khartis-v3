import {
  PrimitiveFilterType,
  type ClassificationConfig,
  type MissingDataConfig,
  type TextPrimitiveConfig,
  type TextSecondaryLabelsConfig,
  type VisualizationConfig,
  type VisualizationModes,
  getTextPrimitive
} from '$lib/features/commons/stores/visualization.store.svelte';
import {
  ColorMode,
  SizeMode
} from '$lib/features/commons/constants/visualization.constants';
import {
  resolveTextColorModeTransition,
  resolveTextSizeModeTransition
} from '../hooks/use-text-mode-state.svelte';
import { pickOwnedKeys, pickRenamedKeys } from './pick-owned.utils';

type TextBackgroundUpdater = (
  background: TextPrimitiveConfig['background']
) => Partial<TextPrimitiveConfig['background']>;

export interface TextHandlersDeps {
  getSelectedVisualization: () => VisualizationConfig | undefined;
  updateSelectedVisualization: (
    updates: Partial<VisualizationConfig>,
    afterUpdate?: (next: VisualizationConfig) => void
  ) => void;
  updatePrimitiveClassificationState: (
    primitive: PrimitiveFilterType,
    updates: Partial<ClassificationConfig>
  ) => void;
  updateTextBackgroundClassificationState: (
    updates: Partial<ClassificationConfig>
  ) => void;
  updateTextBackgroundStrokeClassificationState: (
    updates: Partial<ClassificationConfig>
  ) => void;
  applyPrimitiveMappingUpdate: (
    primitive: PrimitiveFilterType,
    updates: Partial<VisualizationConfig['mapping']>
  ) => void;
  applyTextBackgroundMappingUpdate: (
    updates: Partial<VisualizationConfig['mapping']>
  ) => void;
  applyTextBackgroundStrokeMappingUpdate: (
    updates: Partial<VisualizationConfig['mapping']>
  ) => void;
  invertPrimitivePalette: (primitive: PrimitiveFilterType) => void;
  invertTextBackgroundPalette: () => void;
  invertTextBackgroundStrokePalette: () => void;
  updateTextBackground: (updater: TextBackgroundUpdater) => void;
  ensurePrimitiveClassificationDefaults: (
    primitive: PrimitiveFilterType,
    visualization: VisualizationConfig
  ) => void;
  ensureAutoColumns: (
    primitive: PrimitiveFilterType,
    visualization: VisualizationConfig
  ) => void;
  ensureTextBackgroundClassificationDefaults: (
    visualization: VisualizationConfig
  ) => void;
  ensureTextBackgroundAutoColumns: (visualization: VisualizationConfig) => void;
  ensureTextBackgroundStrokeClassificationDefaults: (
    visualization: VisualizationConfig
  ) => void;
  ensureTextBackgroundStrokeAutoColumns: (
    visualization: VisualizationConfig
  ) => void;
}

export function createTextHandlers(deps: TextHandlersDeps) {
  function handleTextChange(updates: Partial<TextPrimitiveConfig>): void {
    const text = getTextPrimitive(deps.getSelectedVisualization());
    if (!text) return;
    deps.updateSelectedVisualization({ text: { ...text, ...updates } });
  }

  function handleTextStyleChange(
    updates: Partial<VisualizationConfig['style']>
  ): void {
    const text = getTextPrimitive(deps.getSelectedVisualization());
    if (!text) return;

    const renamedNoFallback = pickRenamedKeys<
      VisualizationConfig['style'],
      TextPrimitiveConfig
    >(updates, [{ from: 'textColor', to: 'color' }]);
    const renamedWithFallback = pickRenamedKeys<
      VisualizationConfig['style'],
      TextPrimitiveConfig
    >(
      updates,
      [
        { from: 'textOpacity', to: 'opacity' },
        { from: 'textSize', to: 'size' },
        { from: 'textFontFamily', to: 'fontFamily' },
        { from: 'textBold', to: 'bold' },
        { from: 'textItalic', to: 'italic' },
        { from: 'textAlign', to: 'align' },
        { from: 'textHalo', to: 'halo' },
        { from: 'textHaloColor', to: 'haloColor' },
        { from: 'textHaloWidth', to: 'haloWidth' },
        { from: 'textCollisionDetection', to: 'collisionDetection' },
        { from: 'textDxpMasking', to: 'dxpMasking' }
      ],
      text
    );
    handleTextChange({ ...renamedNoFallback, ...renamedWithFallback });
  }

  function handleTextModesChange(updates: Partial<VisualizationModes>): void {
    const text = getTextPrimitive(deps.getSelectedVisualization());
    if (!text) return;

    const colorChanging =
      Object.prototype.hasOwnProperty.call(updates, 'color') &&
      updates.color !== undefined &&
      updates.color !== text.colorMode;
    const sizeChanging =
      Object.prototype.hasOwnProperty.call(updates, 'size') &&
      updates.size !== undefined &&
      updates.size !== text.sizeMode;

    const colorTransition = colorChanging
      ? resolveTextColorModeTransition(text, updates.color as ColorMode)
      : null;
    const sizeTransition = sizeChanging
      ? resolveTextSizeModeTransition(text, updates.size as SizeMode)
      : null;

    deps.updateSelectedVisualization(
      {
        text: {
          ...text,
          ...(colorChanging ? { colorMode: updates.color as ColorMode } : {}),
          ...(sizeChanging ? { sizeMode: updates.size as SizeMode } : {}),
          ...(colorTransition?.restoredColorFields ?? {}),
          ...(sizeTransition?.restoredSizeFields ?? {}),
          ...(colorTransition
            ? { colorModeStates: colorTransition.nextColorModeStates }
            : {}),
          ...(sizeTransition
            ? { sizeModeStates: sizeTransition.nextSizeModeStates }
            : {})
        }
      },
      (next) => {
        deps.ensurePrimitiveClassificationDefaults(
          PrimitiveFilterType.TEXT,
          next
        );
        deps.ensureAutoColumns(PrimitiveFilterType.TEXT, next);
      }
    );
  }

  function handleTextMissingDataChange(
    updates: Partial<MissingDataConfig>
  ): void {
    const text = getTextPrimitive(deps.getSelectedVisualization());
    if (!text?.missingData) return;
    handleTextChange({ missingData: { ...text.missingData, ...updates } });
  }

  function handleTextClassificationChange(
    updates: Partial<ClassificationConfig>
  ): void {
    deps.updatePrimitiveClassificationState(PrimitiveFilterType.TEXT, updates);
  }

  function handleTextMappingChange(
    updates: Partial<VisualizationConfig['mapping']>
  ): void {
    deps.applyPrimitiveMappingUpdate(PrimitiveFilterType.TEXT, updates);
  }

  function handleTextSecondaryLabelsChange(
    updates: Partial<TextSecondaryLabelsConfig>
  ): void {
    const text = getTextPrimitive(deps.getSelectedVisualization());
    if (!text) return;
    handleTextChange({
      secondaryLabels: { ...text.secondaryLabels, ...updates }
    });
  }

  function handleTextPaletteInvert(): void {
    deps.invertPrimitivePalette(PrimitiveFilterType.TEXT);
  }

  function handleTextBackgroundStyleChange(
    updates: Partial<VisualizationConfig['style']>
  ): void {
    deps.updateTextBackground((background) => {
      const passthrough = pickOwnedKeys(updates, [
        'fillColor',
        'strokeColor'
      ] as const);
      const withFallback = pickOwnedKeys(
        updates,
        [
          'fillOpacity',
          'strokeWidth',
          'strokeOpacity',
          'strokeDashed',
          'strokeDashedPattern'
        ] as const,
        background
      );
      return { ...passthrough, ...withFallback };
    });
  }

  function handleTextBackgroundModesChange(
    updates: Partial<VisualizationModes>
  ): void {
    const text = getTextPrimitive(deps.getSelectedVisualization());
    if (!text) return;

    const renamed = pickRenamedKeys<
      VisualizationModes,
      TextPrimitiveConfig['background']
    >(
      updates,
      [
        { from: 'fill', to: 'fillMode' },
        { from: 'stroke', to: 'strokeMode' }
      ],
      text.background
    );

    deps.updateSelectedVisualization(
      {
        text: {
          ...text,
          background: { ...text.background, ...renamed }
        }
      },
      (next) => {
        deps.ensureTextBackgroundClassificationDefaults(next);
        deps.ensureTextBackgroundAutoColumns(next);
        deps.ensureTextBackgroundStrokeClassificationDefaults(next);
        deps.ensureTextBackgroundStrokeAutoColumns(next);
      }
    );
  }

  function handleTextBackgroundClassificationChange(
    updates: Partial<ClassificationConfig>
  ): void {
    deps.updateTextBackgroundClassificationState(updates);
  }

  function handleTextBackgroundStrokeClassificationChange(
    updates: Partial<ClassificationConfig>
  ): void {
    deps.updateTextBackgroundStrokeClassificationState(updates);
  }

  function handleTextBackgroundMappingChange(
    updates: Partial<VisualizationConfig['mapping']>
  ): void {
    deps.applyTextBackgroundMappingUpdate(updates);
  }

  function handleTextBackgroundStrokeMappingChange(
    updates: Partial<VisualizationConfig['mapping']>
  ): void {
    deps.applyTextBackgroundStrokeMappingUpdate(updates);
  }

  function handleTextBackgroundPaletteInvert(): void {
    deps.invertTextBackgroundPalette();
  }

  function handleTextBackgroundStrokePaletteInvert(): void {
    deps.invertTextBackgroundStrokePalette();
  }

  return {
    handleTextChange,
    handleTextStyleChange,
    handleTextModesChange,
    handleTextMissingDataChange,
    handleTextClassificationChange,
    handleTextMappingChange,
    handleTextSecondaryLabelsChange,
    handleTextPaletteInvert,
    handleTextBackgroundStyleChange,
    handleTextBackgroundModesChange,
    handleTextBackgroundClassificationChange,
    handleTextBackgroundStrokeClassificationChange,
    handleTextBackgroundMappingChange,
    handleTextBackgroundStrokeMappingChange,
    handleTextBackgroundPaletteInvert,
    handleTextBackgroundStrokePaletteInvert
  };
}
