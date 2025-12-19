<script lang="ts">
  import {
    globalActions,
    globalState
  } from '$lib/features/commons/store/global.svelte';
  import { projectStore } from '$lib/features/commons/store/project.store.svelte';
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import { ButtonKind } from '$lib/features/commons/types/enums';
  import { ToolbarState } from '$lib/features/commons/types/global';
  import { Button, Modal, Tag, TextInput } from 'carbon-components-svelte';
  import {
    Add,
    OverflowMenuVertical,
    Copy,
    Edit,
    TrashCan
  } from 'carbon-icons-svelte';
  import clsx from 'clsx';
  import { SvelteMap } from 'svelte/reactivity';
  import AddDataModal from './add-data-modal.svelte';
  import {
    showError,
    showSuccess
  } from '$lib/features/commons/utils/notification.utils.svelte';
  import * as m from '$lib/paraglide/messages';
  import { Checkmark } from 'carbon-icons-svelte';

  let tabsScroller: HTMLDivElement | null = $state(null);

  const datasetsBySourceFile = $derived.by(() => {
    const map = new SvelteMap<
      string,
      { id: string; name: string; isSelected: boolean }[]
    >();
    for (const dataset of datasetsStore.datasets) {
      const sourceFileId = dataset.sourceFileId;
      if (!map.has(sourceFileId)) {
        map.set(sourceFileId, []);
      }
      map.get(sourceFileId)!.push({
        id: dataset.id,
        name: dataset.name,
        isSelected: datasetsStore.selectedDataset?.id === dataset.id
      });
    }
    return map;
  });

  function getDatasetCountForTab(sourceFileId: string): number {
    return datasetsBySourceFile.get(sourceFileId)?.length ?? 0;
  }

  function getDatasetsForTab(
    sourceFileId: string
  ): { id: string; name: string; isSelected: boolean }[] {
    return datasetsBySourceFile.get(sourceFileId) ?? [];
  }

  function getSelectedDatasetForTab(
    sourceFileId: string
  ): { id: string; name: string } | undefined {
    const datasets = getDatasetsForTab(sourceFileId);
    return datasets.find((d) => d.isSelected) ?? datasets[0];
  }

  function handleSelectDataset(datasetId: string, event: Event) {
    event.stopPropagation();
    datasetsStore.selectDataset(datasetId);
    closeTabMenu();
  }

  let datasetToDelete = $state<{ id: string; name: string } | null>(null);
  let isDeleteDatasetConfirmOpen = $state(false);
  let editingDatasetId = $state<string | null>(null);
  let editedDatasetName = $state('');

  function startEditingDataset(datasetId: string, name: string, event: Event) {
    event.stopPropagation();
    editingDatasetId = datasetId;
    editedDatasetName = name;
  }

  function saveDatasetRename() {
    if (!editingDatasetId || !editedDatasetName.trim()) {
      cancelDatasetEditing();
      return;
    }

    const success = datasetsStore.renameDatasetOnly(
      editingDatasetId,
      editedDatasetName.trim()
    );
    if (success) {
      showSuccess(
        m.success_dataset_renamed_title(),
        m.success_dataset_renamed_message({ name: editedDatasetName.trim() })
      );
    }
    cancelDatasetEditing();
  }

  function cancelDatasetEditing() {
    editingDatasetId = null;
    editedDatasetName = '';
  }

  function handleDatasetEditKeyPress(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveDatasetRename();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelDatasetEditing();
    }
  }

  function handleDeleteDataset(datasetId: string, name: string, event: Event) {
    event.stopPropagation();
    closeTabMenu();
    datasetToDelete = { id: datasetId, name };
    isDeleteDatasetConfirmOpen = true;
  }

  async function confirmDeleteDataset() {
    if (datasetToDelete) {
      const success = await datasetsStore.deleteDataset(datasetToDelete.id);
      if (success) {
        showSuccess(
          m.success_dataset_deleted_title(),
          m.success_dataset_deleted_message({ name: datasetToDelete.name })
        );
      }
    }
    isDeleteDatasetConfirmOpen = false;
    datasetToDelete = null;
  }

  function cancelDeleteDataset() {
    isDeleteDatasetConfirmOpen = false;
    datasetToDelete = null;
  }

  let lastSourceFilesCount = $state(0);

  let editingTabId = $state<string | null>(null);
  let editedName = $state('');
  let nameInputRef = $state<HTMLInputElement | null>(null);
  let tabRefs = new SvelteMap<string, HTMLDivElement>();

  let menuOpenTabId = $state<string | null>(null);
  let menuPosition = $state({ top: 0, left: 0 });

  function registerTab(node: HTMLDivElement, id: string) {
    tabRefs.set(id, node);

    return {
      destroy() {
        tabRefs.delete(id);
      }
    };
  }

  function startEditingTab(tabId: string, currentName: string) {
    const fileInfo = getFileInfo(currentName);
    editedName = fileInfo.name;
    editingTabId = tabId;
  }

  async function saveTabRename() {
    if (!editingTabId || !editedName.trim()) {
      cancelTabEditing();
      return;
    }

    const currentTab = globalState.dataButtons.find(
      (b) => b.id === editingTabId
    );
    if (currentTab) {
      const fileInfo = getFileInfo(currentTab.label);
      const newFullName = fileInfo.extension
        ? `${editedName.trim()}.${fileInfo.extension.toLowerCase()}`
        : editedName.trim();
      await projectStore.renameFile(editingTabId, newFullName);
    }
    editingTabId = null;
    editedName = '';
  }

  function cancelTabEditing() {
    editingTabId = null;
    editedName = '';
  }

  function handleTabKeyPress(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveTabRename();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelTabEditing();
    }
  }

  function handleTabBlur() {
    if (editedName.trim()) {
      saveTabRename();
    } else {
      cancelTabEditing();
    }
  }

  function toggleTabMenu(tabId: string, event: MouseEvent) {
    event.stopPropagation();
    if (menuOpenTabId === tabId) {
      menuOpenTabId = null;
    } else {
      const button = event.currentTarget as HTMLButtonElement;
      const rect = button.getBoundingClientRect();
      menuPosition = {
        top: rect.bottom + 4,
        left: rect.left
      };
      menuOpenTabId = tabId;
    }
  }

  function closeTabMenu() {
    menuOpenTabId = null;
  }

  function handleTabMenuClickOutside(event: MouseEvent) {
    const target = event.target as Node;
    const menuElement = document.querySelector('.tab-context-menu');
    if (menuElement && !menuElement.contains(target)) {
      closeTabMenu();
    }
  }

  async function handleDuplicateTab(tabId: string, event: Event) {
    event.stopPropagation();
    closeTabMenu();

    const dataset = datasetsStore.datasets.find(
      (d) => d.sourceFileId === tabId
    );
    if (!dataset) {
      showError(
        m.error_dataset_not_found_title(),
        m.error_dataset_not_found_message()
      );
      return;
    }

    try {
      const newDatasetId = await datasetsStore.duplicateDataset(dataset.id);
      if (newDatasetId) {
        datasetsStore.selectDataset(newDatasetId);
        const newDataset = datasetsStore.datasets.find(
          (d) => d.id === newDatasetId
        );
        showSuccess(
          m.success_dataset_duplicated_title(),
          m.success_dataset_duplicated_message({
            name: newDataset?.name ?? dataset.name
          })
        );
      }
    } catch (error) {
      showError(
        m.error_duplicate_dataset_title(),
        error instanceof Error ? error.message : m.error_generic_message()
      );
    }
  }

  function handleRenameFromMenu(tabId: string, label: string, event: Event) {
    event.stopPropagation();
    closeTabMenu();
    startEditingTab(tabId, label);
  }

  function handleDeleteFromMenu(
    fileId: string,
    fileName: string,
    event: Event
  ) {
    event.stopPropagation();
    closeTabMenu();
    fileToDelete = { id: fileId, name: fileName };
    isDeleteConfirmOpen = true;
  }

  $effect(() => {
    if (menuOpenTabId) {
      document.addEventListener('click', handleTabMenuClickOutside);
      return () =>
        document.removeEventListener('click', handleTabMenuClickOutside);
    }
  });

  $effect(() => {
    if (editingTabId && nameInputRef) {
      nameInputRef.focus();
      nameInputRef.select();
    }
  });

  $effect(() => {
    const sourceFiles = projectStore.currentProject?.data?.sourceFiles || [];

    if (sourceFiles.length !== lastSourceFilesCount) {
      lastSourceFilesCount = sourceFiles.length;
      globalActions.ensureTabSelected();
    }
  });

  $effect(() => {
    const selectedButton = globalState.dataButtons.find((b) => b.isSelected);
    if (selectedButton) {
      const element = tabRefs.get(selectedButton.id);
      if (element) {
        element.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'nearest'
        });
      }
    }
  });

  const onWheel = (e: WheelEvent) => {
    if (!tabsScroller) return;
    const dx = Math.abs(e.deltaX);
    const dy = Math.abs(e.deltaY);
    if (dy >= dx) {
      tabsScroller.scrollLeft += e.deltaY;
      e.preventDefault();
      e.stopPropagation();
    }
  };

  let isAddDataModalOpen = $state(false);
  let isDeleteConfirmOpen = $state(false);
  let fileToDelete = $state<{ id: string; name: string } | null>(null);

  const openAddDataModal = () => {
    isAddDataModalOpen = true;
  };

  const handleDeleteFile = async () => {
    if (fileToDelete && projectStore.currentProject) {
      await projectStore.removeFileFromProject(fileToDelete.id);
    }
    isDeleteConfirmOpen = false;
    fileToDelete = null;
  };

  const cancelDelete = () => {
    isDeleteConfirmOpen = false;
    fileToDelete = null;
  };

  const getFileInfo = (fileName: string) => {
    const lastDotIndex = fileName.lastIndexOf('.');
    const hasExtension =
      lastDotIndex > -1 && lastDotIndex < fileName.length - 1;

    const name = hasExtension ? fileName.slice(0, lastDotIndex) : fileName;
    const extension = hasExtension
      ? fileName.slice(lastDotIndex + 1).toUpperCase()
      : '';

    return { name, extension };
  };

  const truncateFileName = (name: string, maxLength: number = 20): string => {
    if (name.length <= maxLength) return name;
    return name.slice(0, maxLength - 3) + '...';
  };
