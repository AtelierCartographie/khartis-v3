<script lang="ts">
  import Button from '$lib/features/commons/components/carbon/button.svelte';
  import IconButton from '$lib/features/commons/components/carbon/icon-button.svelte';
  import * as m from '$lib/paraglide/messages';
  import { untrack } from 'svelte';
  import { ArrowRight, Close } from 'carbon-icons-svelte';
  import { KEY, EVENT } from '$lib/features/commons/constants/dom.constants';
  import { clickOutside } from '$lib/features/commons/utils/click-outside';
  import { portal } from '$lib/features/commons/utils/portal';
  import { resolveToolbarWidth } from '$lib/features/commons/utils/toolbar-width.utils';
  import {
    createExclusiveContextualSurfaceId,
    engageExclusiveContextualSurface
  } from '$lib/features/commons/utils/contextual-surface-coordinator';
  import { globalState } from '$lib/features/commons/stores/global.svelte';
  import PaletteSuggestions from './palette-suggestions.svelte';
  import PaletteCustom from './palette-custom.svelte';
  import PaletteComparison from './palette-comparison.svelte';
  import type { PatternPaletteConfig } from '$lib/features/commons/constants/pattern.constants';
  import {
    PALETTE_TYPE,
    type DivergingPaletteSplit,
    type PaletteType,
    type Palette,
    type PatternId,
    type PatternParams,
    type QualitativePreset,
    DEFAULT_QUALITATIVE_PRESET,
    generatePaletteColors,
    generateCategoricalColorsFromSeed,
    findPaletteById,
    getPatternPalettes
  } from './palette.constants';

  interface Props {
    open: boolean;
    triggerElement?: HTMLElement;
    currentColors: string[];
    currentInverted?: boolean;
    selectedPaletteId?: string;
    paletteType?: PaletteType;
    numClasses?: number;
    divergingSplit?: DivergingPaletteSplit;
    exclusive?: boolean;
    allowPattern?: boolean;
    currentPatternId?: string;
    currentPatternParams?: PatternParams;
    currentPatternPaletteConfig?: PatternPaletteConfig;
    onclose?: () => void;
    onvalidate?: (
      palette: Palette | undefined,
      colors: string[],
      inverted: boolean,
      patternPaletteConfig?: PatternPaletteConfig
    ) => void;
  }

  let {
    open = $bindable(false),
    triggerElement,
    currentColors,
    currentInverted = false,
    selectedPaletteId = 'blues',
    paletteType = $bindable<PaletteType>(PALETTE_TYPE.SEQUENTIAL),
    numClasses = 5,
    divergingSplit,
    exclusive = true,
    allowPattern = true,
    currentPatternId,
    currentPatternParams,
    currentPatternPaletteConfig,
    onclose,
    onvalidate
  }: Props = $props();

  function toValidPatternId(value: string | undefined): PatternId | undefined {
    return getPatternPalettes().find((p) => p.patternId === value)?.patternId;
  }

  let popoverRef = $state<HTMLDivElement>();
  let popoverRight = $state(resolveToolbarWidth(globalState.toolbarState));

  let draftPaletteId = $state('blues');
  let draftColors = $state<string[]>([]);
  let draftInverted = $state(false);
  let draftType = $state<PaletteType>(PALETTE_TYPE.SEQUENTIAL);
  let draftPatternPaletteConfig = $state<PatternPaletteConfig | undefined>(
    undefined
  );
  let draftQualitativePreset = $state<QualitativePreset>(
    DEFAULT_QUALITATIVE_PRESET
  );
  const contextualSurfaceId =
    createExclusiveContextualSurfaceId('palette-popover');

  const popoverTitle = $derived.by(() => {
    switch (draftType) {
      case PALETTE_TYPE.SEQUENTIAL:
        return m.palette_sequential();
      case PALETTE_TYPE.DIVERGING:
        return m.palette_diverging();
      case PALETTE_TYPE.QUALITATIVE:
        return m.color();
      default:
        return m.palette_sequential();
    }
  });

  const toolbarWidth = $derived(resolveToolbarWidth(globalState.toolbarState));

  function updatePosition() {
    popoverRight = toolbarWidth;
  }

  function initDraft() {
    draftPaletteId = selectedPaletteId;
    draftColors = [...currentColors];
    draftInverted = currentInverted;
    draftType = paletteType;
    draftPatternPaletteConfig = currentPatternPaletteConfig;
    draftQualitativePreset =
      findPaletteById(selectedPaletteId)?.qualitativePreset ??
      DEFAULT_QUALITATIVE_PRESET;
  }

  function handleClose() {
    open = false;
    onclose?.();
  }

  function handleCancel() {
    handleClose();
  }

  function handleValidate() {
    const palette = findPaletteById(draftPaletteId);
    onvalidate?.(
      palette,
      draftColors,
      draftInverted,
      draftPatternPaletteConfig
    );
    open = false;
  }

  function handlePopoverOutsideClick(event: CustomEvent) {
    const originalEvent = event.detail?.originalEvent as MouseEvent | undefined;
    const target = originalEvent?.target as Node | undefined;
    if (target && triggerElement?.contains(target)) return;
    if (originalEvent && isNestedColorSurface(originalEvent.composedPath())) {
      return;
    }
    handleClose();
  }

  function handlePaletteSelect(palette: Palette) {
    draftPaletteId = palette.id;
    draftInverted = false;
    draftPatternPaletteConfig = undefined;
    draftQualitativePreset =
      palette.qualitativePreset ?? draftQualitativePreset;
    draftColors = generatePaletteColors(
      palette,
      numClasses,
      undefined,
      undefined,
      divergingSplit
    );
  }

  function handleCustomColorsChange(colors: string[]) {
    draftPaletteId = '__custom__';
    draftInverted = false;
    draftPatternPaletteConfig = undefined;
    draftColors = colors;
  }

  function handlePatternPaletteChange(config: PatternPaletteConfig) {
    draftPatternPaletteConfig = config;
  }

  function handleQualitativePresetChange(preset: QualitativePreset) {
    draftQualitativePreset = preset;
  }

  function handleInvertToggle(value: boolean) {
    draftInverted = value;
    draftColors = [...draftColors].reverse();
  }

  function isNestedColorSurface(path: EventTarget[]) {
    return path.some((target) => {
      if (!(target instanceof Element)) return false;
      return (
        target.id === 'khartis-color-picker-dropdown' ||
        target.classList.contains('single-color-dropdown') ||
        target.classList.contains('palette-popover')
      );
    });
  }

  function handleQualitativeColorSelect(hex: string) {
    draftPaletteId = '__custom__';
    draftInverted = false;
    if (numClasses <= 1) {
      draftColors = [hex];
    } else {
      draftColors = generateCategoricalColorsFromSeed(
        hex,
        numClasses,
        draftQualitativePreset
      );
    }
  }

  function handleQualitativePaletteSelect(colors: string[]) {
    if (colors.length === 0) return;
    draftPaletteId = '__custom__';
    draftInverted = false;
    draftColors = Array.from(
      { length: Math.max(numClasses, 1) },
      (_, index) => colors[index % colors.length]
    );
  }

  $effect(() => {
    if (open) {
      untrack(initDraft);
    }
  });

  $effect(() => {
    if (open) {
      updatePosition();
    }
  });

  $effect(() => {
    if (!open || !exclusive) {
      return;
    }

    return engageExclusiveContextualSurface(contextualSurfaceId, handleClose);
  });

  $effect(() => {
    if (!open) return;

    function handleKeydown(e: KeyboardEvent) {
      if (e.key === KEY.ESCAPE) {
        handleClose();
      }
    }

    document.addEventListener(EVENT.KEYDOWN, handleKeydown);

    return () => {
      document.removeEventListener(EVENT.KEYDOWN, handleKeydown);
    };
  });
