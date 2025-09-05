<script lang="ts">
  import {
    dataTabActions,
    dataTabState
  } from '$lib/features/commons/store/data-tab.store.svelte';
  import { Button, DataTable, Tag } from 'carbon-components-svelte';
  import {
    Filter,
    Launch,
    Renew,
    Search,
    Table,
    TrashCan,
    WarningAltFilled
  } from 'carbon-icons-svelte';
  import MainToolBarHeader from '../components/main-toolbar-header.svelte';

  const expandedRowIds = $derived(dataTabState.dataControl.expandedRowIds);
  const selectedRowIds = $derived(dataTabState.dataControl.selectedRowIds);

  const headers: any = [
    { key: 'col1', value: 'Nom pays' },
    { key: 'col2', value: 'String Geo Lorem…' }
  ];

  const rows = Array.from({ length: 6 }).map((_, i) => ({
    id: i,
    col1: 'Content',
    col2: 'Content'
  }));
</script>

<section id="data-control-step">
  <MainToolBarHeader title="1. Contrôler les données" />

  <div class="toolbar">
    <div class="tools">
      <Button
        kind="ghost"
        icon={Search}
        iconDescription="Rechercher"
        on:click={() => {}}
      />
      <Button
        kind="ghost"
        icon={Filter}
        iconDescription="Filtrer"
        on:click={dataTabActions.toggleFilter}
      />
      <Button kind="ghost" icon={Table} iconDescription="Table" />
      <Button kind="ghost" icon={TrashCan} iconDescription="Supprimer" />
      <Button kind="ghost" icon={Renew} iconDescription="Annuler" />
    </div>
    <div class="grow"></div>
    <div class="expand">
      <span>Agrandir</span>
      <Button kind="ghost" icon={Launch} iconDescription="Agrandir" />
    </div>
  </div>

  <div class="chips-row">
    <div class="chips">
      <Tag type="teal">Nom pays</Tag>
      <Tag type="teal">String Geo Lorem…</Tag>
    </div>
  </div>

  <div class="summary">
    <div class="left">
      <div class="lines-count">100 lignes</div>
      <div class="issues">
        <span class="issue">
          <WarningAltFilled size={16} />
          <span>2 valeurs nulles</span>
        </span>
        <span class="issue">
          <WarningAltFilled size={16} />
          <span>2 doublons</span>
        </span>
      </div>
    </div>
    <div class="right">
      <Tag type="green">30 uniques</Tag>
    </div>
  </div>

  <DataTable
    batchExpansion
    batchSelection
    expandedRowIds={expandedRowIds}
    selectedRowIds={selectedRowIds}
    on:click:row--expand={(e) => {
      const event = e as CustomEvent<{ expanded: boolean; row: any }>;
      console.log('Row expanded:', event.detail);
    }}
    on:click:row--select={(e) => {
      const event = e as CustomEvent<{ selected: boolean; row: any }>;
      console.log('Row selected:', event.detail);
    }}
    headers={headers}
    rows={rows}
  >
    <svelte:fragment slot="expanded-row" let:row>
      <pre> {JSON.stringify(row, null, 2)}</pre>
    </svelte:fragment>
  </DataTable>
</section>

<style>
  #data-control-step {
    background-color: var(--cds-ui-02);
    padding: var(--cds-spacing-05);
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-04);
    padding: var(--cds-spacing-03) 0;
  }

  .toolbar .tools {
    display: flex;
    gap: var(--cds-spacing-02);
  }

  .toolbar .expand {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-02);
    color: var(--cds-text-02);
  }

  .chips-row {
    padding: var(--cds-spacing-03) 0;
  }

  .chips {
    display: flex;
    gap: var(--cds-spacing-03);
    flex-wrap: wrap;
  }

  .summary {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--cds-spacing-03) 0;
  }

  .lines-count {
    color: var(--cds-text-02);
    margin-bottom: var(--cds-spacing-02);
  }

  .issues {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .issue {
    display: inline-flex;
    align-items: center;
    gap: var(--cds-spacing-02);
    color: var(--cds-support-03);
    font-weight: 600;
  }
</style>
