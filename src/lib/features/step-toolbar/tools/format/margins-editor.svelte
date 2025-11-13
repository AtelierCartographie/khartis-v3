<script lang="ts">
  import { Position } from '$lib/features/commons/types/enums';
  import { m } from '$lib/paraglide/messages';
  import {
    Button,
    Column,
    Grid,
    NumberInput,
    Row
  } from 'carbon-components-svelte';
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

  function inc(type: Position) {
    const currentValues = formatState.margins;
    if (type === Position.Top) updateMargin(type, currentValues.top + 1);
    else if (type === Position.Bottom)
      updateMargin(type, currentValues.bottom + 1);
    else if (type === Position.Left) updateMargin(type, currentValues.left + 1);
    else updateMargin(type, currentValues.right + 1);
  }

  function dec(type: Position) {
    const currentValues = formatState.margins;
    if (type === Position.Top)
      updateMargin(type, Math.max(0, currentValues.top - 1));
    else if (type === Position.Bottom)
      updateMargin(type, Math.max(0, currentValues.bottom - 1));
    else if (type === Position.Left)
      updateMargin(type, Math.max(0, currentValues.left - 1));
    else updateMargin(type, Math.max(0, currentValues.right - 1));
  }
</script>

<div id="khartis-margins-editor-tool">
  <Grid padding noGutter>
    <Row>
      <Column lg={8} md={4} sm={2}>
        <div class="margin-controls">
          <div class="margin-input">
            <NumberInput
              id="margin-top"
              label={m.format_margin_top()}
              value={top}
              on:change={(e) => updateMargin(Position.Top, e.detail ?? 0)}
              min={0}
              hideSteppers
            />
          </div>

          <div class="margin-buttons">
            <Button
              kind="ghost"
              size="small"
              onclick={() => dec(Position.Top)}
              class="margin-button">−</Button
            >

            <Button
              kind="ghost"
              size="small"
              onclick={() => inc(Position.Top)}
              class="margin-button">+</Button
            >
          </div>
        </div>
      </Column>

      <Column lg={8} md={4} sm={2}>
        <div class="margin-controls">
          <div class="margin-input">
            <NumberInput
              id="margin-bottom"
              label={m.format_margin_bottom()}
              value={bottom}
              on:change={(e) => updateMargin(Position.Bottom, e.detail ?? 0)}
              min={0}
              hideSteppers
            />
          </div>

          <div class="margin-buttons">
            <Button
              kind="ghost"
              size="small"
              onclick={() => dec(Position.Bottom)}
              class="margin-button">−</Button
            >

            <Button
              kind="ghost"
              size="small"
              onclick={() => inc(Position.Bottom)}
              class="margin-button">+</Button
            >
          </div>
        </div>
      </Column>
    </Row>

    <Row>
      <Column lg={8} md={4} sm={2}>
        <div class="margin-controls">
          <div class="margin-input">
            <NumberInput
              id="margin-left"
              label={m.format_margin_left()}
              value={left}
              on:change={(e) => updateMargin(Position.Left, e.detail ?? 0)}
              min={0}
              hideSteppers
            />
          </div>
          <div class="margin-buttons">
            <Button
              kind="ghost"
              size="small"
              onclick={() => dec(Position.Left)}
              class="margin-button">−</Button
            >
            <Button
              kind="ghost"
              size="small"
              onclick={() => inc(Position.Left)}
              class="margin-button">+</Button
            >
          </div>
        </div>
      </Column>

      <Column lg={8} md={4} sm={2}>
        <div class="margin-controls">
          <div class="margin-input">
            <NumberInput
              id="margin-right"
              label={m.format_margin_right()}
              value={right}
              on:change={(e) => updateMargin(Position.Right, e.detail ?? 0)}
              min={0}
              hideSteppers
            />
          </div>

          <div class="margin-buttons">
            <Button
              kind="ghost"
              size="small"
              onclick={() => dec(Position.Right)}
              class="margin-button">−</Button
            >
            <Button
              kind="ghost"
              size="small"
              onclick={() => inc(Position.Right)}
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
    margin-top: var(--cds-spacing-03);
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

  #khartis-margins-editor-tool :global(.margin-button) {
    height: 2.5rem;
    padding: 0 var(--cds-spacing-03);
    font-size: 0.875rem;
    background: transparent;
    border: 0;
    border-radius: 0;
    color: var(--cds-text-01);
  }
</style>
