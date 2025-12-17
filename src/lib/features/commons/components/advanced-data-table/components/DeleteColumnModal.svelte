<script lang="ts">
  import { Modal } from 'carbon-components-svelte';

  let {
    open = $bindable(false),
    columnName,
    onConfirm,
    onCancel
  }: {
    open: boolean;
    columnName: string;
    onConfirm: () => Promise<void>;
    onCancel?: () => void;
  } = $props();

  let isDeleting = $state(false);

  async function handleConfirm() {
    isDeleting = true;
    try {
      await onConfirm();
      open = false;
    } finally {
      isDeleting = false;
    }
  }

  function handleCancel() {
    open = false;
    onCancel?.();
  }
</script>

<Modal
  bind:open={open}
  modalHeading="Supprimer la colonne"
  primaryButtonText={isDeleting ? 'Suppression...' : 'Supprimer'}
  primaryButtonDisabled={isDeleting}
  secondaryButtonText="Annuler"
  danger
  on:click:button--secondary={handleCancel}
  on:submit={handleConfirm}
  size="sm"
>
  <p>
    Êtes-vous sûr de vouloir supprimer la colonne <strong>"{columnName}"</strong
    > ?
  </p>
  <p style="margin-top: 1rem; color: var(--cds-text-error);">
    Cette action est irréversible. Toutes les données de cette colonne seront
    perdues.
  </p>
</Modal>
