<script lang="ts">
  import AdvancedDataTable, {
    type CellHighlight
  } from '$lib/features/commons/components/advanced-data-table/advanced-data-table.svelte';
  import type { TableMutation } from '$lib/features/commons/components/advanced-data-table/types';
  import { projectStore } from '$lib/features/commons/store/project.store.svelte';
  import type { ProcessedDataset } from '$lib/features/data-pipeline';
  import * as m from '$lib/paraglide/messages';
  import { Modal } from 'carbon-components-svelte';
  import { KEY } from '$lib/features/commons/constants/dom.constants';

  interface Props {
    open: boolean;
    dataset?: ProcessedDataset;
    tableName?: string;
    datasetVersion?: number;
    showSummaryPlots?: boolean;
    initialSortColumn?: string | null;
    initialSortOrder?: 'ASC' | 'DESC' | null;
    cellHighlights?: CellHighlight[];
    currentCell?: { rowId: number; columnName: string } | null;
    highlightedRowIds?: number[];
    isSelectable?: boolean;
    onSelectionChange?: (ids: number[], count: number) => void;
    onSortChange?: (
      column: string | null,
      order: 'ASC' | 'DESC' | null
    ) => void;
    onColumnDeleted?: (columnName: string) => void;
    onTableMutation?: (mutation: TableMutation) => Promise<void> | void;
    onClose: () => void;
  }

  let {
    open = $bindable(false),
    dataset,
    tableName,
    datasetVersion,
    showSummaryPlots = true,
    initialSortColumn = null,
    initialSortOrder = null,
    cellHighlights = [],
    currentCell = null,
    highlightedRowIds = [],
    isSelectable = false,
    onSelectionChange,
    onSortChange,
    onColumnDeleted,
    onTableMutation,
    onClose
  }: Props = $props();

  let isEditing = $state(false);
  let editedName = $state('');
  let inputRef = $state<HTMLInputElement | null>(null);
  let titleButtonRef = $state<HTMLButtonElement | null>(null);
  let inputWidth = $state<number>(200);

  const getFileInfo = (fileName: string) => {
    const lastDotIndex = fileName.lastIndexOf('.');
    const hasExtension =
      lastDotIndex > -1 && lastDotIndex < fileName.length - 1;
    const name = hasExtension ? fileName.slice(0, lastDotIndex) : fileName;
    const extension = hasExtension ? fileName.slice(lastDotIndex + 1) : '';
    return { name, extension };
  };

  const displayName = $derived.by(() => {
    if (!dataset?.sourceFileId)
      return dataset?.name || m.dataset_default_name();
    const sourceFile = projectStore.currentProject?.data?.sourceFiles?.find(
      (f) => f.id === dataset.sourceFileId
    );
    return sourceFile?.name || dataset?.name || m.dataset_default_name();
  });
  const fileInfo = $derived(getFileInfo(displayName));
  const tableRenderKey = $derived(
    `${dataset?.id ?? 'no-dataset'}::${tableName ?? 'no-table'}::${
      datasetVersion ?? 0
    }`
  );

  function startEditing() {
    if (!dataset?.sourceFileId) return;
    if (titleButtonRef) {
      const rect = titleButtonRef.getBoundingClientRect();
      inputWidth = Math.max(rect.width, 200);
    }
    editedName = fileInfo.name;
    isEditing = true;
  }

  async function saveRename() {
    if (!dataset?.sourceFileId || !editedName.trim()) {
      cancelEditing();
      return;
    }

    const newFullName = fileInfo.extension
      ? `${editedName.trim()}.${fileInfo.extension}`
      : editedName.trim();

    await projectStore.renameFile(dataset.sourceFileId, newFullName);
    isEditing = false;
    editedName = '';
  }

  function cancelEditing() {
    isEditing = false;
    editedName = '';
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === KEY.ENTER) {
      event.preventDefault();
      saveRename();
    } else if (event.key === KEY.ESCAPE) {
      event.preventDefault();
      cancelEditing();
    }
  }

  function handleBlur() {
    if (editedName.trim()) {
      saveRename();
    } else {
      cancelEditing();
    }
  }

  $effect(() => {
    if (isEditing && inputRef) {
      inputRef.focus();
      inputRef.select();
    }
  });
