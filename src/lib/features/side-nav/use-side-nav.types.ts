import type { Locale } from '$lib/paraglide/runtime.js';

export interface UseSideNavReturn {
  readonly currentLocale: Locale;
  readonly isDuplicating: boolean;
  handleNewProject: () => void;
  handleOpenProject: () => void;
  handleSaveProject: () => Promise<void>;
  handleDuplicateConfirm: (
    projectId: string,
    newName: string,
    closeModal: () => void
  ) => Promise<void>;
  handleDeleteConfirm: (closeModal: () => void) => Promise<void>;
  handleLanguageChange: (event: Event) => void;
  closeSideNav: () => void;
}
