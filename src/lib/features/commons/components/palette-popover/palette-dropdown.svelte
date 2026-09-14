<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { Button } from 'carbon-components-svelte';
  import { ColorPalette, Checkmark } from 'carbon-icons-svelte';
  import { KEY, EVENT } from '$lib/features/commons/constants/dom.constants';
  import { clickOutside } from '$lib/features/commons/utils/click-outside';
  import { portal } from '$lib/features/commons/utils/portal';
  import { computeFlippedPosition } from '$lib/features/commons/utils/dropdown-position.utils';
  import {
    createExclusiveContextualSurfaceId,
    engageExclusiveContextualSurface
  } from '$lib/features/commons/utils/contextual-surface-coordinator';

  import {
    type DivergingPaletteSplit,
    type Palette,
    type PaletteType,
    getPalettesForType,
    generatePaletteColors,
    buildPatternBackground,
    PALETTE_TYPE,
    getPaletteDisplayName
  } from './palette.constants';
  import PaletteSwatchRow from './palette-swatch-row.svelte';

  interface Props {
    open: boolean;
    triggerElement?: HTMLElement;
    selectedPaletteId: string;
    paletteType: PaletteType;
    numClasses: number;
    previewCount?: number;
    divergingSplit?: DivergingPaletteSplit;
    exclusive?: boolean;
    onclose?: () => void;
    onselect?: (palette: Palette, colors: string[]) => void;
    oncustomize?: () => void;
  }

  let {
    open = $bindable(false),
    triggerElement,
    selectedPaletteId,
    paletteType,
    numClasses,
    previewCount = numClasses,
    divergingSplit,
    exclusive = true,
    onclose,
    onselect,
    oncustomize
  }: Props = $props();

  let dropdownRef = $state<HTMLDivElement>();
  let dropdownPos = $state({ top: 0, left: 0, width: 0 });
  const contextualSurfaceId =
    createExclusiveContextualSurfaceId('palette-dropdown');

  const palettes = $derived(getPalettesForType(paletteType));

  function getPalettePreviewColors(palette: Palette): string[] {
    if (palette.type === PALETTE_TYPE.QUALITATIVE) {
      return palette.colors;
    }

    return generatePaletteColors(
      palette,
      previewCount,
      undefined,
      undefined,
      divergingSplit
    );
  }

  function updatePosition(dropdownHeight = 300) {
    if (!triggerElement) return;
    const rect = triggerElement.getBoundingClientRect();

    dropdownPos = computeFlippedPosition({
      triggerRect: rect,
      dropdownHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight
    });
  }

  function handleSelect(palette: Palette) {
    const colors = generatePaletteColors(
      palette,
      numClasses,
      undefined,
      undefined,
      divergingSplit
    );
    onselect?.(palette, colors);
    open = false;
  }

  function handleCustomize() {
    open = false;
    oncustomize?.();
  }

  function handleClose() {
    open = false;
    onclose?.();
  }

  function handleDropdownOutsideClick(event: CustomEvent) {
    const target = event.detail?.originalEvent?.target as Node | undefined;
    if (target && triggerElement?.contains(target)) return;
    handleClose();
  }

  $effect(() => {
    if (!open) {
      return;
    }

    updatePosition();
    const frameId = requestAnimationFrame(() => {
      if (dropdownRef) {
        updatePosition(dropdownRef.getBoundingClientRect().height);
      }
    });

    return () => {
      cancelAnimationFrame(frameId);
    };
  });

  $effect(() => {
    if (!open || !exclusive) {
      return;
    }

    return engageExclusiveContextualSurface(contextualSurfaceId, handleClose);
  });

  function findScrollableParent(el: HTMLElement | null): HTMLElement | null {
    while (el && el !== document.body) {
      const style = window.getComputedStyle(el);
      if (
        style.overflowY === 'auto' ||
        style.overflowY === 'scroll' ||
        style.overflow === 'auto' ||
        style.overflow === 'scroll'
      ) {
        return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  $effect(() => {
    if (!open) return;

    function handleKeydown(e: KeyboardEvent) {
      if (e.key === KEY.ESCAPE) {
        handleClose();
      }
    }

    function handleScroll() {
      handleClose();
    }

    const scrollParent = findScrollableParent(triggerElement ?? null);

    document.addEventListener(EVENT.KEYDOWN, handleKeydown);
    scrollParent?.addEventListener(EVENT.SCROLL, handleScroll, {
      passive: true
    });

    return () => {
      document.removeEventListener(EVENT.KEYDOWN, handleKeydown);
      scrollParent?.removeEventListener(EVENT.SCROLL, handleScroll);
    };
  });
</script>

{#if open}
  <div use:portal class="palette-dropdown-portal">
    <div
      bind:this={dropdownRef}
      class="palette-dropdown"
      style="top: {dropdownPos.top}px; left: {dropdownPos.left}px; width: {dropdownPos.width}px;"
      role="listbox"
      aria-label={m.color_palette()}
      use:clickOutside={{
        enabled: open,
        excludeSelectors: ['#khartis-color-picker-dropdown']
      }}
      onoutsideclick={handleDropdownOutsideClick}
    >
      <div class="dropdown-list">
        {#each palettes as palette (palette.id)}
          <button
            type="button"
            class="dropdown-row"
            class:selected={selectedPaletteId === palette.id}
            role="option"
            aria-selected={selectedPaletteId === palette.id}
            aria-label={getPaletteDisplayName(palette)}
            onclick={() => handleSelect(palette)}
          >
            {#if palette.type === PALETTE_TYPE.PATTERN}
              <PaletteSwatchRow
                background={buildPatternBackground(palette)}
                height="18px"
                bordered
                flexFill
              />
            {:else}
              <PaletteSwatchRow
                colors={getPalettePreviewColors(palette)}
                height="18px"
                bordered
                flexFill
              />
            {/if}
            {#if selectedPaletteId === palette.id}
              <div class="check-icon">
                <Checkmark size={16} />
              </div>
            {/if}
          </button>
        {/each}
      </div>

      <div class="dropdown-footer">
        <Button
          kind="ghost"
          size="small"
          icon={ColorPalette}
          on:click={handleCustomize}
        >
          {m.palette_customize()}
        </Button>
      </div>
    </div>
  </div>
{/if}

<style lang="scss">
  :global(.palette-dropdown-portal) {
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
    z-index: var(--z-overlay);
  }

  :global(.palette-dropdown-portal *) {
    pointer-events: auto;
  }

  :global(.palette-dropdown) {
    position: fixed;
    background: var(--cds-background, #ffffff);
    border: 1px solid var(--cds-border-subtle-01, #c6c6c6);
    box-shadow:
      0 4px 16px rgba(0, 0, 0, 0.12),
      0 0 1px rgba(0, 0, 0, 0.12);
    z-index: var(--z-popover);
    display: flex;
    flex-direction: column;
  }

  .dropdown-list {
    display: flex;
    flex-direction: column;
    padding: 8px;
    gap: 4px;
    max-height: 60vh;
    overflow-y: auto;
  }

  .dropdown-row {
    position: relative;
    display: flex;
    align-items: center;
    width: 100%;
    padding: 4px;
    background: transparent;
    border: 1px solid transparent;
    cursor: pointer;
    transition: border-color 0.15s ease;

    &:hover {
      border-color: var(--cds-border-strong-01, #8d8d8d);
    }

    &.selected {
      border-color: #012749;
    }
  }

  .check-icon {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    color: white;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5));
    display: flex;
    align-items: center;
  }

  .dropdown-footer {
    padding: 8px 16px 12px;
    border-top: 1px solid var(--cds-border-subtle-01, #c6c6c6);

    :global(.bx--btn) {
      width: 100%;
      justify-content: flex-start;
      padding-inline: 0;
      min-height: 32px;
    }
  }
</style>
