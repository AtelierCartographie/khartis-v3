import { createProjectActions } from '$lib/features/commons/store/create-project.store.svelte';
import { globalState } from '$lib/features/commons/store/global.svelte';
import { projectStore } from '$lib/features/commons/store/project.store.svelte';
import { projectsStore } from '$lib/features/commons/store/projects.store.svelte';
import { getLocale, setLocale, type Locale } from '$lib/paraglide/runtime.js';

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

  function closeSideNav() {
    globalState.isSideNavOpen = false;
  }

  function handleNewProject() {
    createProjectActions.selectTab(1);
    globalState.isCreateProjectModalOpen = true;
    closeSideNav();
  }

  function handleOpenProject() {
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

  function handleLanguageChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    const newLocale = target.value as Locale;
    setLocale(newLocale);
    currentLocale = newLocale;
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
