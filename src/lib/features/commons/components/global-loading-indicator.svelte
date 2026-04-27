<script lang="ts">
  import { loadingStore } from '$lib/features/commons/store/loading.store.svelte';
</script>

{#if loadingStore.isLoading}
  <div
    class="global-loading-indicator"
    aria-label="Chargement en cours"
    role="status"
  >
    <div class="spinner"></div>
  </div>
{/if}

<style>
  .global-loading-indicator {
    position: absolute;
    top: var(--cds-spacing-03);
    right: var(--cds-spacing-03);
    z-index: var(--z-content);
    pointer-events: none;
  }

  .spinner {
    width: 1.25rem;
    height: 1.25rem;
    border: 2px solid var(--cds-border-subtle-01);
    border-top-color: var(--cds-interactive-01);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
