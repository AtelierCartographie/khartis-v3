<script lang="ts">
  import CompactNumberInput from '$lib/features/commons/components/compact-number-input.svelte';
  import { Position } from '$lib/features/commons/types/enums';
  import { m } from '$lib/paraglide/messages';
  import { formatActions, getFormatState } from './format.store.svelte';

  const formatState = $derived(getFormatState());

  let top = $state(0);
  let bottom = $state(0);
  let left = $state(0);
  let right = $state(0);

  $effect(() => {
    top = formatState.margins.top;
    bottom = formatState.margins.bottom;
    left = formatState.margins.left;
    right = formatState.margins.right;
  });

  function updateMargin(type: Position, value: number) {
    const newMargins = { top, bottom, left, right };

    if (type === Position.Top) {
      newMargins.top = value;
    } else if (type === Position.Bottom) {
      newMargins.bottom = value;
    } else if (type === Position.Left) {
      newMargins.left = value;
    } else {
      newMargins.right = value;
    }

    formatActions.setMargins(newMargins);
  }
</script>

<div id="khartis-margins-editor-tool">
  <div class="margins-grid">
    <div class="margin-input">
      <label class="bx--label" for="margin-top">
        {m.format_margin_top()}
      </label>
      <CompactNumberInput
        id="margin-top"
        bind:value={top}
        min={0}
        max={Number.MAX_SAFE_INTEGER}
        width="100%"
        onchange={(value) => updateMargin(Position.Top, value)}
      />
    </div>

    <div class="margin-input">
      <label class="bx--label" for="margin-bottom">
        {m.format_margin_bottom()}
      </label>
      <CompactNumberInput
        id="margin-bottom"
        bind:value={bottom}
        min={0}
        max={Number.MAX_SAFE_INTEGER}
        width="100%"
        onchange={(value) => updateMargin(Position.Bottom, value)}
      />
    </div>

    <div class="margin-input">
      <label class="bx--label" for="margin-left">
        {m.format_margin_left()}
      </label>
      <CompactNumberInput
        id="margin-left"
        bind:value={left}
        min={0}
        max={Number.MAX_SAFE_INTEGER}
        width="100%"
        onchange={(value) => updateMargin(Position.Left, value)}
      />
    </div>

    <div class="margin-input">
      <label class="bx--label" for="margin-right">
        {m.format_margin_right()}
      </label>
      <CompactNumberInput
        id="margin-right"
        bind:value={right}
        min={0}
        max={Number.MAX_SAFE_INTEGER}
        width="100%"
        onchange={(value) => updateMargin(Position.Right, value)}
      />
    </div>
  </div>
</div>

<style>
  .margins-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px 32px;
    width: 100%;
  }

  @media (max-width: 480px) {
    .margins-grid {
      grid-template-columns: 1fr;
      gap: var(--cds-spacing-04);
    }
  }

  .margin-input {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
    min-width: 0;
  }

  .margin-input :global(.compact-number-input) {
    min-width: 0;
  }
</style>
