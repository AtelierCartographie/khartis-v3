<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { consentStore } from '$lib/features/commons/store/consent.store.svelte';
  import {
    InlineNotification,
    NotificationActionButton
  } from 'carbon-components-svelte';

  function handleAccept() {
    consentStore.acceptAll();
  }

  function handleDecline() {
    consentStore.declineAll();
  }
</script>

{#if !consentStore.hasConsented}
  <div class="consent-banner-container">
    <InlineNotification
      kind="info"
      title={m.consent_title()}
      subtitle={m.consent_message()}
      hideCloseButton
      lowContrast={false}
    >
      <svelte:fragment slot="actions">
        <NotificationActionButton on:click={handleDecline}>
          {m.consent_decline()}
        </NotificationActionButton>
        <NotificationActionButton on:click={handleAccept}>
          {m.consent_accept()}
        </NotificationActionButton>
      </svelte:fragment>
    </InlineNotification>
  </div>
{/if}

<style>
  .consent-banner-container {
    position: fixed;
    bottom: calc(1rem + var(--safe-area-bottom));
    right: calc(1rem + var(--safe-area-right));
    z-index: var(--z-overlay);
    max-width: 400px;
  }

  :global(.consent-banner-container .bx--inline-notification) {
    flex-wrap: wrap;
    align-items: flex-start;
  }

  :global(.consent-banner-container .bx--inline-notification__details) {
    flex: 1 1 100%;
  }

  :global(.consent-banner-container .bx--inline-notification__action-button) {
    margin-inline-start: 2.5rem;
  }
</style>
