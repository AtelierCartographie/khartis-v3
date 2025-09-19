export type ProjectionItem = {
  id: string;
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
    title: 'Gall Peters',
    subtitle: 'Surfaces',
    tag: 'Rectangulaire',
    ratio: '16:9',
    previewLabel: 'Projection preview',
    variant: 'default'
  },
  {
    id: 'rect-2',
    title: 'Mercator',
    subtitle: 'Surfaces',
    tag: 'Rectangulaire',
    ratio: '16:9',
    previewLabel: 'Projection preview',
    variant: 'default'
  },
  {
    id: 'rect-3',
    title: 'Bonne',
    subtitle: 'Surfaces',
    tag: 'Rectangulaire',
    ratio: '16:9',
    previewLabel: 'Projection preview',
    variant: 'default'
  },
  {
    id: 'arr-1',
    title: 'Equal Earth',
    subtitle: 'Surfaces',
    tag: 'Arrondie',
    ratio: '16:9',
    previewLabel: 'Projection preview',
    variant: 'default'
  },
  {
    id: 'arr-2',
    title: 'Armadillo',
    subtitle: 'Surfaces',
    tag: 'Arrondie',
    ratio: '16:9',
    previewLabel: 'Projection preview',
    variant: 'default'
  },
  {
    id: 'arr-3',
    title: 'Atlantis',
    subtitle: 'Surfaces',
    tag: 'Arrondie',
    ratio: '16:9',
    previewLabel: 'Projection preview',
    variant: 'default'
  },
  {
    id: 'disc-1',
    title: 'Air Ocean',
    subtitle: 'Surfaces',
    tag: 'Discontinue',
    ratio: '16:9',
    previewLabel: 'Projection preview',
    variant: 'default'
  },
  {
    id: 'disc-2',
    title: 'Butterfly',
    subtitle: 'Surfaces',
    tag: 'Discontinue',
    ratio: '16:9',
    previewLabel: 'Projection preview',
    variant: 'default'
  },
  {
    id: 'disc-3',
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
