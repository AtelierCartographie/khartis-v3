<script lang="ts">
  import { m } from '$lib/paraglide/messages.js';
  import { Modal } from 'carbon-components-svelte';

  interface Props {
    open: boolean;
    projectName: string;
    onClose: () => void;
    onConfirm: () => void;
  }

  let { open = $bindable(), projectName, onClose, onConfirm }: Props = $props();
</script>

<Modal
  danger
  bind:open={open}
  modalHeading={m.sidenav_delete_confirm_title()}
  primaryButtonText={m.sidenav_delete_confirm_button()}
  secondaryButtonText={m.open_project_cancel()}
  on:click:button--primary={onConfirm}
  on:click:button--secondary={onClose}
  on:close={onClose}
  size="sm"
>
  <p>{m.sidenav_delete_confirm_message({ name: projectName })}</p>
</Modal>
