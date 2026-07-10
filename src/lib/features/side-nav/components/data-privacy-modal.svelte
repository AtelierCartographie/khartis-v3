<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { consentStore } from '$lib/features/commons/stores/consent.store.svelte';
  import Switch from '$lib/features/commons/components/switch.svelte';
  import {
    Button,
    ComposedModal,
    ModalBody,
    ModalFooter,
    ModalHeader
  } from 'carbon-components-svelte';
  import { Information } from 'carbon-icons-svelte';

  let isOpen = $state(false);

  function openModal() {
    isOpen = true;
  }

  function closeModal() {
    isOpen = false;
  }

  function handleAnalyticsConsentToggle(checked: boolean) {
    if (checked) {
      consentStore.acceptAll();
    } else {
      consentStore.declineAll();
    }
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
      <div class="analytics-consent-control">
        <Switch
          size="sm"
          labelText={m.cookie_settings_modal_analytics_label()}
          hideLabel
          labelA={m.cookie_settings_modal_consent_declined()}
          labelB={m.cookie_settings_modal_consent_allowed()}
          showStateLabel
          toggled={consentStore.analyticsAllowed}
          onchange={handleAnalyticsConsentToggle}
        />
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

  .analytics-consent-control {
    display: flex;
    margin-top: var(--cds-spacing-03);
  }
</style>
