const DEFAULT_NOTIFICATION_TIMEOUT_MS = 5_000;
const ERROR_NOTIFICATION_TIMEOUT_MS = 10_000;

export enum NotificationType {
  SUCCESS = 'success',
  ERROR = 'error',
  WARNING = 'warning',
  INFO = 'info'
}

export interface NotificationOptions {
  title: string;
  subtitle?: string;
  caption?: string;
  timeout?: number;
  lowContrast?: boolean;
}

interface Notification extends NotificationOptions {
  id: string;
  type: NotificationType;
  timestamp: Date;
}

function createNotificationManager() {
  let notifications = $state<Notification[]>([]);
  const defaultTimeout = DEFAULT_NOTIFICATION_TIMEOUT_MS;

  function addNotification(
    type: NotificationType,
    options: NotificationOptions
  ): string {
    const existing = notifications.find(
      (n) =>
        n.type === type &&
        n.title === options.title &&
        n.subtitle === options.subtitle
    );
    if (existing) {
      return existing.id;
    }

    const id = crypto.randomUUID();
    const notification: Notification = {
      id,
      type,
      timestamp: new Date(),
      ...options
    };

    notifications = [...notifications, notification];

    if (options.timeout !== 0) {
      setTimeout(() => {
        removeNotification(id);
      }, options.timeout || defaultTimeout);
    }

    return id;
  }

  function success(options: NotificationOptions): string {
    return addNotification(NotificationType.SUCCESS, options);
  }

  function error(options: NotificationOptions): string {
    return addNotification(NotificationType.ERROR, {
      ...options,
      timeout: options.timeout ?? ERROR_NOTIFICATION_TIMEOUT_MS
    });
  }

  function warning(options: NotificationOptions): string {
    return addNotification(NotificationType.WARNING, options);
  }

  function info(options: NotificationOptions): string {
    return addNotification(NotificationType.INFO, options);
  }

  function removeNotification(id: string): void {
    notifications = notifications.filter(
      (notification) => notification.id !== id
    );
  }

  function clearAll(): void {
    notifications = [];
  }

  return {
    get notifications() {
      return notifications;
    },
    success,
    error,
    warning,
    info,
    removeNotification,
    clearAll
  };
}

export const notificationManager = createNotificationManager();

export function showSuccess(title: string, subtitle?: string): void {
  notificationManager.success({ title, subtitle });
}

export function showError(
  title: string,
  subtitle?: string,
  _logDetails?: unknown
): void {
  notificationManager.error({ title, subtitle });
}

export function showWarning(title: string, subtitle?: string): void {
  notificationManager.warning({ title, subtitle });
}

export function showInfo(title: string, subtitle?: string): void {
  notificationManager.info({ title, subtitle });
}
