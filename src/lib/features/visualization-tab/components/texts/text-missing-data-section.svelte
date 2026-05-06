<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { TextInput } from 'carbon-components-svelte';
  import Switch from '$lib/features/commons/components/switch.svelte';
  import { InfoPopover } from '../shared';
  import SingleColorPreview from '$lib/features/commons/components/palette-popover/single-color-preview.svelte';

  interface Props {
    show: boolean;
    label: string;
    color: string;
    onShowChange: (value: boolean) => void;
    onLabelChange: (value: string) => void;
    onColorChange: (value: string) => void;
  }

  let {
    show,
    label = $bindable(),
    color,
    onShowChange,
    onLabelChange,
    onColorChange
  }: Props = $props();
</script>

<div class="missing-data-block">
  <div class="missing-data-heading">
    <span class="missing-data-title">{m.show_missing_data()}</span>
    <InfoPopover text={m.show_missing_data_info()} />
  </div>

  <div class="missing-data-toggle">
    <Switch
      toggled={show}
      hideLabel
      labelText={m.show_missing_data()}
      onchange={onShowChange}
    />
    <span class="missing-data-toggle-state">
      {show ? m.yes() : m.no()}
    </span>
  </div>

  {#if show}
    <div class="missing-data-fields">
      <label class="field-group" for="texts-missing-data-label">
        <span class="field-label">{m.text_label()}</span>
        <div class="text-input-field">
          <TextInput
            id="texts-missing-data-label"
            bind:value={label}
            placeholder={m.missing_data_text()}
            on:input={() => onLabelChange(label)}
          />
        </div>
      </label>

      <div class="field-group">
        <SingleColorPreview
          exclusive
          label={m.color()}
          color={color}
          onchange={onColorChange}
        />
      </div>
    </div>
  {/if}
</div>

<style lang="scss">
  .missing-data-block {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
  }

  .missing-data-heading {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-02);
  }

  .missing-data-title {
    font-size: 0.875rem;
    color: var(--cds-text-primary);
    font-weight: 400;
  }

  .missing-data-toggle {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03);
  }

  .missing-data-toggle-state {
    font-size: 0.875rem;
    color: var(--cds-text-secondary);
  }

  .missing-data-fields {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
  }

  .field-group {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }

  .field-label {
    font-size: 0.75rem;
    color: var(--cds-text-02);
  }

  .text-input-field {
    width: 100%;
  }
</style>
