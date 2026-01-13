import type { Section } from './layers.types.js';

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