</script>

{#if open}
  <div use:portal class="palette-popover-portal">
    <div
      bind:this={popoverRef}
      class="palette-popover"
      style:right={popoverRight}
      role="dialog"
      aria-label={popoverTitle}
      use:clickOutside={{
        enabled: open,
        excludeSelectors: [
          '#khartis-color-picker-dropdown',
          '.single-color-dropdown'
        ]
      }}
      onoutsideclick={handlePopoverOutsideClick}
    >
      <header class="popover-header">
        <h3>{popoverTitle}</h3>
        <IconButton
          kind="ghost"
          size="small"
          icon={Close}
          iconDescription={m.button_cancel()}
          on:click={handleClose}
        />
      </header>

      <div class="popover-content">
        <PaletteSuggestions
          paletteType={draftType}
          selectedPaletteId={draftPaletteId}
          selectedColor={draftColors[0]}
          numClasses={numClasses}
          divergingSplit={divergingSplit}
          onSelect={handlePaletteSelect}
          onColorSelect={handleQualitativeColorSelect}
          onPaletteSelect={handleQualitativePaletteSelect}
          onIntensitySelect={handleQualitativeColorSelect}
          onQualitativePresetChange={handleQualitativePresetChange}
        />

        <PaletteCustom
          paletteType={draftType}
          numClasses={numClasses}
          currentColors={draftColors}
          divergingSplit={divergingSplit}
          allowPattern={allowPattern}
          inverted={draftInverted}
          patternPaletteConfig={draftPatternPaletteConfig}
          onColorsChange={handleCustomColorsChange}
          onPatternPaletteChange={handlePatternPaletteChange}
          onInvertToggle={handleInvertToggle}
        />
      </div>

      <div class="popover-preview-wrap">
        <div class="popover-divider"></div>
        <div class="popover-preview">
          <PaletteComparison
            currentColors={currentColors}
            newColors={draftColors}
            paletteType={draftType}
            currentPatternId={toValidPatternId(currentPatternId)}
            currentPatternParams={currentPatternParams}
            newPatternId={findPaletteById(draftPaletteId)?.patternId}
            currentPatternPaletteConfig={currentPatternPaletteConfig}
            newPatternPaletteConfig={draftPatternPaletteConfig}
            currentInverted={currentInverted}
            newInverted={draftInverted}
          />
        </div>
        <footer class="popover-footer">
          <Button kind="tertiary" size="small" on:click={handleCancel}>
            {m.button_cancel()}
          </Button>
          <Button
            kind="primary"
            size="small"
            icon={ArrowRight}
            on:click={handleValidate}
          >
            {m.button_validate()}
          </Button>
        </footer>
      </div>
    </div>
  </div>
{/if}

<style lang="scss">
  :global(.palette-popover-portal) {
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
    z-index: var(--z-overlay);
  }

  :global(.palette-popover-portal *) {
    pointer-events: auto;
  }

  :global(.palette-popover) {
    position: fixed;
    right: 50vw;
    top: 50%;
    transform: translateY(-50%);
    width: 320px;
    max-height: calc(100vh - 32px);
    display: flex;
    flex-direction: column;
    background: var(--cds-background, #ffffff);
    border: 1px solid var(--cds-border-subtle);
    box-shadow:
      0 4px 16px rgba(0, 0, 0, 0.12),
      0 0 1px rgba(0, 0, 0, 0.15);
    z-index: var(--z-popover);
    overflow: hidden;
  }

  @media (max-width: 1023px) {
    :global(.palette-popover) {
      right: 0 !important;
      left: 0;
      top: auto;
      bottom: calc(
        60px + env(safe-area-inset-bottom, 0px) + var(--cds-spacing-03) + 48px +
          var(--cds-spacing-03)
      );
      transform: none;
      width: 100vw;
      max-height: calc(
        100dvh - var(--cds-header-height, 48px) -
          60px - env(safe-area-inset-bottom, 0px) - var(--cds-spacing-03) -
          48px - var(--cds-spacing-03) - var(--cds-spacing-05)
      );
      border-radius: 8px 8px 0 0;
      box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.15);
    }
  }

  .popover-header {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 4px 8px 16px;
    flex-shrink: 0;
    background: var(--cds-background, #ffffff);

    h3 {
      flex: 1;
      margin: 0;
      font-family: 'IBM Plex Sans', sans-serif;
      font-size: 16px;
      font-weight: 600;
      line-height: 24px;
      color: var(--cds-text-primary, #161616);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .popover-content {
    flex: 1;
    overflow-y: auto;
    padding: 0 16px 8px 16px;
    display: flex;
    flex-direction: column;
    gap: var(--kh-gap-section);
  }

  .popover-preview-wrap {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
  }

  .popover-divider {
    height: 8px;
    flex-shrink: 0;
    border-top: 1px solid var(--cds-border-subtle-01, #c6c6c6);
  }

  .popover-preview {
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 0 16px;
    flex-shrink: 0;
  }

  .popover-footer {
    display: flex;
    gap: 8px;
    padding: 16px 16px 16px 16px;
    flex-shrink: 0;

    :global(.bx--btn) {
      flex: 1;
    }
  }
</style>
