<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { consentStore } from '$lib/features/commons/stores/consent.store.svelte';
  import {
    Button,
    ComposedModal,
    ModalBody,
    ModalFooter,
    ModalHeader
  } from 'carbon-components-svelte';
  import { Information } from 'carbon-icons-svelte';

  let isOpen = $state(false);
  const analyticsConsentStatus = $derived(
    !consentStore.hasConsented
      ? m.cookie_settings_modal_consent_unset()
      : consentStore.analyticsAllowed
        ? m.cookie_settings_modal_consent_allowed()
        : m.cookie_settings_modal_consent_declined()
  );

  function openModal() {
    isOpen = true;
  }

  function closeModal() {
    isOpen = false;
  }

  function acceptAnalyticsConsent() {
    consentStore.acceptAll();
  }

  function declineAnalyticsConsent() {
    consentStore.declineAll();
  }
</script>

<Button
  size="small"
  kind="ghost"
  icon={Information}
  class="menu-bar-item"
  data-testid="sidenav-cookie-consent"
  on:click={openModal}
>
  {m.sidenav_cookie_consent()}
</Button>

<ComposedModal bind:open={isOpen} size="sm" on:close={closeModal}>
  <ModalHeader title={m.cookie_settings_modal_title()} />
  <ModalBody class="cookie-settings-body">
    <section class="cookie-settings-section">
      <h3>{m.cookie_settings_modal_analytics_label()}</h3>
      <p class="cookie-settings-copy">
        {m.cookie_settings_modal_description()}
      </p>
      <div class="analytics-consent-controls">
        <p class="analytics-consent-status">
          <strong>{m.cookie_settings_modal_current_choice_label()} :</strong>
          {analyticsConsentStatus}
        </p>
        <div class="analytics-consent-actions">
          <Button
            size="small"
            kind="secondary"
            disabled={consentStore.hasConsented &&
              consentStore.analyticsAllowed}
            on:click={acceptAnalyticsConsent}
          >
            {m.cookie_settings_modal_consent_accept()}
          </Button>
          <Button
            size="small"
            kind="secondary"
            disabled={consentStore.hasConsented &&
              !consentStore.analyticsAllowed}
            on:click={declineAnalyticsConsent}
          >
            {m.cookie_settings_modal_consent_decline()}
          </Button>
        </div>
      </div>
    </section>
  </ModalBody>
  <ModalFooter
    secondaryButtonText={m.cookie_settings_modal_close()}
    secondaryClass="khartis-dialog-close-action"
    on:click:button--secondary={closeModal}
  />
</ComposedModal>

<style>
  :global(.cookie-settings-body) {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-05);
  }

  .cookie-settings-section {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
  }

  .cookie-settings-section h3 {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--cds-text-01);
  }

  .cookie-settings-copy {
    margin: 0;
    color: var(--cds-text-02);
    line-height: 1.5;
  }

  .analytics-consent-controls {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
    margin-top: var(--cds-spacing-03);
  }

  .analytics-consent-status {
    margin: 0;
  }

  .analytics-consent-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--cds-spacing-03);
  }
</style>
