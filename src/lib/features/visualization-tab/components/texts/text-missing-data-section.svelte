<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { TextInput } from 'carbon-components-svelte';
  import { ToggleWithLabel } from '$lib/features/commons/components/viz-controls';
  import SingleColorPreview from '$lib/features/commons/components/palette-popover/single-color-preview.svelte';
  import {
    COLOR_ROLE,
    getColorSuggestions
  } from '$lib/features/commons/services/color-suggestion.service';
  import { getMissingDataAvailability } from '../shared/missing-data-availability';

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
    label,
    color,
    onShowChange,
    onLabelChange,
    onColorChange
  }: Props = $props();

  const hasMissingData = $derived.by(getMissingDataAvailability());

  type CarbonTextInputEvent = Event & {
    detail?: string | number | null | { value?: string | number | null };
  };

  function readTextInputValue(event: CarbonTextInputEvent): string {
    const detail = event.detail;
    if (typeof detail === 'string') return detail;
    if (typeof detail === 'number') return String(detail);
    if (
      detail &&
      typeof detail === 'object' &&
      'value' in detail &&
      (typeof detail.value === 'string' || typeof detail.value === 'number')
    ) {
      return String(detail.value);
    }
    return event.target instanceof HTMLInputElement ? event.target.value : '';
  }
</script>

<div class="missing-data-block">
  <ToggleWithLabel
    label={m.show_missing_data()}
    toggled={show && hasMissingData}
    disabled={!hasMissingData}
    infoText={m.show_missing_data_info()}
    ontoggle={onShowChange}
  />
  {#if !hasMissingData}
    <p class="missing-data-none">{m.missing_data_none()}</p>
  {:else if show}
    <div class="missing-data-fields">
      <label class="field-group" for="texts-missing-data-label">
        <span class="field-label">{m.text_label()}</span>
        <div class="text-input-field">
          <TextInput
            size="sm"
            id="texts-missing-data-label"
            value={label}
            placeholder={m.missing_data_text()}
            on:input={(event) => onLabelChange(readTextInputValue(event))}
          />
        </div>
      </label>

      <div class="field-group">
        <SingleColorPreview
          exclusive
          label={m.color()}
          color={color}
          presets={getColorSuggestions(COLOR_ROLE.MISSING_DATA)}
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
    gap: var(--kh-gap-inline);
  }

  .missing-data-fields {
    display: flex;
    flex-direction: column;
    gap: var(--kh-gap-inline);
  }

  .missing-data-none {
    font-size: 0.75rem;
    color: var(--cds-text-helper);
  }

  .text-input-field {
    width: 100%;
  }
</style>
