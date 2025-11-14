<script lang="ts">
  import {
    createProjectActions,
    createProjectState
  } from '$lib/features/commons/store/create-project.store.svelte';
  import { globalActions } from '$lib/features/commons/store/global.svelte';
  import { projectStore } from '$lib/features/commons/store/project.store.svelte';
  import { LogCategory, logger } from '$lib/features/commons/utils/logger';
  import CreateNewProject from '$lib/features/create-project/create-new-project.svelte';
  import { Modal } from 'carbon-components-svelte';

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
    }
    previousOpen = open;
  });

  let isImporting = $state(false);

  const closeModal = () => {
    logger.info('Closing add data modal', LogCategory.FILE, {
      filesCount: createProjectState.newProject.uploadedFiles.length
    });
    open = false;
    createProjectActions.clearUploadState();
    uploaderResetKey++;
  };

  const handleImport = async (e: CustomEvent) => {
    e.preventDefault();

    const validFiles = createProjectState.newProject.uploadedFiles.filter(
      (f) =>
        f.status === 'complete' &&
        (!f.validation?.errors || f.validation.errors.length === 0)
    );

    if (validFiles.length === 0) {
      logger.warn('No valid files to import', LogCategory.FILE);
      return;
    }

    if (isLoading) {
      return;
    }

    if (projectStore.currentProject) {
      try {
        isImporting = true;
        logger.info('Adding files to project', LogCategory.FILE, {
          count: validFiles.length,
          files: validFiles.map((f) => f.name)
        });

        await projectStore.addFilesToProject(validFiles);
        const lastFile = validFiles[validFiles.length - 1];
        if (lastFile?.id) {
          globalActions.selectDataButton(lastFile.id);
        }
        closeModal();
      } catch (error) {
        logger.error('Failed to add files to project', LogCategory.FILE, error);
      } finally {
        isImporting = false;
      }
    } else {
      logger.error('No current project', LogCategory.PROJECT);
    }
  };

  const hasValidFiles = $derived(
    createProjectState.newProject.uploadedFiles.some(
      (f) =>
        f.status === 'complete' &&
        (!f.validation?.errors || f.validation.errors.length === 0)
    )
  );

  const hasErrors = $derived(
    createProjectState.newProject.uploadedFiles.some(
      (f) => f.validation?.errors && f.validation.errors.length > 0
    )
  );

  const isProcessing = $derived(
    createProjectState.newProject.uploadedFiles.some(
      (f) => f.status === 'processing'
    )
  );

  const canImport = $derived(hasValidFiles && !hasErrors && !isProcessing);

  const isLoading = $derived(isProcessing || isImporting);
</script>

<Modal
  primaryButtonDisabled={!canImport || isLoading}
  secondaryButtonText="Annuler"
  secondaryButtonDisabled={isLoading}
  open={open}
  modalHeading="Ajouter des données au projet"
  primaryButtonText={isLoading ? 'Ajout en cours...' : 'Ajouter au projet'}
  size="sm"
  on:click:button--secondary={closeModal}
  on:click:button--primary={handleImport}
  on:close={closeModal}
>
  <CreateNewProject isModal resetToken={uploaderResetKey} />
</Modal>
