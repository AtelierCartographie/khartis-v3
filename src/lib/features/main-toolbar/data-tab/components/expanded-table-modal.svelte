<script lang="ts">
  import { Modal } from 'carbon-components-svelte';
  import AdvancedDataTable, {
    type CellHighlight
  } from '$lib/features/commons/components/advanced-data-table/advanced-data-table.svelte';
  import type { ProcessedDataset } from '$lib/features/data-pipeline';
  import { projectStore } from '$lib/features/commons/store/project.store.svelte';

  interface Props {
    open: boolean;
    dataset?: ProcessedDataset;
    tableName?: string;
    datasetVersion?: number;
    cellHighlights?: CellHighlight[];
    currentCell?: { rowId: number; columnName: string } | null;
    highlightedRowIds?: number[];
    onClose: () => void;
  }

  let {
    open = $bindable(false),
    dataset,
    tableName,
    datasetVersion,
    cellHighlights = [],
    currentCell = null,
    highlightedRowIds = [],
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
    if (!dataset?.sourceFileId) return dataset?.name || 'Données';
    const sourceFile = projectStore.currentProject?.data?.sourceFiles?.find(
      (f) => f.id === dataset.sourceFileId
    );
    return sourceFile?.name || dataset?.name || 'Données';
  });
  const fileInfo = $derived(getFileInfo(displayName));

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
    if (event.key === 'Enter') {
      event.preventDefault();
      saveRename();
    } else if (event.key === 'Escape') {
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
        title="Cliquer pour renommer"
      >
        {displayName}
      </button>
    {/if}
  </div>

  <div class="modal-table-container">
    <AdvancedDataTable
      dataset={dataset}
      tableName={tableName}
      datasetVersion={datasetVersion}
      showSummaryPlots={true}
      cellHighlights={cellHighlights}
      currentCell={currentCell}
      highlightedRowIds={highlightedRowIds}
      isExpanded={true}
      maxRows={25}
    />
  </div>
</Modal>

<style>
  .modal-table-container {
    height: 70vh;
    overflow: hidden;
  }

  :global(.bx--modal-container--lg) {
    max-width: 95vw !important;
    width: 95vw !important;
  }

  :global(.bx--modal-content) {
    padding: 0 !important;
    overflow: hidden;
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
    border-radius: 4px;
    transition: background-color 0.15s;
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
