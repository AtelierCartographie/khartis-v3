<script lang="ts">
  import {
    Button,
    Select,
    SelectItem,
    TextArea,
    TextInput,
    InlineNotification
  } from 'carbon-components-svelte';
  import { ArrowRight, Launch } from 'carbon-icons-svelte';
  import { dataToolsStore } from '../data-tools.store.svelte';
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import { duckDBOrchestrator } from '$lib/features/duckdb';
  import * as m from '$lib/paraglide/messages';

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

  const OPERATORS = [
    { label: '+', value: ' + ' },
    { label: '−', value: ' - ' },
    { label: '×', value: ' * ' },
    { label: '÷', value: ' / ' }
  ];

  const FUNCTIONS = $derived([
    { label: m.calc_function_average(), value: 'AVG', template: 'AVG({col})' },
    { label: m.calc_function_sum(), value: 'SUM', template: 'SUM({col})' },
    { label: m.calc_function_min(), value: 'MIN', template: 'MIN({col})' },
    { label: m.calc_function_max(), value: 'MAX', template: 'MAX({col})' },
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

    const col = selectedVariable || 'colonne';
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
      testResult = `Exemple : ${String(result)}`;
      dataToolsStore.setCalculatorTestResult(result);
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Expression invalide';
      dataToolsStore.setCalculatorError(errorMessage);
    } finally {
      isTesting = false;
    }
  }

  async function handleCalculate() {
    if (!tableName || !variableName.trim() || !formula.trim()) {
      errorMessage = 'Nom et formule requis';
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
      errorMessage = err instanceof Error ? err.message : 'Échec du calcul';
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
      <TextArea
        rows={4}
        labelText={m.calc_formula()}
        placeholder={m.calc_formula_placeholder()}
        bind:value={formula}
      />
    </div>

    <p class="help-text">
      {m.calc_help_text()}
    </p>

    <div class="field-group">
      <div class="input-with-action">
        <Select size="sm" labelText={m.calc_variables()} bind:selected={selectedVariable}>
          <SelectItem value="" text={m.calc_select_variable()} />
          {#each columns as column (column.name)}
            <SelectItem value={column.name} text={column.name} />
          {/each}
        </Select>
        <button
          type="button"
          class="insert-btn"
          onclick={insertVariable}
          disabled={!selectedVariable}
          aria-label={m.calc_insert_variable()}
        >
          <ArrowRight size={16} />
        </button>
      </div>
    </div>

    <div class="field-group">
      <span id="operators-label" class="field-label">{m.calc_operators()}</span>
      <div class="operators" role="group" aria-labelledby="operators-label">
        {#each OPERATORS as op (op.label)}
          <button
            type="button"
            class="operator-btn"
            onclick={() => insertOperator(op.value)}
          >
            {op.label}
          </button>
        {/each}
      </div>
    </div>

    <div class="field-group">
      <div class="input-with-action">
        <Select size="sm" labelText={m.calc_functions()} bind:selected={selectedFunction}>
          {#each FUNCTIONS as fn (fn.value)}
            <SelectItem value={fn.value} text={fn.label} />
          {/each}
        </Select>
        <button
          type="button"
          class="insert-btn"
          onclick={insertFunction}
          aria-label={m.calc_insert_function()}
        >
          <ArrowRight size={16} />
        </button>
      </div>
    </div>

    <button type="button" class="help-link" onclick={() => {}}>
      {m.calc_help_link()}
      <Launch size={16} />
    </button>

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

  .insert-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: 1px solid var(--cds-border-strong);
    background: var(--cds-ui-01);
    color: var(--cds-icon-01);
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.15s;
  }

  .insert-btn:hover:not(:disabled) {
    background-color: var(--cds-hover-ui);
  }

  .insert-btn:disabled {
    color: var(--cds-disabled-02);
    cursor: not-allowed;
  }

  .operators {
    display: flex;
    gap: var(--cds-spacing-02);
  }

  .operator-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border: 1px solid var(--cds-border-strong);
    background: var(--cds-ui-01);
    color: var(--cds-text-01);
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.15s;
  }

  .operator-btn:hover {
    background-color: var(--cds-hover-ui);
  }

  .help-link {
    display: inline-flex;
    align-items: center;
    gap: var(--cds-spacing-02);
    font-size: 0.875rem;
    color: var(--cds-link-01);
    text-decoration: none;
  }

  .help-link:hover {
    text-decoration: underline;
  }

  .test-result {
    font-size: 0.875rem;
    color: var(--cds-text-02);
    background: var(--cds-ui-02);
    padding: var(--cds-spacing-03);
    border-radius: 4px;
    margin: 0;
  }

  .actions {
    display: flex;
    gap: var(--cds-spacing-03);
    padding-top: var(--cds-spacing-03);
  }
</style>
