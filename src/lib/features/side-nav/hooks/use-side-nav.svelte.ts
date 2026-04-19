import { createProjectActions } from '$lib/features/commons/store/create-project.store.svelte';
import { EVENT } from '$lib/features/commons/constants/dom.constants';
import { globalState } from '$lib/features/commons/store/global.svelte';
import { projectStore } from '$lib/features/commons/store/project.store.svelte';
import { projectsStore } from '$lib/features/commons/store/projects.store.svelte';
import { getLocale, setLocale, type Locale } from '$lib/paraglide/runtime.js';
import { annotationsActions } from '$lib/features/step-toolbar/tools/annotations/annotations.store.svelte';

const SIDENAV_CONTAINER_ID = 'khartis-side-nav';
const HAMBURGER_SELECTOR = '.bx--header__menu-trigger';

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

export function useSideNav(): UseSideNavReturn {
  let currentLocale = $state<Locale>(getLocale());
  let isDuplicating = $state(false);

  $effect(() => {
    if (!globalState.isSideNavOpen) return;

    function handleOutsideClick(event: MouseEvent) {
      const target = event.target as Element;
      if (target.closest(`#${SIDENAV_CONTAINER_ID}`)) return;
      if (target.closest(HAMBURGER_SELECTOR)) return;

      globalState.isSideNavOpen = false;
    }

    const timeoutId = setTimeout(() => {
      document.addEventListener(EVENT.CLICK, handleOutsideClick);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener(EVENT.CLICK, handleOutsideClick);
    };
  });

  function closeSideNav() {
    globalState.isSideNavOpen = false;
  }

  function handleNewProject() {
    createProjectActions.resetAllTabs();
    createProjectActions.selectTab(1);
    globalState.isCreateProjectModalOpen = true;
    closeSideNav();
  }

  function handleOpenProject() {
    createProjectActions.resetAllTabs();
    createProjectActions.selectTab(2);
    globalState.isCreateProjectModalOpen = true;
    closeSideNav();
  }

  async function handleSaveProject() {
    if (!projectStore.currentProject) return;
    await projectStore.saveCurrentProject();
    closeSideNav();
  }

  async function handleDuplicateConfirm(
    projectId: string,
    newName: string,
    closeModal: () => void
  ) {
    const project = projectsStore.getProjectById(projectId);

    if (project) {
      isDuplicating = true;
      try {
        const duplicatedProject =
          await projectsStore.duplicateProject(projectId);

        if (duplicatedProject && newName !== duplicatedProject.name) {
          await projectsStore.updateProject(duplicatedProject.id, {
            name: newName
          });
        }

        if (duplicatedProject) {
          await projectsStore.openProject(duplicatedProject.id);
        }
      } finally {
        isDuplicating = false;
        closeModal();
      }
    }
  }

  async function handleDeleteConfirm(closeModal: () => void) {
    if (projectStore.currentProject) {
      const projectId = projectStore.currentProject.id;
      await projectStore.deleteProject(projectId);
      window.location.reload();
    }
    closeModal();
  }

  async function handleLanguageChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    const newLocale = target.value as Locale;
    await setLocale(newLocale, { reload: false });
    currentLocale = newLocale;
    annotationsActions.refreshPageElementPlaceholders();
  }

  return {
    get currentLocale() {
      return currentLocale;
    },
    get isDuplicating() {
      return isDuplicating;
    },
    handleNewProject,
    handleOpenProject,
    handleSaveProject,
    handleDuplicateConfirm,
    handleDeleteConfirm,
    handleLanguageChange,
    closeSideNav
  };
}
