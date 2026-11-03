<script lang="ts">
  import type { LabelHoverBox } from '../interactions/label-drag.controller';

  interface Props {
    /** In pixels of the map container, which this frame must share. */
    box: LabelHoverBox | null;
  }

  const { box }: Props = $props();
</script>

{#if box}
  <div
    class="label-hover-frame"
    aria-hidden="true"
    style:left="{box[0]}px"
    style:top="{box[1]}px"
    style:width="{box[2] - box[0]}px"
    style:height="{box[3] - box[1]}px"
  ></div>
{/if}

<style>
  .label-hover-frame {
    position: absolute;
    pointer-events: none;
    outline: 1px dashed var(--cds-border-strong-02, #6f6f6f);
  }
</style>
