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
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    background-color: var(--cds-ui-01);
    border-radius: 50%;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
    opacity: 0.9;
  }

  .spinner {
    width: 1rem;
    height: 1rem;
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
