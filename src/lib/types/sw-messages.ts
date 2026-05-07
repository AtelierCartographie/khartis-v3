export type OfflineCacheScope = 'all' | 'basemaps' | 'tiles';

export interface ClearOfflineCacheMessage {
  type: 'CLEAR_OFFLINE_CACHE';
  scope: OfflineCacheScope;
}

export interface SkipWaitingMessage {
  type: 'SKIP_WAITING';
}

export interface FactoryResetMessage {
  type: 'FACTORY_RESET';
}

export type ClientToSwMessage =
  | ClearOfflineCacheMessage
  | SkipWaitingMessage
  | FactoryResetMessage;

export interface BgFetchProgressMessage {
  type: 'BG_FETCH_PROGRESS';
  basemapId: string;
  downloaded: number;
  downloadTotal: number;
  progress: number;
}

export interface BgFetchDoneMessage {
  type: 'BG_FETCH_DONE';
  basemapId: string;
  bytes: number;
}

export interface BgFetchFailMessage {
  type: 'BG_FETCH_FAIL';
  basemapId: string;
  reason?: string;
}

export interface CacheClearedMessage {
  type: 'CACHE_CLEARED';
  scope: OfflineCacheScope;
  cleared: string[];
}

export interface QuotaExceededMessage {
  type: 'QUOTA_EXCEEDED';
  cacheName?: string;
}

export interface PwaResetDoneMessage {
  type: 'PWA_RESET_DONE';
  clearedCaches: string[];
}

export type SwToClientMessage =
  | BgFetchProgressMessage
  | BgFetchDoneMessage
  | BgFetchFailMessage
  | CacheClearedMessage
  | QuotaExceededMessage
  | PwaResetDoneMessage;

export function isSwToClientMessage(
  value: unknown
): value is SwToClientMessage {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { type?: unknown };
  if (typeof candidate.type !== 'string') return false;
  return [
    'BG_FETCH_PROGRESS',
    'BG_FETCH_DONE',
    'BG_FETCH_FAIL',
    'CACHE_CLEARED',
    'QUOTA_EXCEEDED',
    'PWA_RESET_DONE'
  ].includes(candidate.type);
}
