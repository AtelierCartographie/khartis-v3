<script lang="ts">
  import {
    Button,
    Link,
    Select,
    SelectItem,
    TextInput,
    InlineNotification
  } from 'carbon-components-svelte';
  import { ArrowRight, Launch } from 'carbon-icons-svelte';
  import { dataToolsStore } from '../data-tools.store.svelte';
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import { duckDBOrchestrator } from '$lib/features/duckdb';
  import * as m from '$lib/paraglide/messages';
  import AutocompleteTextarea, {
    type Suggestion
  } from '$lib/features/commons/components/autocomplete-textarea.svelte';

  interface Props {
    tableName?: string;
    onColumnCreated?: () => void;
  }

  let { tableName, onColumnCreated }: Props = $props();

  const selectedDataset = $derived(datasetsStore.selectedDataset);
  const columns = $derived(
    selectedDataset?.columns.filter(
      (c) => c.name !== 'geom' && c.name !== '__id'
    ) ?? []
  );

  let variableName = $state('');
  let formula = $state('');
  let selectedVariable = $state('');
  let selectedFunction = $state('moyenne');
  let testResult = $state<string | null>(null);
  let errorMessage = $state<string | null>(null);
  let isTesting = $state(false);

  const hasData = $derived(columns.length > 0);

  const autocompleteSuggestions = $derived.by((): Suggestion[] => {
    const variableSuggestions: Suggestion[] = columns.map((col) => ({
      label: col.name,
      value: col.name,
      type: 'variable' as const,
      description: col.type || 'colonne'
    }));

    const functionSuggestions: Suggestion[] = [
      {
        label: 'list_avg',
        value: 'list_avg(["", ""])',
        type: 'function' as const,
        description: m.calc_function_average()
      },
      {
        label: 'list_sum',
        value: 'list_sum(["", ""])',
        type: 'function' as const,
        description: m.calc_function_sum()
      },
      {
        label: 'least',
        value: 'least("", "")',
        type: 'function' as const,
        description: m.calc_function_min()
      },
      {
        label: 'greatest',
        value: 'greatest("", "")',
        type: 'function' as const,
        description: m.calc_function_max()
      },
      {
        label: 'POWER',
        value: 'POWER("", 2)',
        type: 'function' as const,
        description: m.calc_function_power()
      },
      {
        label: 'ROUND',
        value: 'ROUND("", 2)',
        type: 'function' as const,
        description: m.calc_function_round()
      },
      {
        label: 'CONCAT',
        value: 'CONCAT("", \'\')',
        type: 'function' as const,
        description: m.calc_function_concat()
      },
      {
        label: 'SUBSTRING',
        value: 'SUBSTRING("", 1, 3)',
        type: 'function' as const,
        description: m.calc_function_extract()
      }
    ];

    return [...variableSuggestions, ...functionSuggestions];
  });

  function handleFormulaChange(newValue: string) {
    formula = newValue;
    dataToolsStore.setCalculatorFormula(formula);
  }

  const OPERATORS = [
    { label: '+', value: ' + ' },
    { label: '−', value: ' - ' },
    { label: '×', value: ' * ' },
    { label: '÷', value: ' / ' }
  ];

  const FUNCTIONS = $derived([
    {
      label: m.calc_function_average(),
      value: 'list_avg',
      template: 'list_avg([{col}, ""])'
    },
    {
      label: m.calc_function_sum(),
      value: 'list_sum',
      template: 'list_sum([{col}, ""])'
    },
    {
      label: m.calc_function_min(),
      value: 'least',
      template: 'least({col}, "")'
    },
    {
      label: m.calc_function_max(),
      value: 'greatest',
      template: 'greatest({col}, "")'
    },
    {
      label: m.calc_function_power(),
      value: 'POWER',
      template: 'POWER({col}, 2)'
    },
    {
      label: m.calc_function_round(),
      value: 'ROUND',
      template: 'ROUND({col}, 2)'
    },
    {
      label: m.calc_function_concat(),
      value: 'CONCAT',
      template: "CONCAT({col}, '')"
    },
    {
      label: m.calc_function_extract(),
      value: 'SUBSTRING',
      template: 'SUBSTRING({col}, 1, 3)'
    }
  ]);

  function insertVariable() {
    if (!selectedVariable) return;
    formula += `"${selectedVariable}"`;
    dataToolsStore.setCalculatorFormula(formula);
  }

  function insertOperator(op: string) {
    formula += op;
    dataToolsStore.setCalculatorFormula(formula);
  }

  function insertFunction() {
    const fn = FUNCTIONS.find((f) => f.value === selectedFunction);
    if (!fn) return;

    const col = selectedVariable || m.calc_column_default();
    const template = fn.template.replace('{col}', `"${col}"`);
    formula += template;
    dataToolsStore.setCalculatorFormula(formula);
  }

  async function handleTest() {
    if (!tableName || !formula.trim()) return;

    isTesting = true;
    errorMessage = null;
    testResult = null;

    try {
      const result = await duckDBOrchestrator.testExpression(
        tableName,
        formula
      );
      testResult = m.calc_test_result_label({ result: String(result) });
      dataToolsStore.setCalculatorTestResult(result);
    } catch (err) {
      errorMessage =
        err instanceof Error ? err.message : m.error_calc_expression_invalid();
      dataToolsStore.setCalculatorError(errorMessage);
    } finally {
      isTesting = false;
    }
  }

  async function handleCalculate() {
    if (!tableName || !variableName.trim() || !formula.trim()) {
      errorMessage = m.error_calc_name_formula_required();
      return;
    }

    errorMessage = null;

    try {
      await duckDBOrchestrator.addCalculatedColumn(
        tableName,
        variableName.trim(),
        formula
      );

      variableName = '';
      formula = '';
      testResult = null;
      dataToolsStore.resetCalculator();
      onColumnCreated?.();
    } catch (err) {
      errorMessage =
        err instanceof Error ? err.message : m.error_calc_execution_failed();
      dataToolsStore.setCalculatorError(errorMessage);
    }
  }
