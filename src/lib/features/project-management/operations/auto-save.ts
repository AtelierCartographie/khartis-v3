import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { PROJECT_CONST } from '../constants';
import type { AutoSaveConfig } from '../types';

export type SaveCallback = () => Promise<void>;
export interface AutoSaveController {
  updateConfig: (partial: Partial<AutoSaveConfig>) => void;
  schedule: (isDirty: boolean) => void;
  cancel: () => void;
}

export function createAutoSaveController(
  save: SaveCallback,
  initialConfig: AutoSaveConfig = {
    enabled: true,
    interval: PROJECT_CONST.TIMINGS.AUTO_SAVE_DELAY
  }
): AutoSaveController {
  let timer: number | undefined;
  let config: AutoSaveConfig = initialConfig;

  function updateConfig(partial: Partial<AutoSaveConfig>): void {
    config = { ...config, ...partial };
  }

  function schedule(isDirty: boolean): void {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }

    if (!config.enabled || !isDirty) {
      return;
    }

    timer = setTimeout(() => {
      save().catch((error) => {
        logger.error('Auto-save failed', LogCategory.PERSISTENCE, error);
      });
    }, config.interval) as unknown as number;
  }

  function cancel(): void {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
  }

  return {
    updateConfig,
    schedule,
    cancel
  };
}
