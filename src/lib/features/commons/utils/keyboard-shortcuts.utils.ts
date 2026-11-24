import { getLocale } from '$lib/paraglide/runtime';
import { StylingTools, ToolbarStep, VisualizationTools } from '../types/global';

type NavigatorLike = {
  platform?: string;
  userAgentData?: {
    platform?: string;
  };
};

export type ShortcutLocale = 'fr' | 'en';

export type ShortcutAction =
  | { kind: 'step'; step: ToolbarStep }
  | { kind: 'tool'; tool: StylingTools | VisualizationTools }
  | { kind: 'menu' }
  | { kind: 'zoomMode' }
  | { kind: 'toggleGrid' };

interface SingleKeyShortcut {
  readonly id: string;
  /** Letter to press, by interface language. Always typed without modifier. */
  readonly keys: Readonly<Record<ShortcutLocale, string>>;
  /** Limits the shortcut to one step. Absent: active in every step. */
  readonly step?: ToolbarStep;
  readonly action: ShortcutAction;
}

/**
 * Letters are those of the tool names in each language, so a letter can differ
 * between French and English. Within one scope (global, or one step) a letter
 * is never used twice, in either language: the unit test guards it.
 */
export const SINGLE_KEY_SHORTCUTS = [
  {
    id: 'stepData',
    keys: { fr: 'D', en: 'D' },
    action: { kind: 'step', step: ToolbarStep.Data }
  },
  {
    id: 'stepVisualizations',
    keys: { fr: 'V', en: 'V' },
    action: { kind: 'step', step: ToolbarStep.Visualizations }
  },
  {
    id: 'stepStyling',
    keys: { fr: 'H', en: 'L' },
    action: { kind: 'step', step: ToolbarStep.Styling }
  },
  {
    id: 'mainMenu',
    keys: { fr: 'M', en: 'M' },
    action: { kind: 'menu' }
  },
  {
    id: 'zoomMode',
    keys: { fr: 'Z', en: 'Z' },
    action: { kind: 'zoomMode' }
  },
  {
    id: 'toolSearch',
    keys: { fr: 'R', en: 'F' },
    step: ToolbarStep.Visualizations,
    action: { kind: 'tool', tool: VisualizationTools.Search }
  },
  {
    id: 'toolLayers',
    keys: { fr: 'C', en: 'Y' },
    step: ToolbarStep.Visualizations,
    action: { kind: 'tool', tool: VisualizationTools.Layers }
  },
  {
    id: 'toolProjection',
    keys: { fr: 'P', en: 'P' },
    step: ToolbarStep.Visualizations,
    action: { kind: 'tool', tool: VisualizationTools.Projection }
  },
  {
    id: 'toolSimplification',
    keys: { fr: 'S', en: 'S' },
    step: ToolbarStep.Visualizations,
    action: { kind: 'tool', tool: VisualizationTools.Simplification }
  },
  {
    id: 'toolFacets',
    keys: { fr: 'K', en: 'K' },
    step: ToolbarStep.Visualizations,
    action: { kind: 'tool', tool: VisualizationTools.Facets }
  },
  {
    id: 'toolFormat',
    keys: { fr: 'F', en: 'F' },
    step: ToolbarStep.Styling,
    action: { kind: 'tool', tool: StylingTools.Format }
  },
  {
    id: 'toolLegend',
    keys: { fr: 'L', en: 'K' },
    step: ToolbarStep.Styling,
    action: { kind: 'tool', tool: StylingTools.Legend }
  },
  {
    id: 'toolGeoIndications',
    keys: { fr: 'I', en: 'E' },
    step: ToolbarStep.Styling,
    action: { kind: 'tool', tool: StylingTools.GeoIndications }
  },
  {
    id: 'toolAnnotations',
    keys: { fr: 'A', en: 'A' },
    step: ToolbarStep.Styling,
    action: { kind: 'tool', tool: StylingTools.Annotations }
  },
  {
    id: 'toggleGrid',
    keys: { fr: 'G', en: 'G' },
    step: ToolbarStep.Styling,
    action: { kind: 'toggleGrid' }
  },
  {
    id: 'toolColorBlindness',
    keys: { fr: 'B', en: 'C' },
    step: ToolbarStep.Styling,
    action: { kind: 'tool', tool: StylingTools.ColorBlindness }
  }
] as const satisfies readonly SingleKeyShortcut[];

