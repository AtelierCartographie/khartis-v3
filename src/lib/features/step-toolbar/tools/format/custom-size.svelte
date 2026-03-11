<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { Column, Grid, NumberInput, Row } from 'carbon-components-svelte';
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
  <Grid noGutter>
    <Row>
      <Column>
        <div class="size-grid">
          <div class="size-input">
            <NumberInput
              id="width-input"
              labelText={m.format_width()}
              value={width}
              on:change={(e) => updateSize(e.detail ?? width, height)}
              min={1}
              size="sm"
            />
          </div>
          <div class="size-input">
            <NumberInput
              id="height-input"
              labelText={m.format_height()}
              value={height}
              on:change={(e) => updateSize(width, e.detail ?? height)}
              min={1}
              size="sm"
            />
          </div>
        </div>
      </Column>
    </Row>
  </Grid>
</div>

<style>
  .size-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 32px;
  }

  .size-input :global(.bx--number) {
    width: 100%;
  }
</style>
