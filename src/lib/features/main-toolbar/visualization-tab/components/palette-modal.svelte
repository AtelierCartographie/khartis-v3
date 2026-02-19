<script lang="ts">
  import { Modal } from 'carbon-components-svelte';
  import * as m from '$lib/paraglide/messages';
  import PaletteSelector from './palette-selector.svelte';

  type PaletteType = 'sequential' | 'diverging' | 'qualitative' | 'pattern';

  interface Palette {
    id: string;
    name: string;
    colors: string[];
    type: PaletteType;
    colorBlindSafe?: boolean;
  }

  interface Props {
    open?: boolean;
    selectedPaletteId?: string;
    paletteType?: PaletteType;
    colorBlindFilter?: boolean;
    onclose?: () => void;
    onselect?: (palette: Palette) => void;
    oninvert?: () => void;
  }

  let {
    open = $bindable(false),
    selectedPaletteId = 'blues',
    paletteType = $bindable<PaletteType>('sequential'),
    colorBlindFilter = $bindable(false),
    onclose,
    onselect,
    oninvert
  }: Props = $props();

  function handleClose() {
    open = false;
    onclose?.();
  }

  function handleSelect(palette: Palette) {
    onselect?.(palette);
  }
</script>

<Modal
  bind:open={open}
  modalHeading={m.color_palette()}
  passiveModal
  size="sm"
  on:close={handleClose}
>
  <PaletteSelector
    selectedPaletteId={selectedPaletteId}
    bind:paletteType={paletteType}
    bind:colorBlindFilter={colorBlindFilter}
    onselect={handleSelect}
    oninvert={oninvert}
  />
</Modal>
