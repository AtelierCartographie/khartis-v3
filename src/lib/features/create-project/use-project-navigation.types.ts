export interface UseProjectNavigationProps {
  getOnClose: () => (() => void) | undefined;
}

export interface UseProjectNavigationReturn {
  navigateAfterAction: () => Promise<void>;
}
