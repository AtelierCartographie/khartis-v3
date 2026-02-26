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
    bottom: 1rem;
    right: 1rem;
    z-index: var(--z-overlay);
    max-width: 400px;
  }
</style>
