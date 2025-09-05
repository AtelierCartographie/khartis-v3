<script lang="ts">
  import CreateNewProject from '$lib/features/create-project/create-new-project.svelte';
  import { Modal } from 'carbon-components-svelte';

  interface Props {
    open: boolean;
    addDataButton: () => void;
  }

  let { open = $bindable(), addDataButton }: Props = $props();

  const closeModal = () => {
    open = false;
  };

  const handleImport = () => {
    addDataButton();
  };
</script>

<Modal
  primaryButtonText="Importer"
  secondaryButtonText="Annuler"
  open={open}
  modalHeading="Importer de nouvelles données"
  on:click:button--secondary={closeModal}
  on:click:button--primary={handleImport}
  on:close={closeModal}
>
  <CreateNewProject isModal />
</Modal>
