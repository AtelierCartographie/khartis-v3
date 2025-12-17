<script lang="ts">
  import { Modal, TextInput } from 'carbon-components-svelte';

  let {
    open = $bindable(false),
    columnName,
    existingColumns = [],
    onConfirm,
    onCancel
  }: {
    open: boolean;
    columnName: string;
    existingColumns?: string[];
    onConfirm: (newName: string) => Promise<void>;
    onCancel?: () => void;
  } = $props();

  let newName = $state('');
  let isRenaming = $state(false);
  let errorMessage = $state('');
  let inputRef = $state<HTMLInputElement | null>(null);

  $effect(() => {
    if (open) {
      newName = columnName;
      errorMessage = '';
      setTimeout(() => {
        inputRef?.focus();
        inputRef?.select();
      }, 100);
    }
  });

  const isValid = $derived(() => {
    if (!newName.trim()) return false;
    if (newName.trim() === columnName) return false;
    if (
      existingColumns.includes(newName.trim()) &&
      newName.trim() !== columnName
    ) {
      return false;
    }
    return true;
  });

  $effect(() => {
    if (
      newName.trim() &&
      existingColumns.includes(newName.trim()) &&
      newName.trim() !== columnName
    ) {
      errorMessage = 'Une colonne avec ce nom existe déjà';
    } else {
      errorMessage = '';
    }
  });

  async function handleConfirm() {
    if (!isValid()) return;

    isRenaming = true;
    try {
      await onConfirm(newName.trim());
      open = false;
    } catch (error) {
      errorMessage =
        error instanceof Error ? error.message : 'Erreur lors du renommage';
    } finally {
      isRenaming = false;
    }
  }

  function handleCancel() {
    open = false;
    onCancel?.();
  }
</script>

<Modal
  bind:open={open}
  modalHeading="Renommer la colonne"
  primaryButtonText={isRenaming ? 'Renommage...' : 'Renommer'}
  primaryButtonDisabled={isRenaming || !isValid()}
  secondaryButtonText="Annuler"
  on:click:button--secondary={handleCancel}
  on:submit={handleConfirm}
  size="sm"
>
  <TextInput
    labelText="Nouveau nom"
    placeholder="Entrez le nouveau nom de la colonne"
    bind:value={newName}
    invalid={!!errorMessage}
    invalidText={errorMessage}
    bind:ref={inputRef}
  />
  <p style="margin-top: 1rem; color: var(--cds-text-02); font-size: 0.875rem;">
    Nom actuel : <strong>{columnName}</strong>
  </p>
</Modal>
