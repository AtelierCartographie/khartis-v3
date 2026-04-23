<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { Button } from 'carbon-components-svelte';
  import { ColorPalette, Checkmark } from 'carbon-icons-svelte';
  import { KEY, EVENT } from '$lib/features/commons/constants/dom.constants';
  import {
    createExclusiveContextualSurfaceId,
    engageExclusiveContextualSurface
  } from '$lib/features/commons/utils/contextual-surface-coordinator';
  import { globalState } from '$lib/features/commons/store/global.svelte';

  import {
    type Palette,
    type PaletteType,
    getPalettesForType,
    generatePaletteColors,
    buildPatternBackground,
    PALETTE_TYPE
  } from './palette.constants';

  interface Props {
    open: boolean;
    triggerElement?: HTMLElement;
    selectedPaletteId: string;
    paletteType: PaletteType;
    colorBlindFilter: boolean;
    numClasses: number;
    previewCount?: number;
    divergingSplit?: import('./palette.constants').DivergingPaletteSplit;
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
    colorBlindFilter,
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

  const palettes = $derived(getPalettesForType(paletteType, colorBlindFilter));

  function getPalettePreviewColors(palette: Palette): string[] {
    if (palette.type === PALETTE_TYPE.QUALITATIVE) {
      return palette.colors;
    }

    return generatePaletteColors(
      palette,
      previewCount,
      colorBlindFilter ? 'high' : undefined,
      undefined,
      divergingSplit
    );
  }

  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return {
      destroy() {
        node.remove();
      }
    };
  }

  function updatePosition() {
    if (!triggerElement) return;
    const scale = globalState.zoom.pageZoomLevel / 100;
    const rect = triggerElement.getBoundingClientRect();
    const top = rect.top / scale;
    const bottom = rect.bottom / scale;
    const left = rect.left / scale;
    const width = rect.width / scale;
    const estimatedDropdownHeight = 300;
    const spaceBelow = window.innerHeight / scale - bottom;
    const shouldFlip = spaceBelow < estimatedDropdownHeight && top > spaceBelow;

    dropdownPos = {
      top: shouldFlip ? top - estimatedDropdownHeight : bottom,
      left,
      width
    };
  }

  function handleSelect(palette: Palette) {
    const colors = generatePaletteColors(
      palette,
      numClasses,
      colorBlindFilter ? 'high' : undefined,
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

  $effect(() => {
    if (open) {
      updatePosition();
      requestAnimationFrame(() => {
        if (dropdownRef) {
          const scale = globalState.zoom.pageZoomLevel / 100;
          const actualHeight =
            dropdownRef.getBoundingClientRect().height / scale;
          if (!triggerElement) return;
          const rect = triggerElement.getBoundingClientRect();
          const top = rect.top / scale;
          const bottom = rect.bottom / scale;
          const left = rect.left / scale;
          const width = rect.width / scale;
          const spaceBelow = window.innerHeight / scale - bottom;
          const shouldFlip = spaceBelow < actualHeight && top > spaceBelow;
          dropdownPos = {
            top: shouldFlip ? top - actualHeight : bottom,
            left,
            width
          };
        }
      });
    }
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

    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (dropdownRef && !dropdownRef.contains(target)) {
        if (triggerElement && triggerElement.contains(target)) return;
        const path = e.composedPath() as Element[];
        if (path.some((el) => el.id === 'khartis-color-picker-dropdown')) {
          return;
        }
        handleClose();
      }
    }

    function handleKeydown(e: KeyboardEvent) {
      if (e.key === KEY.ESCAPE) {
        handleClose();
      }
    }

    function handleScroll() {
      handleClose();
    }

    const scrollParent = findScrollableParent(triggerElement ?? null);

    const timer = setTimeout(() => {
      document.addEventListener(EVENT.CLICK, handleClick);
    }, 0);
    document.addEventListener(EVENT.KEYDOWN, handleKeydown);
    scrollParent?.addEventListener(EVENT.SCROLL, handleScroll, {
      passive: true
    });

    return () => {
      clearTimeout(timer);
      document.removeEventListener(EVENT.CLICK, handleClick);
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
    >
      <div class="dropdown-list">
        {#each palettes as palette (palette.id)}
          <button
            type="button"
            class="dropdown-row"
            class:selected={selectedPaletteId === palette.id}
            role="option"
            aria-selected={selectedPaletteId === palette.id}
            onclick={() => handleSelect(palette)}
          >
            {#if palette.type === PALETTE_TYPE.PATTERN}
              <div
                class="swatch-row pattern-row"
                style="background: {buildPatternBackground(palette)}"
              ></div>
            {:else}
              <div class="swatch-row">
                {#each getPalettePreviewColors(palette) as color, i (i)}
                  <div
                    class="swatch-cell"
                    style="background-color: {color}"
                  ></div>
                {/each}
              </div>
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

  .swatch-row {
    display: flex;
    flex: 1;
    height: 18px;
    border: 1px solid var(--khartis-palette-swatch-border-color);
    overflow: hidden;
  }

  .pattern-row {
    background-size:
      auto,
      8px 8px,
      auto;
  }

  .swatch-cell {
    flex: 1;
    height: 100%;
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
