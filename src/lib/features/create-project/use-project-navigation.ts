import { goto } from '$app/navigation';
import { base } from '$app/paths';
import { createProjectActions } from '$lib/features/commons/stores/create-project.store.svelte';
import { globalState } from '$lib/features/commons/stores/global.svelte';

export interface UseProjectNavigationProps {
  getOnClose: () => (() => void) | undefined;
}

export interface UseProjectNavigationReturn {
  navigateAfterAction: () => Promise<void>;
}

export function useProjectNavigation(
  props: UseProjectNavigationProps
): UseProjectNavigationReturn {
  async function navigateAfterAction(): Promise<void> {
    globalState.isCreateProjectModalOpen = false;
    createProjectActions.resetAllTabs();
    props.getOnClose()?.();
    // eslint-disable-next-line svelte/no-navigation-without-resolve
    await goto(base || '/', { replaceState: true });
  }

  return { navigateAfterAction };
}
