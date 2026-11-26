<script module lang="ts">
  // Kept for the session only: closing the tool does not reset it.
  let equalMargins = $state(false);
</script>

<script lang="ts">
  import Switch from '$lib/features/commons/components/switch.svelte';
  import CompactNumberInput from '$lib/features/commons/components/compact-number-input.svelte';
  import { Position } from '$lib/features/commons/types/enums';
  import { m } from '$lib/paraglide/messages';
  import { formatActions, getFormatState } from './format.store.svelte';
  import { MIN_PAGE_AREA_SIZE } from './page-insets.utils';

  const formatState = $derived(getFormatState());

  let top = $state(0);
  let bottom = $state(0);
  let left = $state(0);
  let right = $state(0);

  const availableHeight = $derived(
    Math.max(0, formatState.height - MIN_PAGE_AREA_SIZE)
  );
  const availableWidth = $derived(
    Math.max(0, formatState.width - MIN_PAGE_AREA_SIZE)
  );

  // One value applied to all four sides must leave room on both axes.
  const equalMarginMax = $derived(
    Math.floor(Math.min(availableHeight, availableWidth) / 2)
  );

  $effect(() => {
    top = formatState.margins.top;
    bottom = formatState.margins.bottom;
    left = formatState.margins.left;
    right = formatState.margins.right;
  });

  function updateMargin(type: Position, value: number) {
    if (equalMargins) {
      formatActions.setMargins({
        top: value,
        bottom: value,
        left: value,
        right: value
      });
      return;
    }

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
  <Switch
    size="sm"
    labelText={m.format_equal_margins()}
    labelA={m.projection_settings_no()}
    labelB={m.projection_settings_yes()}
    showStateLabel
    toggled={equalMargins}
    onchange={(checked: boolean) => (equalMargins = checked)}
  />
  <div class="margins-grid">
    <div class="margin-input">
      <label class="bx--label" for="margin-top">
        {m.format_margin_top()}
      </label>
      <CompactNumberInput
        id="margin-top"
        bind:value={top}
        min={0}
        max={equalMargins
          ? equalMarginMax
          : Math.max(0, availableHeight - formatState.margins.bottom)}
        width="100%"
        stepperWidth="32px"
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
        max={equalMargins
          ? equalMarginMax
          : Math.max(0, availableHeight - formatState.margins.top)}
        width="100%"
        stepperWidth="32px"
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
        max={equalMargins
          ? equalMarginMax
          : Math.max(0, availableWidth - formatState.margins.right)}
        width="100%"
        stepperWidth="32px"
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
        max={equalMargins
          ? equalMarginMax
          : Math.max(0, availableWidth - formatState.margins.left)}
        width="100%"
        stepperWidth="32px"
        onchange={(value) => updateMargin(Position.Right, value)}
      />
    </div>
  </div>
</div>

<style>
  #khartis-margins-editor-tool {
    display: flex;
    flex-direction: column;
    gap: var(--kh-gap-param);
  }

  .margins-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--kh-gap-param) var(--kh-gap-group);
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
    min-width: 0;
  }

  .margin-input :global(.compact-number-input) {
    min-width: 0;
  }
</style>
