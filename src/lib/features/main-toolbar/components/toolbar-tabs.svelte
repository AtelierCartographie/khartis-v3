<script lang="ts">
  import {
    globalActions,
    globalState
  } from '$lib/features/commons/store/global.svelte';
  import { ButtonKind } from '$lib/features/commons/types/enums';
  import { ToolbarState } from '$lib/features/commons/types/global';
  import { Button, Modal, Tag } from 'carbon-components-svelte';
  import { Add, Close } from 'carbon-icons-svelte';
  import clsx from 'clsx';
  import { projectStore } from '$lib/features/commons/store/project.store.svelte';
  import AddDataModal from './add-data-modal.svelte';

  let tabsScroller: HTMLDivElement | null = null;

  $effect(() => {
    const project = projectStore.currentProject;
    if (project?.data?.sourceFiles && globalState.dataButtons.length === 0) {
      globalActions.clearAllDataButtons();
      for (const file of project.data.sourceFiles) {
        globalActions.addDataButtonForFile(file.id, file.name);
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

  const closeAddDataModal = () => {
    isAddDataModalOpen = false;
  };

  const openDeleteConfirm = (
    fileId: string,
    fileName: string,
    event: Event
  ) => {
    event.stopPropagation();
    fileToDelete = { id: fileId, name: fileName };
    isDeleteConfirmOpen = true;
  };

  const handleDeleteFile = async () => {
    if (fileToDelete && projectStore.currentProject) {
      await projectStore.removeFileFromProject(fileToDelete.id);
      globalActions.removeDataButton(fileToDelete.id);
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

  const getExtensionColor = (
    extension: string
  ): 'blue' | 'green' | 'purple' | 'gray' => {
    const ext = extension.toLowerCase();
    switch (ext) {
      case 'csv':
      case 'tsv':
      case 'txt':
        return 'blue';
      case 'json':
      case 'geojson':
        return 'green';
      case 'shp':
      case 'gpkg':
      case 'kml':
        return 'purple';
      default:
        return 'gray';
    }
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
      <div class="tab-button-wrapper">
        <Button
          isSelected={dataButton.isSelected}
          kind={dataButton.isSelected ? ButtonKind.Primary : ButtonKind.Ghost}
          on:click={() => globalActions.selectDataButton(dataButton.id)}
          class="tab-button"
          title={dataButton.label}
        >
          <div class="tab-content">
            <span class="tab-label">{truncateFileName(fileInfo.name)}</span>
            {#if fileInfo.extension}
              <Tag type={getExtensionColor(fileInfo.extension)} size="sm">
                {fileInfo.extension}
              </Tag>
            {/if}
          </div>
          <button
            class="tab-close-button"
            onclick={(e) =>
              openDeleteConfirm(dataButton.id, dataButton.label, e)}
            aria-label="Supprimer le fichier"
            title="Supprimer le fichier"
          >
            <Close size={16} />
          </button>
        </Button>
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

<AddDataModal
  bind:open={isAddDataModalOpen}
  addDataButton={closeAddDataModal}
/>

<Modal
  danger
  open={isDeleteConfirmOpen}
  modalHeading="Supprimer le fichier"
  primaryButtonText="Supprimer"
  secondaryButtonText="Annuler"
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
  }

  .tab-content :global(.bx--tag) {
    flex-shrink: 0;
    font-size: 0.625rem;
    height: 18px;
    min-height: 18px;
  }

  .tab-close-button {
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

  .tab-close-button:hover {
    background-color: var(--cds-hover-ui);
  }

  .tab-close-button :global(svg) {
    fill: var(--cds-text-02);
  }

  .tab-close-button:hover :global(svg) {
    fill: var(--cds-text-01);
  }
</style>
