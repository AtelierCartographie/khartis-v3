<script lang="ts">
  import CreateNewProject from '$lib/features/create-project/create-new-project.svelte';
  import { Modal } from 'carbon-components-svelte';
  import {
    createProjectState,
    createProjectActions
  } from '$lib/features/commons/store/create-project.store.svelte';
  import { projectStore } from '$lib/features/commons/store/project.store.svelte';

  interface Props {
    open: boolean;
    addDataButton: () => void;
  }

  let { open = $bindable(), addDataButton }: Props = $props();

  const closeModal = () => {
    open = false;
    createProjectActions.clearAllFiles();
  };

  const handleImport = async () => {
    const newFiles = createProjectState.newProject.uploadedFiles.filter(
      (f) => f.status === 'complete'
    );

    if (newFiles.length > 0 && projectStore.currentProject) {
      try {
        await projectStore.addFilesToProject(newFiles);
        closeModal();
      } catch (error) {
        console.error('[AddDataModal] Failed to add files to project:', error);
        // Don't close modal on error so user can see what happened
        // The error notification will be shown by the error handling in projectStore
      }
    } else {
      closeModal();
    }
  };

  const canImport = $derived(
    createProjectState.newProject.uploadedFiles.some(
      (f) => f.status === 'complete'
    )
  );

  const isProcessing = $derived(
    createProjectState.newProject.uploadedFiles.some(
      (f) => f.status === 'processing'
    )
  );
</script>

<Modal
  primaryButtonText="Ajouter au projet"
  primaryButtonDisabled={!canImport || isProcessing}
  secondaryButtonText="Annuler"
  open={open}
  modalHeading="Ajouter des données au projet"
  size="lg"
  on:click:button--secondary={closeModal}
  on:click:button--primary={handleImport}
  on:close={closeModal}
>
  <CreateNewProject isModal />
</Modal>
