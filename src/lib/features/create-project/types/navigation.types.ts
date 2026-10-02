export interface ProjectNavigationOptions {
  onClose?: () => void;
}

export interface ProjectNavigation {
  navigateAfterAction: () => Promise<void>;
}
