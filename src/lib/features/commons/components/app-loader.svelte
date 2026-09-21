<script lang="ts">
  import Logo from '$lib/features/commons/components/logo.svelte';
  import { projectStore } from '$lib/features/commons/stores/project.store.svelte';
  import { buildLastProjectRestoreFallbackUrl } from '$lib/features/commons/utils/pwa-reset';
  import * as m from '$lib/paraglide/messages';
  import { onMount } from 'svelte';

  const SLOW_LOADING_THRESHOLD_MS = 15_000;

  interface Props {
    replacePage?: (url: string) => void;
  }

  let { replacePage = (url: string) => window.location.replace(url) }: Props =
    $props();
  let showRestoreFallback = $state(false);

  onMount(() => {
    const timeoutId = setTimeout(() => {
      showRestoreFallback = true;
    }, SLOW_LOADING_THRESHOLD_MS);

    return () => clearTimeout(timeoutId);
  });

  function openWithoutRestoringLastProject(): void {
    replacePage(
      buildLastProjectRestoreFallbackUrl(
        window.location.href,
        projectStore.currentProject?.id
      )
    );
  }
</script>

<div class="loading-container">
  <div class="loading-inner">
    <Logo />
    <div class="loading-spinner" aria-hidden="true"></div>
    <p class="loading-label" aria-live="polite">
      {m.app_loader_initializing()}
    </p>

    {#if showRestoreFallback}
      <div class="loading-recovery" aria-live="polite">
        <strong>{m.app_loader_slow_title()}</strong>
        <p>{m.app_loader_slow_message()}</p>
        <button type="button" onclick={openWithoutRestoringLastProject}>
          {m.app_loader_skip_restore()}
        </button>
      </div>
    {/if}
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
    width: min(420px, 100%);
    text-align: center;
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

  .loading-label {
    margin: calc(-1 * var(--cds-spacing-05)) 0 0;
    color: var(--cds-text-secondary, #525252);
  }

  .loading-recovery {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--cds-spacing-04);
    margin-top: var(--cds-spacing-03);
  }

  .loading-recovery p {
    margin: 0;
    color: var(--cds-text-secondary, #525252);
    line-height: 1.4;
  }

  .loading-recovery button {
    min-height: var(--kh-size-md);
    padding: 0 var(--cds-spacing-05);
    border: 1px solid var(--cds-border-strong-01, #8d8d8d);
    background: var(--cds-layer-01, #f4f4f4);
    color: var(--cds-text-primary, #161616);
    cursor: pointer;
    font: inherit;
  }

  .loading-recovery button:hover {
    background: var(--cds-layer-hover-01, #e8e8e8);
  }

  .loading-recovery button:focus-visible {
    outline: 2px solid var(--cds-focus, #0f62fe);
    outline-offset: 2px;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
