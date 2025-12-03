<script lang="ts">
  import { globalState } from '$lib/features/commons/store/global.svelte';
  import { m } from '$lib/paraglide/messages.js';
  import {
    Button,
    ComposedModal,
    ModalBody,
    ModalFooter,
    ModalHeader
  } from 'carbon-components-svelte';
  import FileRoleCard from './components/file-role-card.svelte';
  import {
    dataTypeSelectionActions,
    dataTypeSelectionStore
  } from './data-type-selection.store.svelte';
  import type { DataRole } from './types';

  interface Props {
    onConfirm?: () => void;
  }

  let { onConfirm }: Props = $props();

  function handleRoleChange(fileId: string, role: DataRole) {
    dataTypeSelectionActions.setRole(fileId, role);
  }

  function handleConfirm() {
    dataTypeSelectionActions.confirm();
    globalState.isDataTypeSelectionModalOpen = false;
    onConfirm?.();
  }

  function handleCancel() {
    globalState.isDataTypeSelectionModalOpen = false;
  }

  const tabularFiles = $derived(dataTypeSelectionStore.tabularFiles);
  const geographicFiles = $derived(dataTypeSelectionStore.geographicFiles);
  const isValid = $derived(dataTypeSelectionStore.isValid);
</script>

<ComposedModal
  open={globalState.isDataTypeSelectionModalOpen}
  preventCloseOnClickOutside
  on:close={handleCancel}
>
  <ModalHeader
    title={m.data_type_selection_title()}
    closeClass="close-button"
  />
  <ModalBody hasForm>
    <p class="description">{m.data_type_selection_description()}</p>

    <div class="sections">
      {#if tabularFiles.length > 0 || geographicFiles.some((f) => f.assignedRole === 'tabular')}
        <section class="data-section">
          <h4 class="section-title">{m.data_type_role_tabular()}</h4>
          <p class="section-description">
            {m.data_type_role_tabular_description()}
          </p>
          <div class="files-list">
            {#each dataTypeSelectionStore.assignments.filter((a) => a.assignedRole === 'tabular') as file (file.fileId)}
              <FileRoleCard
                fileId={file.fileId}
                fileName={file.fileName}
                fileType={file.fileType}
                assignedRole={file.assignedRole}
                groupName={`role-${file.fileId}`}
                onRoleChange={handleRoleChange}
              />
            {/each}
          </div>
        </section>
      {/if}

      {#if geographicFiles.length > 0 || tabularFiles.some((f) => f.assignedRole === 'geographic')}
        <section class="data-section">
          <h4 class="section-title">{m.data_type_role_geographic()}</h4>
          <p class="section-description">
            {m.data_type_role_geographic_description()}
          </p>
          <div class="files-list">
            {#each dataTypeSelectionStore.assignments.filter((a) => a.assignedRole === 'geographic') as file (file.fileId)}
              <FileRoleCard
                fileId={file.fileId}
                fileName={file.fileName}
                fileType={file.fileType}
                assignedRole={file.assignedRole}
                groupName={`role-${file.fileId}`}
                onRoleChange={handleRoleChange}
              />
            {/each}
          </div>
        </section>
      {/if}
    </div>
  </ModalBody>
  <ModalFooter>
    <Button kind="secondary" on:click={handleCancel}>
      {m.data_type_cancel()}
    </Button>
    <Button kind="primary" disabled={!isValid} on:click={handleConfirm}>
      {m.data_type_confirm()}
    </Button>
  </ModalFooter>
</ComposedModal>

<style>
  .description {
    color: var(--cds-text-secondary);
    margin-bottom: var(--cds-spacing-06);
  }

  .sections {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-06);
  }

  .data-section {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-04);
  }

  .section-title {
    font-size: var(--cds-heading-02-font-size);
    font-weight: 600;
    color: var(--cds-text-primary);
    margin: 0;
  }

  .section-description {
    font-size: var(--cds-body-compact-01-font-size);
    color: var(--cds-text-secondary);
    margin: 0;
  }

  .files-list {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-04);
  }
</style>
