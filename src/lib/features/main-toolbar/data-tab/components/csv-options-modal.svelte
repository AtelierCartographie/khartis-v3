<script lang="ts">
  import {
    Modal,
    Toggle,
    Select,
    SelectItem,
    InlineLoading
  } from 'carbon-components-svelte';
  import * as m from '$lib/paraglide/messages';

  export interface CsvOptions {
    header: boolean;
    decimalSeparator: string;
    thousandsSeparator: string | undefined;
  }

  interface Props {
    open: boolean;
    currentOptions: CsvOptions;
    onClose: () => void;
    onApply: (options: CsvOptions) => Promise<void>;
  }

  let { open, currentOptions, onClose, onApply }: Props = $props();

  let header = $state(true);
  let decimalSeparator = $state('.');
  let thousandsSeparator = $state('none');
  let isApplying = $state(false);

  $effect(() => {
    if (open) {
      header = currentOptions.header;
      decimalSeparator = currentOptions.decimalSeparator;
      thousandsSeparator = currentOptions.thousandsSeparator || 'none';
    }
  });

  async function handleApply() {
    isApplying = true;
    try {
      await onApply({
        header,
        decimalSeparator,
        thousandsSeparator:
          thousandsSeparator === 'none' ? undefined : thousandsSeparator
      });
      onClose();
    } finally {
      isApplying = false;
    }
  }

  const decimalOptions = [
    { value: '.', label: m.csv_options_decimal_period() },
    { value: ',', label: m.csv_options_decimal_comma() }
  ];

  const thousandsOptions = [
    { value: 'none', label: m.csv_options_thousands_none() },
    { value: ' ', label: m.csv_options_thousands_space() },
    { value: ',', label: m.csv_options_thousands_comma() },
    { value: '.', label: m.csv_options_thousands_period() }
  ];

  const filteredThousandsOptions = $derived(
    thousandsOptions.filter((opt) => opt.value !== decimalSeparator)
  );
</script>

<Modal
  bind:open={open}
  modalHeading={m.csv_options_title()}
  primaryButtonText={m.csv_options_apply()}
  secondaryButtonText={m.csv_options_cancel()}
  primaryButtonDisabled={isApplying}
  on:click:button--secondary={onClose}
  on:click:button--primary={handleApply}
  on:close={onClose}
  size="sm"
>
  <div class="csv-options">
    <p class="description">{m.csv_options_description()}</p>

    <div class="option-group">
      <Toggle
        labelText={m.csv_options_header()}
        labelA=""
        labelB=""
        bind:toggled={header}
        disabled={isApplying}
      />
    </div>

    <div class="option-group">
      <Select
        labelText={m.csv_options_decimal_separator()}
        bind:selected={decimalSeparator}
        disabled={isApplying}
      >
        {#each decimalOptions as opt (opt.value)}
          <SelectItem value={opt.value} text={opt.label} />
        {/each}
      </Select>
    </div>

    <div class="option-group">
      <Select
        labelText={m.csv_options_thousands_separator()}
        bind:selected={thousandsSeparator}
        disabled={isApplying}
      >
        {#each filteredThousandsOptions as opt (opt.value)}
          <SelectItem value={opt.value} text={opt.label} />
        {/each}
      </Select>
    </div>

    {#if isApplying}
      <div class="loading">
        <InlineLoading description="Reloading..." />
      </div>
    {/if}
  </div>
</Modal>

<style>
  .csv-options {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-05);
  }

  .description {
    color: var(--cds-text-02);
    font-size: 0.875rem;
    margin-bottom: var(--cds-spacing-03);
  }

  .option-group {
    display: flex;
    flex-direction: column;
  }

  .loading {
    margin-top: var(--cds-spacing-03);
  }
</style>
