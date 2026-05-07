declare module 'virtual:pwa-register/svelte' {
  export interface RegisterSWOptions {
    immediate?: boolean;
    onRegistered?: (
      registration: ServiceWorkerRegistration | undefined
    ) => void;
    onRegisterError?: (error: unknown) => void;
  }

  export function useRegisterSW(options?: RegisterSWOptions): {
    updateServiceWorker: (reloadPage?: boolean) => Promise<void>;
  };
}
