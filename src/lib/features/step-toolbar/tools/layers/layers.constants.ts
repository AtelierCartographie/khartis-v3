import { Earth, Location, Txt } from 'carbon-icons-svelte';
import type { Layer, Section } from './layers.types.js';

export const DEFAULT_LAYERS: readonly Layer[] = [
  {
    id: 'texts',
    name: 'Texts',
    icon: Txt,
    visible: true,
    color: '#22c55e',
    type: 'visualization',
    order: 0
  },
  {
    id: 'symbols',
    name: 'Symbols',
    icon: Location,
    visible: true,
    color: '#22c55e',
    type: 'visualization',
    order: 1
  },
  {
    id: 'borders',
    name: 'Borders/Limits',
    icon: Earth,
    visible: true,
    color: '#dc2626',
    type: 'geographic',
    order: 2
  },
  {
    id: 'equator',
    name: 'Equator',
    icon: Earth,
    visible: true,
    color: '#dc2626',
    type: 'geographic',
    order: 3
  },
  {
    id: 'meridians',
    name: 'Meridians/Parallels',
    icon: Earth,
    visible: true,
    color: '#dc2626',
    type: 'geographic',
    order: 4
  },
  {
    id: 'earth',
    name: 'Earth',
    icon: Earth,
    visible: true,
    color: '#dc2626',
    type: 'geographic',
    order: 5
  },
  {
    id: 'oceans',
    name: 'Seas/Oceans',
    icon: Earth,
    visible: true,
    color: '#dc2626',
    type: 'geographic',
    order: 6
  }
];

export const DEFAULT_SECTIONS: readonly Section[] = [
  {
    id: 'visualization',
    title: 'Visualization',
    type: 'visualization',
    layers: [],
    order: 0
  },
  {
    id: 'geographic',
    title: 'Geographic',
    type: 'geographic',
    layers: [],
    order: 1
  }
];

export const LAYER_COLORS = {
  VISUALIZATION: '#22c55e',
  GEOGRAPHIC: '#dc2626'
} as const;

export const SECTION_TITLES = {
  VISUALIZATION: 'Visualization',
  GEOGRAPHIC: 'Geographic'
} as const;
