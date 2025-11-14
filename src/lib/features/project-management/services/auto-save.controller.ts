import { logger, LogCategory } from '$lib/features/commons/utils/logger';

export type AutoSaveConfig = {
  enabled: boolean;
  interval: number;
};

type SaveCallback = () => Promise<void>;

export class AutoSaveController {
  private timer?: number;

  private config: AutoSaveConfig;

  constructor(
    private readonly save: SaveCallback,
    initialConfig: AutoSaveConfig = { enabled: true, interval: 30000 }
  ) {
    this.config = initialConfig;
  }

  updateConfig(partial: Partial<AutoSaveConfig>): void {
    this.config = { ...this.config, ...partial };
  }

  schedule(isDirty: boolean): void {
    if (typeof window === 'undefined') {
      return;
    }

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }

    if (!this.config.enabled || !isDirty) {
      return;
    }

    this.timer = window.setTimeout(() => {
      this.save().catch((error) => {
        logger.error('Auto-save failed', LogCategory.PERSISTENCE, error);
      });
    }, this.config.interval);
  }

  cancel(): void {
    if (typeof window === 'undefined') {
      this.timer = undefined;
      return;
    }

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }
}
