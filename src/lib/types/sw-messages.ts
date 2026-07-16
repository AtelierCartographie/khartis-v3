export interface SkipWaitingMessage {
  type: 'SKIP_WAITING';
  persistenceFlushed: true;
  protocolVersion: 1;
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
