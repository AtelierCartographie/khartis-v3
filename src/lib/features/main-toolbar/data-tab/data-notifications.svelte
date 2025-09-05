<script lang="ts">
  import { InlineNotification } from 'carbon-components-svelte';
  import { dataTabActions, dataTabState } from './data-tab.store.svelte';

  const showVariableTypes = $derived(dataTabState.notifications.variableTypes);
  const showWarnings = $derived(dataTabState.notifications.warnings);
</script>

<section class="notifications">
  {#if showVariableTypes}
    <InlineNotification
      title="Types des variables"
      subtitle="Khartis a détecté le type de chaque variable. Il apporte ensuite des suggestions de visualisations plus pertinentes."
      kind="info"
      lowContrast
      hideCloseButton={false}
      on:close={() => dataTabActions.toggleNotification('variableTypes')}
    />
  {/if}

  {#if showWarnings}
    <InlineNotification
      title="Attention"
      subtitle="Plusieurs variables sont concernées par des avertissements indiqués dans l'en-tête du tableau."
      kind="warning"
      lowContrast
      hideCloseButton={false}
      on:close={() => dataTabActions.toggleNotification('warnings')}
    />
  {/if}
</section>

<style>
  .notifications {
    display: grid;
  }
</style>
