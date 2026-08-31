<script lang="ts">
  import {
    pwaUpdateService,
    type PwaUpdateStatus
  } from '$lib/features/commons/services/pwa-update.service.svelte';
  import { m } from '$lib/paraglide/messages';
  import { Button, Loading } from 'carbon-components-svelte';
  import { Renew } from 'carbon-icons-svelte';

  const isBusy = $derived(
    pwaUpdateService.status === 'checking' ||
      pwaUpdateService.status === 'saving' ||
      pwaUpdateService.status === 'installing' ||
      pwaUpdateService.status === 'refreshing'
  );

  const buttonLabel = $derived(resolveButtonLabel(pwaUpdateService.status));

  function resolveButtonLabel(status: PwaUpdateStatus): string {
    switch (status) {
      case 'checking':
        return m.sidenav_update_checking();
      case 'up-to-date':
        return m.sidenav_update_up_to_date();
      case 'available':
        return m.sidenav_update_available();
      case 'saving':
        return m.sidenav_update_saving();
      case 'installing':
        return m.sidenav_update_installing();
      case 'refreshing':
        return m.sidenav_update_refreshing();
      case 'error':
        return m.sidenav_update_retry();
      default:
        return m.sidenav_update_check();
    }
  }

  async function handleUpdate(): Promise<void> {
    await pwaUpdateService.runFullUpdateFlow();
  }
</script>

<Button
  size="small"
  kind="ghost"
  icon={Renew}
  class="menu-bar-item"
  data-testid="sidenav-update-button"
  disabled={isBusy}
  aria-busy={isBusy}
  on:click={handleUpdate}
>
  {#if isBusy}
    <span class="update-button-loading">
      <Loading small withOverlay={false} />
      <span>{buttonLabel}</span>
    </span>
  {:else}
    {buttonLabel}
  {/if}
</Button>

<style>
  .update-button-loading {
    display: inline-flex;
    align-items: center;
    gap: var(--cds-spacing-03);
  }

  .update-button-loading :global(.bx--loading) {
    width: 1rem;
    height: 1rem;
  }
</style>
