import { LogCategory, logger } from '$lib/features/commons/utils/logger';

const CONSENT_STORAGE_KEY = 'khartis_consent';
const CURRENT_CONSENT_VERSION = 1;

interface ConsentState {
  analytics: boolean;
  consentDate: string | null;
  consentVersion: number;
}

const DEFAULT_STATE: ConsentState = {
  analytics: false,
  consentDate: null,
  consentVersion: 0
};

function createConsentStore() {
  const state = $state<ConsentState>({ ...DEFAULT_STATE });

  load();

  function load(): void {
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem(CONSENT_STORAGE_KEY);
      if (!stored) return;

      const parsed: ConsentState = JSON.parse(stored);
      state.analytics = parsed.analytics;
      state.consentDate = parsed.consentDate;
      state.consentVersion = parsed.consentVersion;
    } catch (error) {
      logger.error(
        'Failed to load consent state from localStorage',
        LogCategory.STORE,
        error
      );
    }
  }

  function save(): void {
    if (typeof window === 'undefined') return;

    try {
      const toStore: ConsentState = {
        analytics: state.analytics,
        consentDate: state.consentDate,
        consentVersion: state.consentVersion
      };
      localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(toStore));
    } catch (error) {
      logger.error(
        'Failed to save consent state to localStorage',
        LogCategory.STORE,
        error
      );
    }
  }

  function acceptAll(): void {
    state.analytics = true;
    state.consentDate = new Date().toISOString();
    state.consentVersion = CURRENT_CONSENT_VERSION;
    save();
  }

  function declineAll(): void {
    state.analytics = false;
    state.consentDate = new Date().toISOString();
    state.consentVersion = CURRENT_CONSENT_VERSION;
    save();
  }

  return {
    get hasConsented(): boolean {
      return state.consentVersion >= CURRENT_CONSENT_VERSION;
    },
    get analyticsAllowed(): boolean {
      return state.analytics;
    },
    acceptAll,
    declineAll
  };
}

export const consentStore = createConsentStore();
