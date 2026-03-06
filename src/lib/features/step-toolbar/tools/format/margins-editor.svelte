<script lang="ts">
  import { Position } from '$lib/features/commons/types/enums';
  import { m } from '$lib/paraglide/messages';
  import { Column, Grid, NumberInput, Row } from 'carbon-components-svelte';
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
  <Grid noGutter>
    <Row>
      <Column>
        <div class="margins-grid">
          <div class="margin-input">
            <NumberInput
              id="margin-top"
              labelText={m.format_margin_top()}
              value={top}
              on:change={(e) => updateMargin(Position.Top, e.detail ?? 0)}
              min={0}
              size="sm"
            />
          </div>
          <div class="margin-input">
            <NumberInput
              id="margin-bottom"
              labelText={m.format_margin_bottom()}
              value={bottom}
              on:change={(e) => updateMargin(Position.Bottom, e.detail ?? 0)}
              min={0}
              size="sm"
            />
          </div>
          <div class="margin-input">
            <NumberInput
              id="margin-left"
              labelText={m.format_margin_left()}
              value={left}
              on:change={(e) => updateMargin(Position.Left, e.detail ?? 0)}
              min={0}
              size="sm"
            />
          </div>
          <div class="margin-input">
            <NumberInput
              id="margin-right"
              labelText={m.format_margin_right()}
              value={right}
              on:change={(e) => updateMargin(Position.Right, e.detail ?? 0)}
              min={0}
              size="sm"
            />
          </div>
        </div>
      </Column>
    </Row>
  </Grid>
</div>

<style>
  .margins-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px 32px;
  }

  .margin-input :global(.bx--number) {
    width: 100%;
  }
</style>
