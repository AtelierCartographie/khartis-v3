<script lang="ts">
import { Modal } from 'carbon-components-svelte';
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import {
    showSuccess,
    showError
  } from '$lib/features/commons/utils/notification.utils.svelte';

  let {
    open = $bindable(false),
    datasetId
  }: {
    open: boolean;
    datasetId: string;
  } = $props();

  const dataset = $derived(
    datasetsStore.datasets.find((d) => d.id === datasetId)
  );
  const hasModifications = $derived(
    dataset ? datasetsStore.hasModifications(datasetId) : false
  );

  function handleReset() {
    const success = datasetsStore.resetDataset(datasetId);

    if (success) {
      showSuccess(
        'Données réinitialisées',
        "Les données ont été restaurées à leur état d'origine"
      );
      open = false;
    } else {
      showError('Erreur', 'Impossible de réinitialiser les données');
    }
  }
</script>

<Modal
  bind:open={open}
  modalHeading="Réinitialiser les données"
  primaryButtonText="Réinitialiser"
  secondaryButtonText="Annuler"
  danger
  on:click:button--secondary={() => (open = false)}
  on:submit={handleReset}
  size="sm"
>
  <p>
    Cette action va restaurer les données de <strong
      >{dataset?.name || ''}</strong
    > à leur état d'origine.
  </p>

  {#if hasModifications}
    <p style="margin-top: 1rem; color: var(--cds-text-error);">
      <strong>Attention :</strong> Toutes les modifications apportées (filtres, calculs,
      suppressions) seront perdues.
    </p>
  {:else}
    <p style="margin-top: 1rem; color: var(--cds-text-02);">
      Aucune modification n'a été détectée sur ce jeu de données.
    </p>
  {/if}

  <p style="margin-top: 1rem; color: var(--cds-text-02);">
    Cette action est irréversible.
  </p>
</Modal>
