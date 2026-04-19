<script lang="ts">
  import Switch from '$lib/features/commons/components/switch.svelte';
  import {
    canUseThousandsSeparator,
    fromThousandsSeparatorSelectValue,
    toThousandsSeparatorSelectValue,
    type ThousandsSeparatorSelectValue
  } from '$lib/features/main-toolbar/data-tab/services/csv-options.utils';
  import * as m from '$lib/paraglide/messages';
  import {
    InlineLoading,
    Modal,
    Select,
    SelectItem
  } from 'carbon-components-svelte';

  export interface CsvOptions {
    header: boolean;
    decimalSeparator: string;
    thousandsSeparator: string | undefined;
    delimiter: string | undefined;
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
  let thousandsSeparator = $state<ThousandsSeparatorSelectValue>('none');
  let delimiter = $state('auto');
  let isApplying = $state(false);

  $effect(() => {
    if (open) {
      header = currentOptions.header;
      decimalSeparator = currentOptions.decimalSeparator;
      thousandsSeparator = toThousandsSeparatorSelectValue(
        currentOptions.thousandsSeparator
      );
      delimiter = currentOptions.delimiter || 'auto';
    }
  });

  $effect(() => {
    if (!filteredThousandsOptions.some((o) => o.value === thousandsSeparator)) {
      thousandsSeparator = 'none';
    }
  });

  async function handleApply() {
    isApplying = true;
    try {
      await onApply({
        header,
        decimalSeparator,
        thousandsSeparator:
          fromThousandsSeparatorSelectValue(thousandsSeparator),
        delimiter: delimiter === 'auto' ? undefined : delimiter
      });
      onClose();
    } catch {
      // Error already handled by onApply (notification shown)
    } finally {
      isApplying = false;
    }
  }

  const delimiterOptions = [
    { value: 'auto', label: m.csv_options_delimiter_auto() },
    { value: ',', label: m.csv_options_delimiter_comma() },
    { value: ';', label: m.csv_options_delimiter_semicolon() },
    { value: '\t', label: m.csv_options_delimiter_tab() },
    { value: '|', label: m.csv_options_delimiter_pipe() }
  ];

  const decimalOptions = [
    { value: '.', label: m.csv_options_decimal_period() },
    { value: ',', label: m.csv_options_decimal_comma() }
  ];

  const thousandsOptions: Array<{
    value: ThousandsSeparatorSelectValue;
    label: string;
  }> = [
    { value: 'none', label: m.csv_options_thousands_none() },
    { value: 'space', label: m.csv_options_thousands_space() },
    { value: ',', label: m.csv_options_thousands_comma() },
    { value: '.', label: m.csv_options_thousands_period() }
  ];

  const filteredThousandsOptions = $derived(
    thousandsOptions.filter((opt) =>
      canUseThousandsSeparator(opt.value, decimalSeparator)
    )
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
      <Switch
        labelText={m.csv_options_header()}
        bind:toggled={header}
        disabled={isApplying}
        labelA={m.no()}
        labelB={m.yes()}
        showStateLabel
      />
    </div>

    <div class="option-group">
      <Select
        labelText={m.csv_options_delimiter()}
        bind:selected={delimiter}
        disabled={isApplying}
      >
        {#each delimiterOptions as opt (opt.value)}
          <SelectItem value={opt.value} text={opt.label} />
        {/each}
      </Select>
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
        <InlineLoading description={m.csv_options_reloading()} />
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
