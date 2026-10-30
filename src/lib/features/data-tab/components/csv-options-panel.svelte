<script lang="ts">
  import Button from '$lib/features/commons/components/button-native.svelte';
  import Switch from '$lib/features/commons/components/switch.svelte';
  import {
    canUseThousandsSeparator,
    fromThousandsSeparatorSelectValue,
    toThousandsSeparatorSelectValue,
    type ThousandsSeparatorSelectValue
  } from '$lib/features/data-tab/utils/csv-options.utils';
  import * as m from '$lib/paraglide/messages';
  import { InlineLoading, Select, SelectItem } from 'carbon-components-svelte';
  import {
    readCarbonStringValue,
    type CarbonValueEvent
  } from '$lib/features/commons/utils/carbon-events.utils';

  export interface CsvOptions {
    header: boolean;
    decimalSeparator: string;
    thousandsSeparator: string | undefined;
    delimiter: string | undefined;
  }

  interface Props {
    currentOptions: CsvOptions;
    onClose: () => void;
    onApply: (options: CsvOptions) => Promise<void>;
  }

  let { currentOptions, onClose, onApply }: Props = $props();

  let header = $state(true);
  let decimalSeparator = $state('.');
  let thousandsSeparator = $state<ThousandsSeparatorSelectValue>('none');
  let delimiter = $state('auto');
  let isApplying = $state(false);

  $effect(() => {
    header = currentOptions.header;
    decimalSeparator = currentOptions.decimalSeparator;
    thousandsSeparator = toThousandsSeparatorSelectValue(
      currentOptions.thousandsSeparator
    );
    delimiter = currentOptions.delimiter || 'auto';
  });

  // Applying reloads the file: nothing to apply until an option changes.
  const hasChanges = $derived(
    header !== currentOptions.header ||
      decimalSeparator !== currentOptions.decimalSeparator ||
      fromThousandsSeparatorSelectValue(thousandsSeparator) !==
        currentOptions.thousandsSeparator ||
      (delimiter === 'auto' ? undefined : delimiter) !==
        currentOptions.delimiter
  );

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

  const delimiterOptions = $derived([
    { value: 'auto', label: m.csv_options_delimiter_auto() },
    { value: ',', label: m.csv_options_delimiter_comma() },
    { value: ';', label: m.csv_options_delimiter_semicolon() },
    { value: '\t', label: m.csv_options_delimiter_tab() },
    { value: '|', label: m.csv_options_delimiter_pipe() }
  ]);

  const decimalOptions = $derived([
    { value: '.', label: m.csv_options_decimal_period() },
    { value: ',', label: m.csv_options_decimal_comma() }
  ]);

  const thousandsOptions: Array<{
    value: ThousandsSeparatorSelectValue;
    label: string;
  }> = $derived([
    { value: 'none', label: m.csv_options_thousands_none() },
    { value: 'space', label: m.csv_options_thousands_space() },
    { value: ',', label: m.csv_options_thousands_comma() },
    { value: '.', label: m.csv_options_thousands_period() }
  ]);

  const filteredThousandsOptions = $derived(
    thousandsOptions.filter((opt) =>
      canUseThousandsSeparator(opt.value, decimalSeparator)
    )
  );

  function isThousandsSeparatorSelectValue(
    value: string
  ): value is ThousandsSeparatorSelectValue {
    return thousandsOptions.some((opt) => opt.value === value);
  }

  function handleDelimiterChange(event: CarbonValueEvent) {
    delimiter = readCarbonStringValue(event, delimiter);
  }

  function handleDecimalSeparatorChange(event: CarbonValueEvent) {
    decimalSeparator = readCarbonStringValue(event, decimalSeparator);
  }

  function handleThousandsSeparatorChange(event: CarbonValueEvent) {
    const nextSeparator = readCarbonStringValue(event, thousandsSeparator);
    if (isThousandsSeparatorSelectValue(nextSeparator)) {
      thousandsSeparator = nextSeparator;
    }
  }
</script>

<div class="csv-options">
  <p class="kh-help">{m.csv_options_description()}</p>

  <Switch
    labelText={m.csv_options_header()}
    bind:toggled={header}
    disabled={isApplying}
    labelA={m.no()}
    labelB={m.yes()}
    showStateLabel
  />

  <Select
    size="sm"
    labelText={m.csv_options_delimiter()}
    selected={delimiter}
    disabled={isApplying}
    onchange={handleDelimiterChange}
  >
    {#each delimiterOptions as opt (opt.value)}
      <SelectItem value={opt.value} text={opt.label} />
    {/each}
  </Select>

  <Select
    size="sm"
    labelText={m.csv_options_decimal_separator()}
    selected={decimalSeparator}
    disabled={isApplying}
    onchange={handleDecimalSeparatorChange}
  >
    {#each decimalOptions as opt (opt.value)}
      <SelectItem value={opt.value} text={opt.label} />
    {/each}
  </Select>

  <Select
    size="sm"
    labelText={m.csv_options_thousands_separator()}
    selected={thousandsSeparator}
    disabled={isApplying}
    onchange={handleThousandsSeparatorChange}
  >
    {#each filteredThousandsOptions as opt (opt.value)}
      <SelectItem value={opt.value} text={opt.label} />
    {/each}
  </Select>

  {#if isApplying}
    <InlineLoading description={m.csv_options_reloading()} />
  {/if}

  <div class="actions">
    <Button kind="ghost" size="small" disabled={isApplying} onclick={onClose}>
      {m.csv_options_cancel()}
    </Button>
    <Button
      kind="primary"
      size="small"
      disabled={isApplying || !hasChanges}
      onclick={handleApply}
    >
      {m.button_apply()}
    </Button>
  </div>
</div>

<style>
  .csv-options {
    display: flex;
    flex-direction: column;
    gap: var(--kh-gap-param);
  }

  .actions {
    display: flex;
    gap: var(--cds-spacing-03);
    padding-top: var(--cds-spacing-03);
  }
</style>
