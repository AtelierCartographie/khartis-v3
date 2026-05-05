<script lang="ts">
  import { ToastNotification } from 'carbon-components-svelte';
  import {
    notificationManager,
    NotificationType
  } from '../utils/notification.utils.svelte';

  function getKind(type: NotificationType) {
    switch (type) {
      case NotificationType.SUCCESS:
        return 'success';

      case NotificationType.ERROR:
        return 'error';

      case NotificationType.WARNING:
        return 'warning';

      case NotificationType.INFO:
        return 'info';

      default:
        return 'info';
    }
  }
</script>

<div class="notification-container">
  {#each notificationManager.notifications as notification (notification.id)}
    <ToastNotification
      kind={getKind(notification.type)}
      title={notification.title}
      subtitle={notification.subtitle}
      caption={notification.caption}
      lowContrast={notification.lowContrast}
      on:close={() => notificationManager.removeNotification(notification.id)}
    />
  {/each}
</div>

<style>
  .notification-container {
    position: fixed;
    bottom: calc(16px + var(--safe-area-bottom));
    right: calc(16px + var(--safe-area-right));
    z-index: var(--z-notification);
    display: flex;
    flex-direction: column-reverse;
    gap: 8px;
    max-width: 400px;
    pointer-events: none;
  }

  .notification-container :global(.bx--toast-notification) {
    pointer-events: auto;
  }
</style>
