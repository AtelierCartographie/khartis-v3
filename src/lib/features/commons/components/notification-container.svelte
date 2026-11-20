<script lang="ts">
  import { ToastNotification } from 'carbon-components-svelte';
  import * as m from '$lib/paraglide/messages';
  import {
    notificationManager,
    type NotificationPlacement,
    NotificationType
  } from '../utils/notification.utils.svelte';

  const PLACEMENTS: NotificationPlacement[] = ['bottom-right', 'top-left'];

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

{#each PLACEMENTS as placement (placement)}
  <div class="notification-container notification-container--{placement}">
    {#each notificationManager.notifications.filter((notification) => (notification.placement ?? 'bottom-right') === placement) as notification (notification.id)}
      <ToastNotification
        closeButtonDescription={m.a11y_close_notification()}
        kind={getKind(notification.type)}
        title={notification.title}
        subtitle={notification.subtitle}
        caption={notification.caption}
        lowContrast={notification.lowContrast}
        on:close={() => notificationManager.removeNotification(notification.id)}
      />
    {/each}
  </div>
{/each}

<style>
  .notification-container {
    position: fixed;
    z-index: var(--z-notification);
    display: flex;
    flex-direction: column-reverse;
    gap: 8px;
    max-width: 400px;
    pointer-events: none;
  }

  .notification-container--bottom-right {
    bottom: calc(16px + var(--safe-area-bottom));
    right: calc(16px + var(--safe-area-right));
  }

  .notification-container--top-left {
    top: calc(var(--cds-header-height, 3rem) + 16px);
    left: calc(16px + var(--safe-area-left, 0px));
    flex-direction: column;
  }

  .notification-container :global(.bx--toast-notification) {
    pointer-events: auto;
  }
</style>
