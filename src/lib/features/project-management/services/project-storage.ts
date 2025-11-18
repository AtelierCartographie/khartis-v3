import localforage from 'localforage';
import { logger, LogCategory } from '$lib/features/commons/utils/logger';

export const projectStorage = {
  async save<T>(key: string, data: T): Promise<void> {
    try {
      await localforage.setItem(key, JSON.stringify(data));
    } catch (error) {
      logger.error(
        'Failed to save project storage entry',
        LogCategory.PERSISTENCE,
        {
          key,
          error
        }
      );
      throw new Error('Storage quota exceeded or storage unavailable');
    }
  },

  async load<T>(key: string): Promise<T | null> {
    try {
      const value = await localforage.getItem<string>(key);
      if (!value) return null;
      return JSON.parse(value) as T;
    } catch (error) {
      logger.warn('Failed to load project storage entry', LogCategory.PERSISTENCE, {
        key,
        error
      });
      return null;
    }
  },

  async remove(key: string): Promise<void> {
    await localforage.removeItem(key);
  }
};
