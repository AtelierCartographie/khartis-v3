<script lang="ts">
  import Button from '$lib/features/commons/components/carbon/button.svelte';
  import IconButton from '$lib/features/commons/components/carbon/icon-button.svelte';
  import * as m from '$lib/paraglide/messages';
  import { ArrowRight, Close } from 'carbon-icons-svelte';
  import { KEY, EVENT } from '$lib/features/commons/constants/dom.constants';
  import { globalState } from '$lib/features/commons/store/global.svelte';
  import { ToolbarState } from '$lib/features/commons/types/global';
  import { fly } from 'svelte/transition';
  import { ToggleWithLabel } from '../shared';
  import PaletteSuggestions from './palette-suggestions.svelte';
  import PaletteCustom from './palette-custom.svelte';
  import PaletteComparison from './palette-comparison.svelte';
  import {
    PALETTE_TYPE,
    type PaletteType,
    type Palette,
    type PatternParams,
    interpolateColors,
    findPaletteById
  } from './palette.constants';

  interface Props {
    open: boolean;
    triggerElement?: HTMLElement;
    currentColors: string[];
    selectedPaletteId?: string;
    paletteType?: PaletteType;
    colorBlindFilter?: boolean;
    numClasses?: number;
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
    selectedPaletteId = 'blues',
    paletteType = $bindable<PaletteType>(PALETTE_TYPE.SEQUENTIAL),
    colorBlindFilter = $bindable(false),
    numClasses = 5,
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

  const popoverTitle = $derived.by(() => {
    switch (draftType) {
      case PALETTE_TYPE.SEQUENTIAL:
        return m.palette_sequential();
      case PALETTE_TYPE.DIVERGING:
        return m.palette_diverging();
      case PALETTE_TYPE.QUALITATIVE:
        return m.palette_qualitative();
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
        return '400px';
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
    draftInverted = false;
    draftType = paletteType;
    draftColorBlindFilter = colorBlindFilter;
    draftPatternParams = undefined;
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
    draftColors = interpolateColors(palette.colors, numClasses);
  }

  function handleTypeChange(type: PaletteType) {
    draftType = type;
  }

  function handleColorBlindChange(enabled: boolean) {
    draftColorBlindFilter = enabled;
  }

  function handleCustomColorsChange(colors: string[]) {
    draftPaletteId = '__custom__';
    draftColors = colors;
  }

  function handlePatternSelect(palette: Palette, params: PatternParams) {
    draftPaletteId = palette.id;
    draftColors = palette.colors;
    draftPatternParams = params;
  }

  function handleInvertToggle(value: boolean) {
    draftInverted = value;
    draftColors = [...draftColors].reverse();
  }

  $effect(() => {
    if (open) {
      initDraft();
      updatePosition();
    }
  });

  $effect(() => {
    if (!open) return;

    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (popoverRef && !popoverRef.contains(target)) {
        if (triggerElement && triggerElement.contains(target)) return;
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
      transition:fly={{ y: -10, duration: 200 }}
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
          numClasses={numClasses}
          onTypeChange={handleTypeChange}
          onColorBlindChange={handleColorBlindChange}
          onSelect={handlePaletteSelect}
        />

        <PaletteCustom
          numClasses={numClasses}
          onColorsChange={handleCustomColorsChange}
          onPatternSelect={handlePatternSelect}
        />

        <ToggleWithLabel
          label={m.invert_palette_tooltip()}
          toggled={draftInverted}
          ontoggle={handleInvertToggle}
        />

        <PaletteComparison
          currentColors={currentColors}
          newColors={draftColors}
        />
      </div>

      <footer class="popover-footer">
        <Button kind="secondary" size="small" on:click={handleCancel}>
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
    background: var(--cds-ui-01);
    border: 1px solid var(--cds-border-subtle);
    box-shadow:
      0 4px 16px rgba(0, 0, 0, 0.12),
      0 0 1px rgba(0, 0, 0, 0.15);
    z-index: var(--z-popover);
    transition: right 0.2s ease-out;
  }

  .popover-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--cds-spacing-04);
    border-bottom: 1px solid var(--cds-border-subtle);
    flex-shrink: 0;

    h3 {
      margin: 0;
      font-size: 1rem;
      font-weight: 600;
      color: var(--cds-text-primary);
    }
  }

  .popover-content {
    flex: 1;
    overflow-y: auto;
    padding: var(--cds-spacing-04);
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-04);
  }

  .popover-footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--cds-spacing-03);
    padding: var(--cds-spacing-04);
    border-top: 1px solid var(--cds-border-subtle);
    flex-shrink: 0;
  }
</style>
