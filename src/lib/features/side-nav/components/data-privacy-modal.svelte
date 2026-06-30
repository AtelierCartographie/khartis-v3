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
    <section>
      <h3>{m.data_privacy_modal_privacy_heading()}</h3>
      <p>{m.data_privacy_modal_privacy_local()}</p>
      <p>{m.data_privacy_modal_privacy_analytics()}</p>
      <p>{m.data_privacy_modal_privacy_remote()}</p>
    </section>

    <section>
      <h3>{m.data_privacy_modal_legal_heading()}</h3>
      <ul class="data-privacy-legal">
        <li>{m.data_privacy_modal_legal_publisher()}</li>
        <li>{m.data_privacy_modal_legal_address()}</li>
        <li>{m.data_privacy_modal_legal_director()}</li>
        <li>{m.data_privacy_modal_legal_host()}</li>
        <li>{m.data_privacy_modal_legal_contact()}</li>
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

  :global(.data-privacy-body p) {
    margin: 0;
    color: var(--cds-text-02);
    line-height: 1.5;
  }

  .data-privacy-legal {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
    margin: 0;
    padding-left: 1.25rem;
    color: var(--cds-text-02);
    line-height: 1.5;
  }
</style>
