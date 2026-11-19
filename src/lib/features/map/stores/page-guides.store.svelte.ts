import {
  NO_PAGE_GUIDES,
  type PageGuides
} from '$lib/features/commons/utils/page-guides.utils';

/** The alignment lines a dragged page element currently snaps to. */
function createPageGuidesStore() {
  let guides = $state.raw<PageGuides>(NO_PAGE_GUIDES);

  return {
    get guides(): PageGuides {
      return guides;
    },
    show(next: PageGuides): void {
      if (
        next.vertical.join() === guides.vertical.join() &&
        next.horizontal.join() === guides.horizontal.join()
      ) {
        return;
      }
      guides = next;
    },
    clear(): void {
      guides = NO_PAGE_GUIDES;
    }
  };
}

export const pageGuidesStore = createPageGuidesStore();
