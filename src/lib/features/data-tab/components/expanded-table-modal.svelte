<script lang="ts">
  import AdvancedDataTable, {
    type CellHighlight
  } from '$lib/features/commons/components/advanced-data-table/advanced-data-table.svelte';
  import Portal from '$lib/features/commons/components/advanced-data-table/components/portal.svelte';
  import type { TableMutation } from '$lib/features/commons/components/advanced-data-table/types';
  import { projectStore } from '$lib/features/commons/stores/project.store.svelte';
  import type { ProcessedDataset } from '$lib/features/data-pipeline';
  import * as m from '$lib/paraglide/messages';
  import { Minimize } from 'carbon-icons-svelte';
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

  function handleTitleKeydown(event: KeyboardEvent) {
    if (event.key === KEY.ENTER) {
      event.preventDefault();
      saveRename();
    } else if (event.key === KEY.ESCAPE) {
      event.preventDefault();
      event.stopPropagation();
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

  $effect(() => {
    if (!open) return;

    function onDocKeydown(e: KeyboardEvent) {
      if (e.key === KEY.ESCAPE && !isEditing) {
        e.preventDefault();
        onClose();
      }
    }

    document.addEventListener('keydown', onDocKeydown);
    return () => document.removeEventListener('keydown', onDocKeydown);
  });
</script>

{#if open}
  <Portal>
    <div
      class="fullscreen-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={displayName}
    >
      <header class="overlay-header">
        <div class="header-title">
          {#if isEditing}
            <input
              type="text"
              class="title-input"
              aria-label={m.dataset_name_label()}
              style="width: {inputWidth}px"
              bind:value={editedName}
              bind:this={inputRef}
              onkeydown={handleTitleKeydown}
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
        <button
          type="button"
          class="collapse-btn"
          onclick={onClose}
          title={m.data_tool_collapse_icon()}
        >
          <Minimize size={16} />
          {m.data_tool_collapse_label()}
        </button>
      </header>
      <div class="table-container">
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
    </div>
  </Portal>
{/if}

<style>
  .fullscreen-overlay {
    position: fixed;
    inset: 0;
    z-index: var(--z-overlay);
    background-color: var(--cds-ui-01);
    display: flex;
    flex-direction: column;
    padding-top: var(--safe-area-top);
    padding-bottom: var(--safe-area-bottom);
    padding-left: var(--safe-area-left);
    padding-right: var(--safe-area-right);
  }

  .overlay-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--cds-spacing-04) var(--cds-spacing-05);
    border-bottom: 1px solid var(--cds-ui-03);
    flex-shrink: 0;
    background-color: var(--cds-ui-01);
  }

  .header-title {
    display: flex;
    align-items: center;
  }

  .table-container {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    padding: 0;
  }

  .table-container :global(.advanced-data-table) {
    flex: 1;
    min-height: 0;
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

  .collapse-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--cds-spacing-02);
    padding: 0 var(--cds-spacing-04) 0 var(--cds-spacing-03);
    height: 2rem;
    background: transparent;
    border: none;
    border-radius: 0;
    color: var(--cds-text-01);
    font-size: 0.875rem;
    font-family: inherit;
    cursor: pointer;
    white-space: nowrap;
    transition: background-color 0.11s ease;
  }

  .collapse-btn:hover {
    background-color: var(--cds-hover-ui);
  }

  .collapse-btn:focus-visible {
    outline: 2px solid var(--cds-focus);
    outline-offset: -2px;
  }
</style>