</script>

<div
  class={clsx(
    'w-full flex items-center overflow-hidden',
    globalState.toolbarState === ToolbarState.Collapsed && 'opacity-0'
  )}
>
  <div
    class="tabs-scroller scrollbar-hidden"
    bind:this={tabsScroller}
    onwheel={onWheel}
  >
    {#each globalState.dataButtons as dataButton (dataButton.id)}
      {@const fileInfo = getFileInfo(dataButton.label)}
      {@const datasetCount = getDatasetCountForTab(dataButton.id)}
      {@const selectedDataset = getSelectedDatasetForTab(dataButton.id)}
      {@const displayName =
        datasetCount > 1 && selectedDataset
          ? selectedDataset.name
          : fileInfo.name}
      <div class="tab-button-wrapper" use:registerTab={dataButton.id}>
        <Button
          isSelected={dataButton.isSelected}
          kind={dataButton.isSelected ? ButtonKind.Primary : ButtonKind.Ghost}
          on:click={() => {
            if (!dataButton.isSelected) {
              globalActions.selectDataButton(dataButton.id);
            }
          }}
          class="tab-button"
          title={displayName}
        >
          <div class="tab-content">
            {#if editingTabId === dataButton.id}
              <input
                type="text"
                class="tab-name-input"
                bind:value={editedName}
                bind:this={nameInputRef}
                onkeydown={handleTabKeyPress}
                onblur={handleTabBlur}
                onclick={(e: MouseEvent) => e.stopPropagation()}
              />
            {:else}
              <span class="tab-label">
                {truncateFileName(displayName)}
              </span>
            {/if}
            {#if datasetCount > 1}
              <Tag type="high-contrast" size="sm" class="dataset-count-tag">
                {datasetCount}
              </Tag>
            {/if}
          </div>
          <button
            class="tab-menu-button"
            onclick={(e: MouseEvent) => toggleTabMenu(dataButton.id, e)}
            aria-label="Options du fichier"
            title="Options du fichier"
            aria-haspopup="true"
            aria-expanded={menuOpenTabId === dataButton.id}
          >
            <OverflowMenuVertical size={16} />
          </button>
        </Button>
        {#if menuOpenTabId === dataButton.id}
          {@const menuDatasets = getDatasetsForTab(dataButton.id)}
          <div
            class="tab-context-menu"
            style="top: {menuPosition.top}px; left: {menuPosition.left}px;"
            role="menu"
          >
            {#if menuDatasets.length > 1}
              <div class="tab-menu-section-label">Jeux de données</div>
              {#each menuDatasets as dataset (dataset.id)}
                <div class="tab-menu-item-dataset-row">
                  {#if editingDatasetId === dataset.id}
                    <TextInput
                      size="sm"
                      hideLabel
                      labelText="Nom du jeu de données"
                      bind:value={editedDatasetName}
                      on:keydown={handleDatasetEditKeyPress}
                      on:blur={saveDatasetRename}
                      on:click={(e) => e.stopPropagation()}
                    />
                  {:else}
                    <button
                      class="tab-menu-item tab-menu-item-dataset"
                      class:tab-menu-item-selected={dataset.isSelected}
                      onclick={(e: Event) => handleSelectDataset(dataset.id, e)}
                      role="menuitemradio"
                      aria-checked={dataset.isSelected}
                    >
                      <span class="dataset-check-icon">
                        {#if dataset.isSelected}
                          <Checkmark size={16} />
                        {/if}
                      </span>
                      <span class="dataset-name">{dataset.name}</span>
                    </button>
                  {/if}
                  <Button
                    kind="ghost"
                    size="small"
                    iconDescription="Renommer le jeu de données"
                    icon={Edit}
                    on:click={(e) =>
                      startEditingDataset(dataset.id, dataset.name, e)}
                  />
                  <Button
                    kind="danger-ghost"
                    size="small"
                    iconDescription="Supprimer le jeu de données"
                    icon={TrashCan}
                    on:click={(e) =>
                      handleDeleteDataset(dataset.id, dataset.name, e)}
                  />
                </div>
              {/each}
              <div class="tab-menu-divider"></div>
            {/if}
            <button
              class="tab-menu-item"
              onclick={(e: Event) =>
                handleRenameFromMenu(dataButton.id, dataButton.label, e)}
              role="menuitem"
            >
              <Edit size={16} />
              Renommer...
            </button>
            <button
              class="tab-menu-item"
              onclick={(e: Event) => handleDuplicateTab(dataButton.id, e)}
              role="menuitem"
            >
              <Copy size={16} />
              Dupliquer
            </button>
            <div class="tab-menu-divider"></div>
            <button
              class="tab-menu-item tab-menu-item-danger"
              onclick={(e: Event) =>
                handleDeleteFromMenu(dataButton.id, dataButton.label, e)}
              role="menuitem"
            >
              <TrashCan size={16} />
              Supprimer
            </button>
          </div>
        {/if}
      </div>
    {/each}

    {#if globalState.dataButtons.length === 0}
      <span class="no-files-text">Aucun fichier importé</span>
    {/if}
  </div>

  <div class="add-btn-wrapper">
    <Button
      kind="ghost"
      iconDescription="Ajouter des fichiers"
      icon={Add}
      on:click={openAddDataModal}
      aria-label="Ajouter des fichiers"
    />
  </div>
</div>

<AddDataModal bind:open={isAddDataModalOpen} addDataButton={openAddDataModal} />

<Modal
  danger
  open={isDeleteConfirmOpen}
  modalHeading="Supprimer le fichier"
  primaryButtonText="Supprimer"
  secondaryButtonText="Annuler"
  size="sm"
  on:click:button--secondary={cancelDelete}
  on:click:button--primary={handleDeleteFile}
  on:close={cancelDelete}
>
  <p>
    Êtes-vous sûr de vouloir supprimer le fichier <strong
      >{fileToDelete?.name}</strong
    > du projet ? Cette action est irréversible.
  </p>
</Modal>

<Modal
  danger
  open={isDeleteDatasetConfirmOpen}
  modalHeading="Supprimer le jeu de données"
  primaryButtonText="Supprimer"
  secondaryButtonText="Annuler"
  size="sm"
  on:click:button--secondary={cancelDeleteDataset}
  on:click:button--primary={confirmDeleteDataset}
  on:close={cancelDeleteDataset}
>
  <p>
    Êtes-vous sûr de vouloir supprimer le jeu de données <strong
      >{datasetToDelete?.name}</strong
    > ? Les visualisations associées seront également supprimées.
  </p>
</Modal>

<style>
  .tabs-scroller {
    display: flex;
    gap: var(--cds-spacing-03);
    overflow-x: auto;
    overflow-y: hidden;
    white-space: nowrap;
    flex: 1 1 auto;
    min-width: 0;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
  }

  .add-btn-wrapper {
    flex: 0 0 auto;
    margin-left: var(--cds-spacing-03);
  }

  .scrollbar-hidden {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }

  .scrollbar-hidden::-webkit-scrollbar {
    display: none;
  }

  .no-files-text {
    color: var(--cds-text-02);
    font-size: 0.875rem;
    padding: var(--cds-spacing-03) var(--cds-spacing-05);
    white-space: nowrap;
  }

  .tab-button-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  .tab-button-wrapper :global(.tab-button) {
    position: relative;
    padding-right: var(--cds-spacing-08);
    min-width: 100px;
    max-width: 220px;
  }

  .tab-content {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03);
    padding-right: var(--cds-spacing-05);
  }

  .tab-label {
    display: inline-block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 120px;
    cursor: text;
    padding: 2px 4px;
    border-radius: 2px;
    transition: background-color 0.15s;
  }

  .tab-label:hover {
    background-color: var(--cds-hover-ui);
  }

  .tab-name-input {
    width: 100px;
    max-width: 120px;
    padding: 2px 4px;
    font-size: inherit;
    font-family: inherit;
    font-weight: inherit;
    color: var(--cds-text-on-color);
    background: transparent;
    border: none;
    border-radius: 2px;
    outline: none;
  }

  .tab-name-input:focus {
    outline: none;
    box-shadow: none;
  }

  .tab-content :global(.bx--tag) {
    flex-shrink: 0;
    font-size: 0.625rem;
    height: 18px;
    min-height: 18px;
  }

  .tab-menu-button {
    position: absolute;
    right: var(--cds-spacing-03);
    top: 50%;
    transform: translateY(-50%);
    background: transparent;
    border: none;
    padding: var(--cds-spacing-02);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    border-radius: var(--cds-border-radius);
    transition: background-color 0.15s ease;
    z-index: 10;
  }

  .tab-menu-button:hover {
    background-color: var(--cds-hover-ui);
  }

  .tab-menu-button :global(svg) {
    fill: var(--cds-text-02);
  }

  .tab-menu-button:hover :global(svg) {
    fill: var(--cds-text-01);
  }

  .tab-context-menu {
    position: fixed;
    min-width: 160px;
    background-color: var(--cds-ui-01);
    border: 1px solid var(--cds-ui-03);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
    z-index: 10000;
    border-radius: 2px;
  }

  .tab-menu-item {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03);
    width: 100%;
    padding: var(--cds-spacing-03) var(--cds-spacing-04);
    border: none;
    background: transparent;
    color: var(--cds-text-01);
    font-size: 0.875rem;
    text-align: left;
    cursor: pointer;
  }

  .tab-menu-item:hover {
    background-color: var(--cds-hover-ui);
  }

  .tab-menu-item :global(svg) {
    fill: var(--cds-text-02);
    flex-shrink: 0;
  }

  .tab-menu-item-danger {
    color: var(--cds-support-01);
  }

  .tab-menu-item-danger:hover {
    background-color: var(--cds-support-01);
    color: var(--cds-text-04);
  }

  .tab-menu-item-danger:hover :global(svg) {
    fill: var(--cds-text-04);
  }

  .tab-menu-divider {
    height: 1px;
    background-color: var(--cds-ui-03);
    margin: var(--cds-spacing-02) 0;
  }

  .tab-menu-section-label {
    padding: var(--cds-spacing-02) var(--cds-spacing-04);
    font-size: 0.75rem;
    color: var(--cds-text-02);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.32px;
  }

  .tab-menu-item-dataset {
    padding-left: var(--cds-spacing-03);
  }

  .dataset-check-icon {
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .dataset-check-icon :global(svg) {
    fill: var(--cds-interactive-01);
  }

  .dataset-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 180px;
  }

  .tab-menu-item-selected {
    background-color: var(--cds-selected-ui);
  }

  .tab-menu-item-selected:hover {
    background-color: var(--cds-hover-selected-ui);
  }

  :global(.dataset-count-tag) {
    min-width: 20px;
    justify-content: center;
  }

  .tab-menu-item-dataset-row {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-01);
  }

  .tab-menu-item-dataset-row .tab-menu-item-dataset {
    flex: 1;
    min-width: 0;
  }

  .tab-menu-item-dataset-row :global(.bx--text-input) {
    flex: 1;
    min-width: 0;
  }

  .tab-menu-item-dataset-row :global(.bx--btn--ghost),
  .tab-menu-item-dataset-row :global(.bx--btn--danger-ghost) {
    min-height: auto;
    padding: var(--cds-spacing-02);
  }
</style>
