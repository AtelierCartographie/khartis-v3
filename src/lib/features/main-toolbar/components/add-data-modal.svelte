<script lang="ts">
  import {
    createProjectActions,
    createProjectState
  } from '$lib/features/commons/stores/create-project.store.svelte';
  import { DataSourceType } from '$lib/features/commons/stores/create-project.types';
  import { dataTabActions } from '$lib/features/commons/stores/data-tab.store.svelte';
  import { globalActions } from '$lib/features/commons/stores/global.svelte';
  import { projectStore } from '$lib/features/commons/stores/project.store.svelte';
  import { LogCategory, logger } from '$lib/features/commons/utils/logger';
  import CreateNewProject from '$lib/features/create-project/create-new-project.svelte';
  import {
    canSubmitImport,
    getValidImportFiles,
    hasPendingImportFiles
  } from '$lib/features/create-project/services/import-readiness.service';
  import * as m from '$lib/paraglide/messages';
  import { InlineNotification, Modal } from 'carbon-components-svelte';
  import { dataTabStore } from '$lib/features/data-tab/data-tab.store.svelte';
  import { dataToolsStore } from '$lib/features/data-tab/data-tools.store.svelte';

  interface Props {
    open: boolean;
    addDataButton: () => void;
  }

  let { open = $bindable(), addDataButton: _addDataButton }: Props = $props();

  let uploaderResetKey = $state(0);
  let previousOpen = false;
  $effect(() => {
    if (open && !previousOpen) {
      uploaderResetKey++;
      importError = false;
    }
    previousOpen = open;
  });

  let isImporting = $state(false);
  let importError = $state(false);

  const closeModal = (force = false) => {
    if (!force && isBusy) {
      return;
    }
    open = false;
    importError = false;
    createProjectActions.clearUploadState();
    uploaderResetKey++;
  };

  const handleClose = () => closeModal();

  const handleImport = async (e: CustomEvent) => {
    e.preventDefault();

    if (validFiles.length === 0) {
      return;
    }

    if (isBusy) {
      return;
    }

    if (projectStore.currentProject) {
      try {
        isImporting = true;

        await projectStore.addFilesToProject(validFiles);
        const firstFile = validFiles[0];
        if (firstFile?.id) {
          dataTabActions.reset();
          dataTabStore.reset();
          dataToolsStore.reset();
          globalActions.selectDataButton(firstFile.id);
        }

        closeModal(true);
      } catch (error) {
        logger.error('Failed to add files to project', LogCategory.FILE, error);
        importError = true;
      } finally {
        isImporting = false;
      }
    } else {
      logger.error('No current project', LogCategory.PROJECT);
    }
  };

  const uploadedFiles = $derived(createProjectState.newProject.uploadedFiles);

  const validFiles = $derived(getValidImportFiles(uploadedFiles));

  const hasPendingFiles = $derived(
    hasPendingImportFiles(
      uploadedFiles,
      createProjectState.newProject.isProcessingFiles
    )
  );

  const canImport = $derived(
    canSubmitImport(
      uploadedFiles,
      createProjectState.newProject.isProcessingFiles
    )
  );

  const isBusy = $derived(hasPendingFiles || isImporting);

  const preventClose = $derived(isBusy);

  const isPasteOnly = $derived(
    validFiles.length > 0 &&
      validFiles.every((f) => f.sourceType === DataSourceType.PASTE)
  );
</script>

<Modal
  primaryButtonDisabled={!canImport || isBusy}
  secondaryButtonText={m.cancel()}
  secondaryButtonDisabled={isBusy}
  open={open}
  modalHeading={m.add_data_modal_title()}
  primaryButtonText={isBusy
    ? m.add_data_modal_loading()
    : isPasteOnly
      ? m.create_project_load()
      : m.add_data_modal_confirm()}
  preventCloseOnClickOutside={preventClose}
  size="sm"
  on:click:button--secondary={handleClose}
  on:click:button--primary={handleImport}
  on:close={handleClose}
>
  <CreateNewProject isModal resetToken={uploaderResetKey} />
  {#if importError}
    <InlineNotification
      lowContrast
      kind="error"
      title={m.create_project_error_label()}
      subtitle={m.add_data_modal_import_error()}
      on:close={() => (importError = false)}
    />
  {/if}
</Modal>
