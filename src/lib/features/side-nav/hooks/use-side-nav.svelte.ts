import type { UseSideNavReturn } from '../types';
export type { UseSideNavReturn } from '../types';
import { createProjectActions } from '$lib/features/commons/stores/create-project.store.svelte';
import { EVENT } from '$lib/features/commons/constants/dom.constants';
import { globalState } from '$lib/features/commons/stores/global.svelte';
import { projectStore } from '$lib/features/commons/stores/project.store.svelte';
import { projectsStore } from '$lib/features/commons/stores/projects.store.svelte';
import { getLocale, setLocale, type Locale } from '$lib/paraglide/runtime.js';
import * as m from '$lib/paraglide/messages';
import { annotationsActions } from '$lib/features/step-toolbar/tools/annotations';
import { showError } from '$lib/features/commons/utils/notification.utils.svelte';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';

const SIDENAV_CONTAINER_ID = 'khartis-side-nav';
const HAMBURGER_SELECTOR = '.bx--header__menu-trigger';

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
      } catch (error) {
        logger.error(
          'Failed to duplicate project from side nav',
          LogCategory.PROJECT,
          error
        );
        showError(m.error_duplicate_project_title(), m.error_generic_message());
      } finally {
        isDuplicating = false;
        closeModal();
      }
    }
  }

  async function handleDeleteConfirm(closeModal: () => void) {
    try {
      if (!projectStore.currentProject) {
        return;
      }

      const projectId = projectStore.currentProject.id;
      await projectStore.deleteProject(projectId);
      await projectsStore.refresh();
      globalState.isCreateProjectModalOpen = true;
      closeSideNav();
    } catch (error) {
      logger.error(
        'Failed to delete project from side nav',
        LogCategory.PROJECT,
        error
      );
      showError(m.error_delete_project_title(), m.error_generic_message());
    } finally {
      closeModal();
    }
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
