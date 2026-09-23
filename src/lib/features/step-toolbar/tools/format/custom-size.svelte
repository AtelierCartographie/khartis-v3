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
        stepperWidth="32px"
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
        stepperWidth="32px"
        onchange={(value) => updateSize(width, value)}
      />
    </div>
  </div>
</div>

<style>
  .size-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--kh-gap-param) var(--kh-gap-group);
    width: 100%;
  }

  @media (max-width: 480px) {
    .size-grid {
      grid-template-columns: 1fr;
      gap: var(--cds-spacing-05);
    }
  }

  .size-input {
    display: flex;
    flex-direction: column;
    gap: var(--kh-gap-label);
    min-width: 0;
  }

  .size-input :global(.compact-number-input) {
    min-width: 0;
  }
</style>
