<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import {
    InlineNotification,
    NotificationActionButton
  } from 'carbon-components-svelte';

  let {
    ondeactivate,
    onclose
  }: {
    ondeactivate: () => void;
    onclose: () => void;
  } = $props();
</script>

<InlineNotification
  closeButtonDescription={m.a11y_close_notification()}
  kind="info"
  lowContrast
  title={m.colorblind_notification_title()}
  subtitle={m.colorblind_notification_message()}
  hideCloseButton={false}
  on:close={onclose}
>
  <NotificationActionButton on:click={ondeactivate}>
    {m.colorblind_deactivate()}
  </NotificationActionButton>
</InlineNotification>
