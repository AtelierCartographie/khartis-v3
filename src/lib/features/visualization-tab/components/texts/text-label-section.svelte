<script lang="ts">
  import { Button, Dropdown } from 'carbon-components-svelte';
  import * as m from '$lib/paraglide/messages';
  import { SectionHeading } from '../shared';

  type StyleSection = 'primary' | 'secondary';
  type FormatTriggerRef = HTMLButtonElement | HTMLAnchorElement | null;

  interface DropdownItem {
    id: number;
    text: string;
  }

  interface Props {
    selectableDataFields: DropdownItem[];
    secondaryFieldItems: DropdownItem[];
    primarySelectedId: number;
    secondarySelectedId: number;
    hasPrimaryField: boolean;
    hasSecondaryField: boolean;
    showStylePopover: boolean;
    activeStyleSection: StyleSection;
    primaryTriggerRef: FormatTriggerRef;
    secondaryTriggerRef: FormatTriggerRef;
    onPrimarySelect: (fieldId: number) => void;
    onSecondarySelect: (fieldId: number) => void;
    onTogglePrimaryFormat: () => void;
    onToggleSecondaryFormat: () => void;
  }

  let {
    selectableDataFields,
    secondaryFieldItems,
    primarySelectedId,
    secondarySelectedId,
    hasPrimaryField,
    hasSecondaryField,
    showStylePopover,
    activeStyleSection,
    primaryTriggerRef = $bindable(),
    secondaryTriggerRef = $bindable(),
    onPrimarySelect,
    onSecondarySelect,
    onTogglePrimaryFormat,
    onToggleSecondaryFormat
  }: Props = $props();
</script>

<SectionHeading title={m.text_label()} />

<div class="field-stack">
  <div class="field-row">
    <div class="field-row-dropdown field-picker">
      <Dropdown
        size="sm"
        labelText={m.text_according()}
        items={selectableDataFields}
        selectedId={primarySelectedId}
        on:select={(event) => onPrimarySelect(event.detail.selectedId)}
        type="default"
      />
    </div>

    <Button
      size="small"
      bind:ref={primaryTriggerRef}
      class={`format-trigger ${showStylePopover && activeStyleSection === 'primary' ? 'format-trigger--active' : ''}`}
      kind="ghost"
      aria-pressed={showStylePopover && activeStyleSection === 'primary'}
      iconDescription={m.text_format_button()}
      on:click={onTogglePrimaryFormat}
    >
      {m.text_preview_glyph()}
    </Button>
  </div>

  <div class="field-row">
    <div class="field-row-dropdown field-picker">
      <Dropdown
        size="sm"
        labelText={m.secondary_text()}
        items={secondaryFieldItems}
        selectedId={secondarySelectedId}
        disabled={!hasPrimaryField}
        on:select={(event) => onSecondarySelect(event.detail.selectedId)}
        type="default"
      />
    </div>

    <Button
      size="small"
      bind:ref={secondaryTriggerRef}
      class={`format-trigger ${showStylePopover && activeStyleSection === 'secondary' ? 'format-trigger--active' : ''}`}
      kind="ghost"
      aria-pressed={showStylePopover && activeStyleSection === 'secondary'}
      iconDescription={m.text_format_button()}
      disabled={!hasPrimaryField || !hasSecondaryField}
      on:click={onToggleSecondaryFormat}
    >
      {m.text_preview_glyph()}
    </Button>
  </div>
</div>

<style lang="scss">
  .field-stack {
    display: flex;
    flex-direction: column;
    gap: var(--kh-gap-param);
  }

  .field-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--kh-gap-param);
    align-items: end;
  }

  .field-row-dropdown {
    min-width: 0;
  }

  :global(.format-trigger.bx--btn) {
    width: var(--kh-size-control-md) !important;
    height: var(--kh-size-control-md) !important;
    min-height: var(--kh-size-control-md) !important;
    padding: 0 !important;
    border: 1px solid var(--cds-border-subtle-01, #c6c6c6) !important;
    background: var(--cds-layer-01, #ffffff) !important;
    color: var(--cds-text-secondary, #6f6f6f) !important;
    font-size: var(--kh-font-body) !important;
    font-weight: 600 !important;
    line-height: 1 !important;
    cursor: pointer;
    display: inline-flex !important;
    align-items: center;
    justify-content: center;
    transition:
      border-color 0.15s ease,
      color 0.15s ease,
      background-color 0.15s ease;
  }

  :global(.format-trigger.bx--btn:hover:not(:disabled)),
  :global(.format-trigger.format-trigger--active.bx--btn) {
    border-color: var(--cds-text-primary, #161616) !important;
    color: var(--cds-text-primary, #161616) !important;
    background: var(--cds-layer-hover-01, #e8e8e8) !important;
  }

  :global(.format-trigger:disabled) {
    opacity: 0.4;
    cursor: not-allowed;
  }

  @media (max-width: 560px) {
    .field-row {
      grid-template-columns: 1fr;
    }

    :global(.format-trigger) {
      width: 100%;
      height: 48px;
    }
  }
</style>
