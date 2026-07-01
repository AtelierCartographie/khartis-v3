<script lang="ts">
  import { m } from '$lib/paraglide/messages.js';
  import {
    Button,
    ComposedModal,
    ModalBody,
    ModalFooter,
    ModalHeader
  } from 'carbon-components-svelte';
  import { Information } from 'carbon-icons-svelte';

  const DPO_EMAIL = 'dpo@sciencespo.fr';
  const CONTACT_EMAIL = 'carto@sciencespo.fr';
  const GITHUB_URL = 'https://github.com/AtelierCartographie/khartis-v3/';

  let isOpen = $state(false);

  function openModal() {
    isOpen = true;
  }

  function closeModal() {
    isOpen = false;
  }
</script>

<Button
  size="small"
  kind="ghost"
  icon={Information}
  class="menu-bar-item"
  data-testid="sidenav-data-privacy"
  on:click={openModal}
>
  {m.sidenav_data_privacy()}
</Button>

<ComposedModal bind:open={isOpen} size="sm" on:close={closeModal}>
  <ModalHeader title={m.sidenav_data_privacy()} />
  <ModalBody class="data-privacy-body">
    <p class="data-privacy-intro">{m.data_privacy_modal_intro()}</p>

    <section>
      <h3>{m.data_privacy_modal_privacy_heading()}</h3>
      <ul class="data-privacy-list">
        <li>
          <strong>{m.data_privacy_modal_privacy_local_label()} :</strong>
          {m.data_privacy_modal_privacy_local()}
        </li>
        <li>
          <strong>{m.data_privacy_modal_privacy_analytics_label()} :</strong>
          {m.data_privacy_modal_privacy_analytics()}
        </li>
        <li>
          <strong>{m.data_privacy_modal_privacy_remote_label()} :</strong>
          {m.data_privacy_modal_privacy_remote()}
        </li>
        <li>
          <strong>{m.data_privacy_modal_privacy_dpo_label()} :</strong>
          {m.data_privacy_modal_privacy_dpo()}
          <a href={`mailto:${DPO_EMAIL}`}>{DPO_EMAIL}</a>.
        </li>
      </ul>
    </section>

    <section>
      <h3>{m.data_privacy_modal_legal_heading()}</h3>
      <ul class="data-privacy-list">
        <li>
          <strong>{m.data_privacy_modal_legal_publisher_label()} :</strong>
          {m.data_privacy_modal_legal_publisher_value()}
        </li>
        <li>
          <strong>{m.data_privacy_modal_legal_address_label()} :</strong>
          {m.data_privacy_modal_legal_address_value()}
        </li>
        <li>
          <strong>{m.data_privacy_modal_legal_phone_label()} :</strong>
          {m.data_privacy_modal_legal_phone_value()}
        </li>
        <li>
          <strong>{m.data_privacy_modal_legal_director_label()} :</strong>
          {m.data_privacy_modal_legal_director_value()}
        </li>
        <li>
          <strong>{m.data_privacy_modal_legal_host_label()} :</strong>
          {m.data_privacy_modal_legal_host_value()}
        </li>
        <li>
          <strong>{m.data_privacy_modal_legal_contact_label()} :</strong>
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </li>
      </ul>
    </section>

    <section>
      <h3>{m.data_privacy_modal_team_heading()}</h3>
      <ul class="data-privacy-list">
        <li>
          <strong>{m.data_privacy_modal_team_design_label()} :</strong>
          {m.data_privacy_modal_team_design_value()}
        </li>
        <li>
          <strong>{m.data_privacy_modal_team_uiux_label()} :</strong>
          {m.data_privacy_modal_team_uiux_value()}
        </li>
        <li>
          <strong>{m.data_privacy_modal_team_dev_label()} :</strong>
          {m.data_privacy_modal_team_dev_value()}
        </li>
        <li>
          <strong>{m.data_privacy_modal_team_oss_label()} :</strong>
          {m.data_privacy_modal_team_oss_value()}
        </li>
      </ul>
    </section>

    <section>
      <h3>{m.data_privacy_modal_license_heading()}</h3>
      <ul class="data-privacy-list">
        <li>
          <strong>{m.data_privacy_modal_license_software_label()} :</strong>
          {m.data_privacy_modal_license_software_text()}
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer"
            >{m.data_privacy_modal_license_software_link()}</a
          >.
        </li>
        <li>
          <strong>{m.data_privacy_modal_license_data_label()} :</strong>
          {m.data_privacy_modal_license_data_value()}
        </li>
      </ul>
    </section>
  </ModalBody>
  <ModalFooter
    secondaryButtonText={m.data_privacy_modal_close()}
    on:click:button--secondary={closeModal}
  />
</ComposedModal>

<style>
  :global(.data-privacy-body) {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-06);
  }

  :global(.data-privacy-body section) {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
  }

  :global(.data-privacy-body h3) {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--cds-text-01);
  }

  .data-privacy-intro {
    margin: 0;
    color: var(--cds-text-02);
    line-height: 1.5;
  }

  .data-privacy-list {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
    margin: 0;
    padding-left: 1.25rem;
    color: var(--cds-text-02);
    line-height: 1.5;
  }

  .data-privacy-list strong {
    color: var(--cds-text-01);
  }
</style>
