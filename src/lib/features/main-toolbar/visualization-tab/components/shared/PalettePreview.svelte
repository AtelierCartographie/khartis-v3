<script lang="ts">
  import { ArrowsHorizontal } from 'carbon-icons-svelte';
  import * as m from '$lib/paraglide/messages';
  import PaletteModal from '../palette-modal.svelte';

  type PaletteType = 'sequential' | 'diverging' | 'qualitative';

  interface Palette {
    id: string;
    name: string;
    colors: string[];
    type: PaletteType;
    colorBlindSafe?: boolean;
  }

  interface Props {
    label?: string;
    colors: string[];
    selectedPaletteId?: string;
    paletteType?: PaletteType;
    colorBlindFilter?: boolean;
    showInvertButton?: boolean;
    onexpand?: () => void;
    oninvert?: () => void;
    onselect?: (palette: Palette) => void;
  }

  let {
    label,
    colors,
    selectedPaletteId = 'blues',
    paletteType = $bindable<PaletteType>('sequential'),
    colorBlindFilter = $bindable(false),
    showInvertButton = true,
    onexpand,
    oninvert,
    onselect
  }: Props = $props();

  let paletteModalOpen = $state(false);

  function handleClick() {
    paletteModalOpen = true;
    onexpand?.();
  }

  function handleInvert(e: MouseEvent) {
    e.stopPropagation();
    oninvert?.();
  }

  function handlePaletteSelect(palette: Palette) {
    onselect?.(palette);
  }

  function handleClose() {
    paletteModalOpen = false;
  }
</script>

<div class="palette-preview-wrapper">
  {#if label}
    <span class="field-label">{label}</span>
  {/if}
  <div class="palette-selector">
    <button
      type="button"
      class="palette-main"
      onclick={handleClick}
      aria-label={m.color_palette()}
    >
      <div class="palette-preview">
        {#each colors as color, i (i)}
          <div class="palette-color" style="background-color: {color}"></div>
        {/each}
      </div>
    </button>
    {#if showInvertButton}
      <button
        type="button"
        class="palette-action"
        onclick={handleInvert}
        aria-label={m.invert_palette_tooltip()}
      >
        <ArrowsHorizontal size={16} />
      </button>
    {/if}
  </div>
</div>

<PaletteModal
  bind:open={paletteModalOpen}
  selectedPaletteId={selectedPaletteId}
  bind:paletteType={paletteType}
  bind:colorBlindFilter={colorBlindFilter}
  onclose={handleClose}
  onselect={handlePaletteSelect}
  oninvert={oninvert}
/>

<style lang="scss">
  .palette-preview-wrapper {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }

  .field-label {
    font-size: 0.75rem;
    color: var(--cds-text-02);
    font-weight: 400;
  }

  .palette-selector {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03);
    padding: var(--cds-spacing-03);
    background: var(--cds-field);
    border: 1px solid var(--cds-border-strong);
  }

  .palette-main {
    flex: 1;
    display: flex;
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 0;

    &:hover {
      opacity: 0.9;
    }
  }

  .palette-preview {
    display: flex;
    flex: 1;
    height: 24px;
    border-radius: 2px;
    overflow: hidden;
  }

  .palette-color {
    flex: 1;
    height: 100%;
  }

  .palette-action {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--cds-spacing-02);
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--cds-icon-01);

    &:hover {
      background: var(--cds-hover-ui);
    }
  }
</style>