</script>

<div class="calculator-panel">
  {#if !hasData}
    <InlineNotification
      kind="info"
      title={m.data_tool_no_data()}
      subtitle={m.data_tool_no_data_description()}
      lowContrast
      hideCloseButton
    />
  {:else}
    <div class="field-group">
      <TextInput
        size="sm"
        labelText={m.calc_variable_name()}
        placeholder={m.calc_name_placeholder()}
        bind:value={variableName}
      />
    </div>

    <div class="field-group">
      <AutocompleteTextarea
        bind:value={formula}
        suggestions={autocompleteSuggestions}
        rows={4}
        labelText={m.calc_formula()}
        placeholder={m.calc_formula_placeholder()}
        onchange={handleFormulaChange}
      />
    </div>

    <p class="help-text">
      {m.calc_help_text()}
    </p>

    <div class="field-group">
      <div class="input-with-action">
        <Select
          size="sm"
          labelText={m.calc_variables()}
          bind:selected={selectedVariable}
        >
          <SelectItem value="" text={m.calc_select_variable()} />
          {#each columns as column (column.name)}
            <SelectItem value={column.name} text={column.name} />
          {/each}
        </Select>
        <Button
          kind="ghost"
          size="small"
          hasIconOnly
          icon={ArrowRight}
          iconDescription={m.calc_insert_variable()}
          disabled={!selectedVariable}
          on:click={insertVariable}
        />
      </div>
    </div>

    <div class="field-group">
      <span id="operators-label" class="field-label">{m.calc_operators()}</span>
      <div class="operators" role="group" aria-labelledby="operators-label">
        {#each OPERATORS as op (op.label)}
          <Button
            kind="tertiary"
            size="small"
            on:click={() => insertOperator(op.value)}
          >
            {op.label}
          </Button>
        {/each}
      </div>
    </div>

    <div class="field-group">
      <div class="input-with-action">
        <Select
          size="sm"
          labelText={m.calc_functions()}
          bind:selected={selectedFunction}
        >
          {#each FUNCTIONS as fn (fn.value)}
            <SelectItem value={fn.value} text={fn.label} />
          {/each}
        </Select>
        <Button
          kind="ghost"
          size="small"
          hasIconOnly
          icon={ArrowRight}
          iconDescription={m.calc_insert_function()}
          on:click={insertFunction}
        />
      </div>
    </div>

    <Link href="#" icon={Launch} size="sm">
      {m.calc_help_link()}
    </Link>

    {#if testResult}
      <p class="test-result">{testResult}</p>
    {/if}

    {#if errorMessage}
      <InlineNotification
        kind="error"
        title={m.error_prefix()}
        subtitle={errorMessage}
        lowContrast
        hideCloseButton
      />
    {/if}

    <div class="actions">
      <Button
        kind="ghost"
        size="small"
        disabled={isTesting || !formula}
        on:click={handleTest}
      >
        {m.calc_test()}
      </Button>
      <Button
        kind="primary"
        size="small"
        disabled={!variableName || !formula}
        on:click={handleCalculate}
      >
        {m.calc_calculate()}
      </Button>
    </div>
  {/if}
</div>

<style>
  .calculator-panel {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-04);
  }

  .field-group {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }

  .field-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--cds-text-02);
  }

  .help-text {
    font-size: 0.75rem;
    color: var(--cds-text-02);
    margin: 0;
    line-height: 1.4;
  }

  .input-with-action {
    display: flex;
    gap: var(--cds-spacing-02);
    align-items: flex-end;
  }

  .input-with-action :global(.bx--select) {
    flex: 1;
  }

  .operators {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--cds-spacing-02);
  }

  .test-result {
    font-size: 0.875rem;
    color: var(--cds-text-02);
    background: var(--cds-ui-02);
    padding: var(--cds-spacing-03);
    border-radius: var(--cds-spacing-02);
    margin: 0;
  }

  .actions {
    display: flex;
    gap: var(--cds-spacing-03);
    padding-top: var(--cds-spacing-03);
  }
</style>
