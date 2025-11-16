<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import {
    Button,
    Column,
    Grid,
    NumberInput,
    Row
  } from 'carbon-components-svelte';
  import { formatState, formatActions } from './format.store.svelte';

  let width = $state(formatState.width ?? 842);
  let height = $state(formatState.height ?? 595);

  const widthLabel = $derived(
    'format_width' in m && typeof m.format_width === 'function'
      ? m.format_width()
      : 'Width'
  );
  const heightLabel = $derived(
    'format_height' in m && typeof m.format_height === 'function'
      ? m.format_height()
      : 'Height'
  );

  function updateSize(newWidth: number, newHeight: number): void {
    width = newWidth;
    height = newHeight;
    formatActions.setSize(newWidth, newHeight);
  }

  function decrementWidth(): void {
    updateSize(Math.max(1, width - 1), height);
  }

  function incrementWidth(): void {
    updateSize(width + 1, height);
  }

  function decrementHeight(): void {
    updateSize(width, Math.max(1, height - 1));
  }

  function incrementHeight(): void {
    updateSize(width, height + 1);
  }
</script>

<div id="khartis-custom-size-tool">
  <Grid padding noGutter>
    <Row padding>
      <Column lg={8} md={4} sm={2}>
        <div class="margin-controls">
          <div class="margin-input">
            <NumberInput
              id="width-input"
              labelText={widthLabel}
              value={width}
              on:change={(e) => updateSize(e.detail ?? width, height)}
              min={1}
              hideSteppers
            />
          </div>
          <div class="margin-buttons">
            <Button
              kind="ghost"
              size="small"
              onclick={decrementWidth}
              class="margin-button">−</Button
            >
            <Button
              kind="ghost"
              size="small"
              onclick={incrementWidth}
              class="margin-button">+</Button
            >
          </div>
        </div>
      </Column>

      <Column lg={8} md={4} sm={2}>
        <div class="margin-controls">
          <div class="margin-input">
            <NumberInput
              id="height-input"
              labelText={heightLabel}
              value={height}
              on:change={(e) => updateSize(width, e.detail ?? height)}
              min={1}
              hideSteppers
            />
          </div>

          <div class="margin-buttons">
            <Button
              kind="ghost"
              size="small"
              onclick={decrementHeight}
              class="margin-button">−</Button
            >

            <Button
              kind="ghost"
              size="small"
              onclick={incrementHeight}
              class="margin-button">+</Button
            >
          </div>
        </div>
      </Column>
    </Row>
  </Grid>
</div>

<style>
  .margin-controls {
    display: flex;
    align-items: flex-end;
  }

  .margin-input {
    flex: 1;
  }

  .margin-input :global(.bx--number) {
    width: 100%;
  }

  .margin-buttons {
    display: flex;
    flex-direction: row;
    gap: var(--cds-spacing-02);
    margin-left: 0;
    align-items: center;
    background: var(--cds-field-01);
    height: 2.5rem;
    padding: 0 var(--cds-spacing-02) 0 0;
    border-bottom: 1px solid var(--cds-ui-04);
  }

  #khartis-custom-size-tool :global(.margin-button) {
    height: 2.5rem;
    padding: 0 var(--cds-spacing-03);
    font-size: 0.875rem;
    background: transparent;
    border: 0;
    border-radius: 0;
    color: var(--cds-text-01);
  }
</style>
