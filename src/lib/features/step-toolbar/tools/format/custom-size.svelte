<script lang="ts">
  import CompactNumberInput from '$lib/features/commons/components/compact-number-input.svelte';
  import { m } from '$lib/paraglide/messages';
  import { formatState, formatActions } from './format.store.svelte';

  let width = $state(formatState.width ?? 842);
  let height = $state(formatState.height ?? 595);

  $effect(() => {
    width = formatState.width ?? 842;
    height = formatState.height ?? 595;
  });

  function updateSize(newWidth: number, newHeight: number): void {
    width = newWidth;
    height = newHeight;
    formatActions.setSize(newWidth, newHeight);
  }
</script>

<div id="khartis-custom-size-tool">
  <div class="size-grid">
    <div class="size-input">
      <label class="bx--label" for="width-input">
        {m.format_width()}
      </label>
      <CompactNumberInput
        id="width-input"
        bind:value={width}
        min={1}
        max={Number.MAX_SAFE_INTEGER}
        width="100%"
        onchange={(value) => updateSize(value, height)}
      />
    </div>

    <div class="size-input">
      <label class="bx--label" for="height-input">
        {m.format_height()}
      </label>
      <CompactNumberInput
        id="height-input"
        bind:value={height}
        min={1}
        max={Number.MAX_SAFE_INTEGER}
        width="100%"
        onchange={(value) => updateSize(width, value)}
      />
    </div>
  </div>
</div>

<style>
  .size-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 32px;
    width: 100%;
  }

  .size-input {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
    min-width: 0;
  }

  .size-input :global(.compact-number-input) {
    min-width: 0;
  }
</style>