</script>

<div id="khartis-expanded-table-modal">
  <Modal
    bind:open={open}
    passiveModal
    modalHeading=""
    size="lg"
    on:close={onClose}
  >
    <div class="custom-header" slot="heading">
      {#if isEditing}
        <input
          type="text"
          class="title-input"
          style="width: {inputWidth}px"
          bind:value={editedName}
          bind:this={inputRef}
          onkeydown={handleKeydown}
          onblur={handleBlur}
        />
        {#if fileInfo.extension}
          <span class="extension">.{fileInfo.extension}</span>
        {/if}
      {:else}
        <button
          type="button"
          class="title-button"
          bind:this={titleButtonRef}
          onclick={startEditing}
          title={m.dataset_click_rename()}
        >
          {displayName}
        </button>
      {/if}
    </div>

    <div class="modal-table-container">
      {#key tableRenderKey}
        <AdvancedDataTable
          dataset={dataset}
          tableName={tableName}
          datasetVersion={datasetVersion}
          showSummaryPlots={showSummaryPlots}
          initialSortColumn={initialSortColumn}
          initialSortOrder={initialSortOrder}
          cellHighlights={cellHighlights}
          currentCell={currentCell}
          highlightedRowIds={highlightedRowIds}
          isExpanded={true}
          isSelectable={isSelectable}
          onColumnDeleted={onColumnDeleted}
          onTableMutation={onTableMutation}
          onSelectionChange={onSelectionChange}
          onSortChange={onSortChange}
        />
      {/key}
    </div>
  </Modal>
</div>

<style>
  .modal-table-container {
    height: 100%;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    padding: 0 var(--cds-spacing-05) var(--cds-spacing-05);
  }

  .modal-table-container :global(.advanced-data-table) {
    flex: 1;
    min-height: 0;
  }

  #khartis-expanded-table-modal :global(.bx--modal) {
    background-color: var(--cds-ui-01);
  }

  #khartis-expanded-table-modal :global(.bx--modal-container--lg) {
    max-width: 90vw !important;
    width: 90vw !important;
    max-height: 85vh !important;
    height: 85vh !important;
    background-color: var(--cds-ui-01);
  }

  #khartis-expanded-table-modal :global(.bx--modal-content) {
    padding: 0 !important;
    overflow: hidden;
    flex: 1;
    display: flex;
    flex-direction: column;
    background-color: var(--cds-ui-01);
  }

  #khartis-expanded-table-modal :global(.bx--modal-header) {
    margin-bottom: 0;
    flex-shrink: 0;
    padding: var(--cds-spacing-05);
    padding-bottom: var(--cds-spacing-03);
    background-color: var(--cds-ui-01);
  }

  #khartis-expanded-table-modal :global(.bx--modal-container) {
    display: flex;
    flex-direction: column;
    background-color: var(--cds-ui-01);
  }

  .custom-header {
    display: flex;
    align-items: center;
    gap: 0;
  }

  .title-button {
    background: transparent;
    border: none;
    font-size: 1.25rem;
    font-weight: 400;
    color: var(--cds-text-01);
    cursor: text;
    padding: 4px 8px;
    margin: -4px -8px;
    border-radius: var(--cds-spacing-02);
    transition: background-color 0.2s ease-out;
  }

  .title-button:hover {
    background-color: var(--cds-hover-ui);
  }

  .title-input {
    font-size: 1.25rem;
    font-weight: 400;
    color: var(--cds-text-01);
    background: transparent;
    border: none;
    border-bottom: 2px solid var(--cds-interactive-01);
    padding: 4px 8px;
    margin: -4px 0 -4px -8px;
    outline: none;
  }

  .extension {
    font-size: 1.25rem;
    font-weight: 400;
    color: var(--cds-text-02);
  }
</style>
