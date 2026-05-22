import {
  ChartTSne,
  MisuseOutline,
  StopFilledAlt,
  Table,
  Tag
} from 'carbon-icons-svelte';
import * as m from '$lib/paraglide/messages';
import { FillMode } from '$lib/features/commons/constants/visualization.constants';

export interface FillModeItem {
  icon: typeof MisuseOutline;
  label: string;
  iconSize: number;
}

export const FILL_MODES_STANDARD: readonly FillMode[] = [
  FillMode.NONE,
  FillMode.UNIQUE,
  FillMode.CLASSES,
  FillMode.CATEGORIES
];

export const FILL_MODES_WITH_DENSITY: readonly FillMode[] = [
  FillMode.NONE,
  FillMode.UNIQUE,
  FillMode.DENSITY,
  FillMode.CLASSES,
  FillMode.CATEGORIES
];

const DEFAULT_ICON_SIZE = 16;

const FILL_MODE_ITEMS: Record<FillMode, FillModeItem> = {
  [FillMode.NONE]: {
    icon: MisuseOutline,
    label: m.fill_mode_none(),
    iconSize: DEFAULT_ICON_SIZE
  },
  [FillMode.UNIQUE]: {
    icon: StopFilledAlt,
    label: m.fill_mode_unique(),
    iconSize: DEFAULT_ICON_SIZE
  },
  [FillMode.DENSITY]: {
    icon: ChartTSne,
    label: m.symbol_mode_density(),
    iconSize: DEFAULT_ICON_SIZE
  },
  [FillMode.CLASSES]: {
    icon: Table,
    label: m.fill_mode_classes(),
    iconSize: DEFAULT_ICON_SIZE
  },
  [FillMode.CATEGORIES]: {
    icon: Tag,
    label: m.fill_mode_categories(),
    iconSize: DEFAULT_ICON_SIZE
  }
};

export function buildFillModeItems(modes: readonly FillMode[]): FillModeItem[] {
  return modes.map((mode) => FILL_MODE_ITEMS[mode]);
}
