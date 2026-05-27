<script lang="ts">
  import Button from '$lib/features/commons/components/carbon/button.svelte';
  import IconButton from '$lib/features/commons/components/carbon/icon-button.svelte';
  import * as m from '$lib/paraglide/messages';
  import { ArrowRight, Close } from 'carbon-icons-svelte';
  import { KEY, EVENT } from '$lib/features/commons/constants/dom.constants';
  import {
    createExclusiveContextualSurfaceId,
    engageExclusiveContextualSurface
  } from '$lib/features/commons/utils/contextual-surface-coordinator';
  import { globalState } from '$lib/features/commons/stores/global.svelte';
  import { ToolbarState } from '$lib/features/commons/types/global';
  import PaletteSuggestions from './palette-suggestions.svelte';
  import PaletteCustom from './palette-custom.svelte';
  import PaletteComparison from './palette-comparison.svelte';
  import {
    PALETTE_TYPE,
    type DivergingPaletteSplit,
    type PaletteType,
    type Palette,
    type PatternParams,
    type ContrastMode,
    type QualitativePreset,
    DEFAULT_QUALITATIVE_PRESET,
    generatePaletteColors,
    generateCategoricalColorsFromSeed,
    findPaletteById
  } from './palette.constants';

  interface Props {
    open: boolean;
    triggerElement?: HTMLElement;
    currentColors: string[];
    currentInverted?: boolean;
    selectedPaletteId?: string;
    paletteType?: PaletteType;
    colorBlindFilter?: boolean;
    numClasses?: number;
    divergingSplit?: DivergingPaletteSplit;
    exclusive?: boolean;
    allowPattern?: boolean;
    onclose?: () => void;
    onvalidate?: (
      palette: Palette | undefined,
      colors: string[],
      inverted: boolean,
      patternParams?: PatternParams
    ) => void;
  }

  let {
    open = $bindable(false),
    triggerElement,
    currentColors,
    currentInverted = false,
    selectedPaletteId = 'blues',
    paletteType = $bindable<PaletteType>(PALETTE_TYPE.SEQUENTIAL),
    colorBlindFilter = $bindable(false),
    numClasses = 5,
    divergingSplit,
    exclusive = true,
    allowPattern = true,
    onclose,
    onvalidate
  }: Props = $props();

  let popoverRef = $state<HTMLDivElement>();
  let popoverRight = $state('50vw');

  let draftPaletteId = $state('blues');
  let draftColors = $state<string[]>([]);
  let draftInverted = $state(false);
  let draftType = $state<PaletteType>(PALETTE_TYPE.SEQUENTIAL);
  let draftColorBlindFilter = $state(false);
  let draftPatternParams = $state<PatternParams | undefined>(undefined);
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

  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return {
      destroy() {
        node.remove();
      }
    };
  }

  const toolbarWidth = $derived.by(() => {
    switch (globalState.toolbarState) {
      case ToolbarState.Collapsed:
        return '50px';
      case ToolbarState.Compact:
        return '434px';
      default:
        return '50vw';
    }
  });

  function updatePosition() {
    popoverRight = toolbarWidth;
  }

  function initDraft() {
    draftPaletteId = selectedPaletteId;
    draftColors = [...currentColors];
    draftInverted = currentInverted;
    draftType = paletteType;
    draftColorBlindFilter = colorBlindFilter;
    draftPatternParams = undefined;
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
    onvalidate?.(palette, draftColors, draftInverted, draftPatternParams);
    open = false;
  }

  function handlePaletteSelect(palette: Palette) {
    draftPaletteId = palette.id;
    draftInverted = false;
    draftPatternParams = undefined;
    draftQualitativePreset =
      palette.qualitativePreset ?? draftQualitativePreset;
    draftColors = generatePaletteColors(
      palette,
      numClasses,
      draftColorBlindFilter ? 'high' : undefined,
      undefined,
      divergingSplit
    );
  }

  function handleTypeChange(type: PaletteType) {
    draftType = type;
  }

  function handleColorBlindChange(enabled: boolean) {
    draftColorBlindFilter = enabled;
  }

  function handleCustomColorsChange(colors: string[]) {
    draftPaletteId = '__custom__';
    draftInverted = false;
    draftPatternParams = undefined;
    draftColors = colors;
  }

  function handlePatternSelect(palette: Palette, params: PatternParams) {
    draftPaletteId = palette.id;
    draftPatternParams = params;
  }

  function handleContrastChange(_contrast: ContrastMode | undefined) {}

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
    draftPatternParams = undefined;
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

  $effect(() => {
    if (open) {
      initDraft();
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

    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (popoverRef && !popoverRef.contains(target)) {
        if (triggerElement && triggerElement.contains(target)) return;
        if (isNestedColorSurface(e.composedPath())) return;
        handleClose();
      }
    }

    function handleKeydown(e: KeyboardEvent) {
      if (e.key === KEY.ESCAPE) {
        handleClose();
      }
    }

    const timer = setTimeout(() => {
      document.addEventListener(EVENT.CLICK, handleClick);
    }, 0);
    document.addEventListener(EVENT.KEYDOWN, handleKeydown);

    return () => {
      clearTimeout(timer);
      document.removeEventListener(EVENT.CLICK, handleClick);
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
          bind:paletteType={draftType}
          bind:colorBlindFilter={draftColorBlindFilter}
          selectedPaletteId={draftPaletteId}
          selectedColor={draftColors[0]}
          numClasses={numClasses}
          divergingSplit={divergingSplit}
          onTypeChange={handleTypeChange}
          onColorBlindChange={handleColorBlindChange}
          onSelect={handlePaletteSelect}
          onColorSelect={handleQualitativeColorSelect}
          onIntensitySelect={handleQualitativeColorSelect}
          onQualitativePresetChange={handleQualitativePresetChange}
        />

        <PaletteCustom
          selectedPaletteId={draftPaletteId}
          paletteType={draftType}
          numClasses={numClasses}
          colorBlindFilter={draftColorBlindFilter}
          allowPattern={allowPattern}
          bind:inverted={draftInverted}
          onColorsChange={handleCustomColorsChange}
          onPatternSelect={handlePatternSelect}
          onContrastChange={handleContrastChange}
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
    gap: 32px;
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
