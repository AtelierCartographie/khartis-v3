export interface ProjectNavigationOptions {
  onClose?: () => void;
}

export interface ProjectNavigation {
  navigateAfterAction: () => Promise<void>;
}

export type UseProjectNavigationProps = ProjectNavigationOptions;
export type UseProjectNavigationReturn = ProjectNavigation;
