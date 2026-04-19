<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { Button } from 'carbon-components-svelte';
  import { ColorPalette, Checkmark } from 'carbon-icons-svelte';
  import { KEY, EVENT } from '$lib/features/commons/constants/dom.constants';
  import { globalState } from '$lib/features/commons/store/global.svelte';
  import { VIF_MIXTE_COLORS } from './palette.constants';

  interface Props {
    open: boolean;
    triggerElement?: HTMLElement;
    selectedColor: string;
    presets?: readonly string[];
    onclose?: () => void;
    onselect?: (hex: string) => void;
    oncustomize?: () => void;
  }

  let {
    open = $bindable(false),
    triggerElement,
    selectedColor,
    presets = VIF_MIXTE_COLORS,
    onclose,
    onselect,
    oncustomize
  }: Props = $props();

  let dropdownRef = $state<HTMLDivElement>();
  let dropdownPos = $state({ top: 0, left: 0, width: 0 });

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
    const estimatedDropdownHeight = 260;
    const spaceBelow = window.innerHeight / scale - bottom;
    const shouldFlip = spaceBelow < estimatedDropdownHeight && top > spaceBelow;
    dropdownPos = {
      top: shouldFlip ? top - estimatedDropdownHeight : bottom,
      left,
      width
    };
  }

  function handleSelect(hex: string) {
    onselect?.(hex);
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
    if (open) updatePosition();
  });

  $effect(() => {
    if (!open) return;

    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (dropdownRef && !dropdownRef.contains(target)) {
        if (triggerElement && triggerElement.contains(target)) return;
        handleClose();
      }
    }

    function handleKeydown(e: KeyboardEvent) {
      if (e.key === KEY.ESCAPE) handleClose();
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
  <div use:portal class="single-color-dropdown-portal">
    <div
      bind:this={dropdownRef}
      class="single-color-dropdown"
      style="top: {dropdownPos.top}px; left: {dropdownPos.left}px; width: {dropdownPos.width}px;"
      role="listbox"
      aria-label={m.color()}
    >
      <div class="dropdown-list">
        {#each presets as preset (preset)}
          <button
            type="button"
            class="dropdown-row"
            class:selected={selectedColor === preset}
            role="option"
            aria-selected={selectedColor === preset}
            onclick={() => handleSelect(preset)}
          >
            <div class="color-bar" style="background-color: {preset}"></div>
            {#if selectedColor === preset}
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
  :global(.single-color-dropdown-portal) {
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
    z-index: var(--z-overlay);
  }

  :global(.single-color-dropdown-portal *) {
    pointer-events: auto;
  }

  :global(.single-color-dropdown) {
    position: fixed;
    background: var(--cds-ui-01);
    border: 1px solid var(--cds-border-subtle);
    box-shadow:
      0 2px 8px rgba(0, 0, 0, 0.1),
      0 0 1px rgba(0, 0, 0, 0.12);
    z-index: var(--z-popover);
    display: flex;
    flex-direction: column;
  }

  .dropdown-list {
    display: flex;
    flex-direction: column;
    padding: var(--cds-spacing-03);
    gap: var(--cds-spacing-02);
    max-height: 60vh;
    overflow-y: auto;
  }

  .dropdown-row {
    position: relative;
    display: flex;
    align-items: center;
    width: 100%;
    padding: var(--cds-spacing-02);
    background: transparent;
    border: 2px solid transparent;
    border-radius: 4px;
    cursor: pointer;
    transition: border-color 0.15s ease;

    &:hover {
      border-color: var(--cds-border-strong);
    }

    &.selected {
      border-color: var(--cds-interactive);
    }
  }

  .color-bar {
    flex: 1;
    height: 18px;
    border-radius: 2px;
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
    padding: var(--cds-spacing-02) var(--cds-spacing-03);
    border-top: 1px solid var(--cds-border-subtle);
  }
</style>
