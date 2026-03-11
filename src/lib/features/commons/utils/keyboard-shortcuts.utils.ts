type NavigatorLike = {
  platform?: string;
  userAgentData?: {
    platform?: string;
  };
};

export type SideNavShortcutKey =
  | 'newProject'
  | 'openProject'
  | 'saveProject'
  | 'duplicateProject'
  | 'deleteProject';

export const SHORTCUT_CODE = {
  projectPrefix: 'KeyK',
  openSideNav: 'KeyB',
  newProject: 'KeyN',
  openProject: 'KeyO',
  saveProject: 'KeyS',
  duplicateProject: 'KeyD',
  deleteProject: 'KeyX',
  zoomModeToggle: 'KeyZ',
  undo: 'KeyZ',
  redo: 'KeyY'
} as const;

export const PROJECT_SHORTCUT_TIMEOUT_MS = 2000;

const APPLE_PLATFORM_PATTERN = /(mac|iphone|ipad|ipod|ios)/i;
const CHORD_SEPARATOR = ' ';
const PROJECT_SHORTCUT_PREFIX_LABEL_APPLE = '⌃K';
const PROJECT_SHORTCUT_PREFIX_LABEL_OTHER = 'Ctrl+K';

const SIDE_NAV_SHORTCUT_LETTER: Record<SideNavShortcutKey, string> = {
  newProject: 'N',
  openProject: 'O',
  saveProject: 'S',
  duplicateProject: 'D',
  deleteProject: 'X'
};

function getNavigatorPlatform(navigatorLike?: NavigatorLike): string {
  if (!navigatorLike) return '';

  const userAgentDataPlatform = navigatorLike.userAgentData?.platform;
  if (userAgentDataPlatform) {
    return userAgentDataPlatform;
  }

  return navigatorLike.platform ?? '';
}

export function detectApplePlatform(
  navigatorLike: NavigatorLike | undefined = typeof navigator === 'undefined'
    ? undefined
    : navigator
): boolean {
  const platform = getNavigatorPlatform(navigatorLike);
  return APPLE_PLATFORM_PATTERN.test(platform);
}

export function getSideNavShortcutLabels(
  isApplePlatform: boolean
): Record<SideNavShortcutKey, string> {
  const prefixLabel = isApplePlatform
    ? PROJECT_SHORTCUT_PREFIX_LABEL_APPLE
    : PROJECT_SHORTCUT_PREFIX_LABEL_OTHER;

  return {
    newProject: [prefixLabel, SIDE_NAV_SHORTCUT_LETTER.newProject].join(
      CHORD_SEPARATOR
    ),
    openProject: [prefixLabel, SIDE_NAV_SHORTCUT_LETTER.openProject].join(
      CHORD_SEPARATOR
    ),
    saveProject: [prefixLabel, SIDE_NAV_SHORTCUT_LETTER.saveProject].join(
      CHORD_SEPARATOR
    ),
    duplicateProject: [
      prefixLabel,
      SIDE_NAV_SHORTCUT_LETTER.duplicateProject
    ].join(CHORD_SEPARATOR),
    deleteProject: [prefixLabel, SIDE_NAV_SHORTCUT_LETTER.deleteProject].join(
      CHORD_SEPARATOR
    )
  };
}

export function hasAnyPrimaryModifier(
  event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey'>
): boolean {
  return event.ctrlKey || event.metaKey;
}

export function hasPlatformPrimaryModifier(
  event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey'>,
  isApplePlatform: boolean
): boolean {
  if (isApplePlatform) {
    return event.metaKey;
  }

  return event.ctrlKey;
}

export function isShortcutCode(
  eventCode: string,
  expectedCode: string
): boolean {
  return eventCode === expectedCode;
}

export function getProjectShortcutPrefixLabel(
  isApplePlatform: boolean
): string {
  if (isApplePlatform) {
    return PROJECT_SHORTCUT_PREFIX_LABEL_APPLE;
  }

  return PROJECT_SHORTCUT_PREFIX_LABEL_OTHER;
}
