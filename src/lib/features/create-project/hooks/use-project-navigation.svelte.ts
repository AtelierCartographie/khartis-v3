import type {
  ProjectNavigation,
  ProjectNavigationOptions
} from '../types/navigation.types';
import { goto } from '$app/navigation';
import { base } from '$app/paths';
import { createProjectActions } from '$lib/features/commons/stores/create-project.store.svelte';
import { globalState } from '$lib/features/commons/stores/global.svelte';

export type {
  ProjectNavigation,
  ProjectNavigationOptions,
  UseProjectNavigationProps,
  UseProjectNavigationReturn
} from '../types/navigation.types';

export function createProjectNavigation(
  options: ProjectNavigationOptions
): ProjectNavigation {
  async function navigateAfterAction(): Promise<void> {
    globalState.isCreateProjectModalOpen = false;
    createProjectActions.resetAllTabs();
    options.onClose?.();
    await goto(base || '/', { replaceState: true });
  }

  return { navigateAfterAction };
}

export const useProjectNavigation = createProjectNavigation;
