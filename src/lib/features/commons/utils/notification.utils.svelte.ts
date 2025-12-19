import { LogCategory, logger } from './logger';

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

class NotificationManager {
  private _notifications = $state<Notification[]>([]);

  private defaultTimeout = 5000;

  get notifications() {
    return this._notifications;
  }

  private addNotification(
    type: NotificationType,
    options: NotificationOptions
  ): string {
    const id = crypto.randomUUID();
    const notification: Notification = {
      id,
      type,
      timestamp: new Date(),
      ...options
    };

    this._notifications = [...this._notifications, notification];

    if (options.timeout !== 0) {
      setTimeout(() => {
        this.removeNotification(id);
      }, options.timeout || this.defaultTimeout);
    }

    return id;
  }

  success(options: NotificationOptions): string {
    return this.addNotification(NotificationType.SUCCESS, options);
  }

  error(options: NotificationOptions): string {
    logger.error(
      `${options.title}: ${options.subtitle || ''}`,
      LogCategory.NOTIFICATION
    );
    return this.addNotification(NotificationType.ERROR, {
      ...options,
      timeout: options.timeout ?? 10000
    });
  }

  warning(options: NotificationOptions): string {
    return this.addNotification(NotificationType.WARNING, options);
  }

  info(options: NotificationOptions): string {
    return this.addNotification(NotificationType.INFO, options);
  }

  removeNotification(id: string): void {
    this._notifications = this._notifications.filter((n) => n.id !== id);
  }

  clearAll(): void {
    this._notifications = [];
  }
}

export const notificationManager = new NotificationManager();

export function showSuccess(title: string, subtitle?: string): void {
  notificationManager.success({ title, subtitle });
}

export function showError(
  title: string,
  subtitle?: string,
  logDetails?: unknown
): void {
  if (logDetails) {
    logger.error(
      `${title}: ${subtitle || ''}`,
      LogCategory.ERROR_HANDLER,
      logDetails
    );
  }
  notificationManager.error({ title, subtitle });
}

export function showWarning(title: string, subtitle?: string): void {
  notificationManager.warning({ title, subtitle });
}
