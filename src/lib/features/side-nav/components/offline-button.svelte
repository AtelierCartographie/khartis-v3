<script lang="ts">
  import { connectivityStore } from '$lib/features/commons/stores/connectivity.store.svelte';
  import { globalState } from '$lib/features/commons/stores/global.svelte';
  import { m } from '$lib/paraglide/messages.js';
  import { Button } from 'carbon-components-svelte';
  import {
    Cloud,
    CloudDownload,
    CloudOffline,
    Warning
  } from 'carbon-icons-svelte';

  const icon = $derived(() => {
    if (!connectivityStore.isOnline) return CloudOffline;
    if (connectivityStore.quotaExceeded) return Warning;
    if (
      connectivityStore.warmupPhase === 'A' ||
      connectivityStore.warmupPhase === 'B' ||
      connectivityStore.warmupPhase === 'C'
    ) {
      return CloudDownload;
    }
    return Cloud;
  });

  const label = $derived(() => {
    if (!connectivityStore.isOnline) {
      return m.sidenav_offline_status_offline();
    }
    if (
      connectivityStore.warmupPhase === 'A' ||
      connectivityStore.warmupPhase === 'B'
    ) {
      return m.sidenav_offline_status_warming_up();
    }
    return m.sidenav_offline_button_label();
  });

  function openOfflinePanel() {
    globalState.isOfflinePanelOpen = true;
  }
</script>

<Button
  size="small"
  kind="ghost"
  icon={icon()}
  class="menu-bar-item"
  data-testid="sidenav-offline-button"
  on:click={openOfflinePanel}
>
  {label()}
  {#if connectivityStore.cachedBasemapCount > 0}
    <span class="offline-count">{connectivityStore.cachedBasemapCount}</span>
  {/if}
</Button>

<style>
  .offline-count {
    font-size: 0.65rem;
    color: var(--cds-text-03);
    margin-left: auto;
    background: var(--cds-layer-accent);
    padding: 0.05rem 0.4rem;
    border-radius: 0.6rem;
  }
</style>
