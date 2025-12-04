<script lang="ts">
  import { Modal, TextInput } from 'carbon-components-svelte';

  interface Props {
    open: boolean;
    columnName: string;
    onClose: () => void;
    onRename: (newName: string) => void;
  }

  let { open = $bindable(), columnName, onClose, onRename }: Props = $props();

  let newName = $state('');

  $effect(() => {
    if (open) {
      newName = columnName;
    }
  });

  function handleSubmit() {
    if (newName.trim() && newName !== columnName) {
      onRename(newName.trim());
      onClose();
    }
  }

  function handleKeyPress(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      handleSubmit();
    }
  }
</script>

<Modal
  bind:open={open}
  modalHeading="Renommer la colonne"
  primaryButtonText="Renommer"
  secondaryButtonText="Annuler"
  on:click:button--secondary={onClose}
  on:submit={handleSubmit}
  on:close={onClose}
  size="sm"
>
  <TextInput
    labelText="Nouveau nom"
    bind:value={newName}
    placeholder="Entrez le nouveau nom de la colonne"
    on:keydown={handleKeyPress}
  />
</Modal>
