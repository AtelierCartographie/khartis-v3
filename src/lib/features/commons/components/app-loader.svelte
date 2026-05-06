<script lang="ts">
  import Logo from '$lib/features/header/components/logo.svelte';
</script>

<div class="loading-container">
  <div class="loading-inner">
    <Logo />
    <div class="loading-spinner"></div>
  </div>
</div>

<style>
  .loading-container {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: var(--cds-ui-background);
    z-index: var(--z-overlay);
    padding-top: var(--safe-area-top);
    padding-bottom: var(--safe-area-bottom);
    padding-left: var(--safe-area-left);
    padding-right: var(--safe-area-right);
  }

  .loading-inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--cds-spacing-08);
  }

  .loading-inner :global(#khartis-logo) {
    transform: scale(1.2);
  }

  .loading-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--cds-border-subtle);
    border-top-color: var(--cds-interactive-01);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