export type SingleKeyShortcutId = (typeof SINGLE_KEY_SHORTCUTS)[number]['id'];

/** Letters pressed together with Cmd (Apple) or Ctrl (other platforms). */
export const PRIMARY_KEY_SHORTCUTS = {
  newProject: 'N',
  openProject: 'O',
  saveProject: 'S',
  download: 'E'
} as const;

export type PrimaryKeyShortcutId = keyof typeof PRIMARY_KEY_SHORTCUTS;

const APPLE_PLATFORM_PATTERN = /(mac|iphone|ipad|ipod|ios)/i;

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

/** Anything that is not French takes the English letters. */
export function resolveShortcutLocale(locale: string): ShortcutLocale {
  return locale.toLowerCase().startsWith('fr') ? 'fr' : 'en';
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

/**
 * The action a bare letter triggers in the given step, if any. The letter is
 * read from `event.key`, so it is the one printed on the user's keyboard
 * layout, the one the tooltips show.
 */
export function resolveSingleKeyAction(
  key: string,
  locale: ShortcutLocale,
  step: ToolbarStep | undefined
): ShortcutAction | undefined {
  const pressed = key.toUpperCase();
  const matches = SINGLE_KEY_SHORTCUTS.filter(
    (shortcut) => shortcut.keys[locale] === pressed
  );

  const scoped = matches.find(
    (shortcut) => 'step' in shortcut && shortcut.step === step
  );
  const global = matches.find((shortcut) => !('step' in shortcut));
  return (scoped ?? global)?.action;
}

export function getSingleKeyShortcutLabel(
  id: SingleKeyShortcutId,
  locale: ShortcutLocale
): string {
  const shortcut = SINGLE_KEY_SHORTCUTS.find(
    (candidate) => candidate.id === id
  );
  return shortcut ? shortcut.keys[locale] : '';
}

export function getPrimaryShortcutLabel(
  id: PrimaryKeyShortcutId,
  isApplePlatform: boolean
): string {
  return getPrimaryKeyLabel(PRIMARY_KEY_SHORTCUTS[id], isApplePlatform);
}

/** A key pressed with Cmd (Apple) or Ctrl, such as `+` or `0` for zoom. */
export function getPrimaryKeyLabel(
  key: string,
  isApplePlatform: boolean = detectApplePlatform()
): string {
  return isApplePlatform ? `⌘${key}` : `Ctrl+${key}`;
}

/** The modifier name the zoom shortcuts read as on this platform. */
export function getZoomShortcutModifiers(isApplePlatform: boolean): {
  primary: string;
} {
  return { primary: isApplePlatform ? '⌘' : 'Ctrl' };
}

/** Shortcut of a bare-letter command, in the current interface language. */
export function getShortcut(id: SingleKeyShortcutId): string {
  return getSingleKeyShortcutLabel(id, resolveShortcutLocale(getLocale()));
}

/** Shortcut of a Cmd/Ctrl command, adapted to the user's platform. */
export function getPrimaryShortcut(id: PrimaryKeyShortcutId): string {
  return getPrimaryShortcutLabel(id, detectApplePlatform());
}

/** The keycaps of a shortcut label: `Ctrl+S` gives `Ctrl`, `S`. */
export function splitShortcutKeys(shortcut: string): string[] {
  if (shortcut.startsWith('⌘') && shortcut.length > 1) {
    return ['⌘', shortcut.slice(1)];
  }

  if (shortcut.length > 1 && shortcut.includes('+')) {
    const keys = shortcut.split('+').filter(Boolean);
    // `Ctrl++` names the plus key itself.
    return shortcut.endsWith('++') ? [...keys, '+'] : keys;
  }

  return shortcut ? [shortcut] : [];
}
