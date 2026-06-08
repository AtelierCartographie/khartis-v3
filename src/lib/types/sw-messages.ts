export interface SkipWaitingMessage {
  type: 'SKIP_WAITING';
}

export interface FactoryResetMessage {
  type: 'FACTORY_RESET';
}

export type ClientToSwMessage = SkipWaitingMessage | FactoryResetMessage;

export interface PwaResetDoneMessage {
  type: 'PWA_RESET_DONE';
  clearedCaches: string[];
}

export type SwToClientMessage = PwaResetDoneMessage;
