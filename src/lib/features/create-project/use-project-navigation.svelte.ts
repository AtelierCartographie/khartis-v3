import type {
  UseProjectNavigationProps,
  UseProjectNavigationReturn
} from './types/navigation.types';
export type {
  UseProjectNavigationProps,
  UseProjectNavigationReturn
} from './types/navigation.types';
import { goto } from '$app/navigation';
import { base } from '$app/paths';
import { createProjectActions } from '$lib/features/commons/stores/create-project.store.svelte';
import { globalState } from '$lib/features/commons/stores/global.svelte';

export function useProjectNavigation(
  props: UseProjectNavigationProps
): UseProjectNavigationReturn {
  async function navigateAfterAction(): Promise<void> {
    globalState.isCreateProjectModalOpen = false;
    createProjectActions.resetAllTabs();
    props.getOnClose()?.();
    await goto(base || '/', { replaceState: true });
  }

  return { navigateAfterAction };
}
