export type ProjectionItem = {
  id: string;
  projectionId: string;
  title: string;
  subtitle: string;
  tag: string;
  ratio?: string;
  previewLabel?: string;
  disabled?: boolean;
  variant?: 'default' | 'blue' | 'gray';
};

export const PROJECTIONS: ProjectionItem[] = [
  {
    id: 'rect-1',
    projectionId: 'equirectangular',
    title: 'Gall Peters',
    subtitle: 'Surfaces',
    tag: 'Rectangulaire',
    ratio: '16:9',
    previewLabel: 'Projection preview',
    variant: 'default'
  },
  {
    id: 'rect-2',
    projectionId: 'mercator',
    title: 'Mercator',
    subtitle: 'Surfaces',
    tag: 'Rectangulaire',
    ratio: '16:9',
    previewLabel: 'Projection preview',
    variant: 'default'
  },
  {
    id: 'rect-3',
    projectionId: 'albers',
    title: 'Bonne',
    subtitle: 'Surfaces',
    tag: 'Rectangulaire',
    ratio: '16:9',
    previewLabel: 'Projection preview',
    variant: 'default'
  },
  {
    id: 'arr-1',
    projectionId: 'natural-earth',
    title: 'Equal Earth',
    subtitle: 'Surfaces',
    tag: 'Arrondie',
    ratio: '16:9',
    previewLabel: 'Projection preview',
    variant: 'default'
  },
  {
    id: 'arr-2',
    projectionId: 'orthographic',
    title: 'Armadillo',
    subtitle: 'Surfaces',
    tag: 'Arrondie',
    ratio: '16:9',
    previewLabel: 'Projection preview',
    variant: 'default'
  },
  {
    id: 'arr-3',
    projectionId: 'robinson',
    title: 'Atlantis',
    subtitle: 'Surfaces',
    tag: 'Arrondie',
    ratio: '16:9',
    previewLabel: 'Projection preview',
    variant: 'default'
  },
  {
    id: 'disc-1',
    projectionId: 'winkel-tripel',
    title: 'Air Ocean',
    subtitle: 'Surfaces',
    tag: 'Discontinue',
    ratio: '16:9',
    previewLabel: 'Projection preview',
    variant: 'default'
  },
  {
    id: 'disc-2',
    projectionId: 'mollweide',
    title: 'Butterfly',
    subtitle: 'Surfaces',
    tag: 'Discontinue',
    ratio: '16:9',
    previewLabel: 'Projection preview',
    variant: 'default'
  },
  {
    id: 'disc-3',
    projectionId: 'mollweide',
    title: 'Mollweide interrompue',
    subtitle: 'Surfaces',
    tag: 'Discontinue',
    ratio: '16:9',
    previewLabel: 'Projection preview',
    variant: 'default'
  }
];

export const GROUPS = [
  { id: 'Rectangulaire', labelKey: 'projection_group_rectangular' },
  { id: 'Arrondie', labelKey: 'projection_group_rounded' },
  { id: 'Discontinue', labelKey: 'projection_group_discontinuous' }
] as const;
