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
    return m.sidenav_offline_button_label();
  });

  const status = $derived(() => {
    if (!connectivityStore.isOnline) {
      return m.sidenav_offline_status_offline();
    }
    if (connectivityStore.quotaExceeded) {
      return m.sidenav_offline_status_storage_warning();
    }
    if (
      connectivityStore.warmupPhase === 'A' ||
      connectivityStore.warmupPhase === 'B'
    ) {
      return m.sidenav_offline_status_warming_up();
    }
    if (connectivityStore.cachedBasemapCount > 0) {
      return m.sidenav_offline_status_ready({
        count: connectivityStore.cachedBasemapCount
      });
    }
    return m.sidenav_offline_status_online();
  });

  const ariaLabel = $derived(() => {
    return `${label()}: ${status()}`;
  });

  function openOfflinePanel() {
    globalState.isOfflinePanelOpen = true;
  }
</script>

<Button
  size="small"
  kind="ghost"
  icon={icon()}
  class="menu-bar-item app-action-button"
  data-testid="sidenav-offline-button"
  aria-label={ariaLabel()}
  on:click={openOfflinePanel}
>
  <span class="app-action-copy">
    <span class="app-action-title">{label()}</span>
    <span class="app-action-meta">{status()}</span>
  </span>
</Button>
