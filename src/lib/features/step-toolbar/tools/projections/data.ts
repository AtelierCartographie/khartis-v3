import { m } from '$lib/paraglide/messages';

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
  equalArea?: boolean;
  description?: string;
};

export const PROJECTIONS: ProjectionItem[] = [
  {
    id: 'rect-1',
    projectionId: 'gall-peters',
    title: m.projection_name_gall_peters(),
    subtitle: m.card_subtitle_surfaces(),
    tag: 'Rectangulaire',
    ratio: '2:1',
    previewLabel: m.projection_preview_label(),
    variant: 'default',
    equalArea: true,
    description: m.projection_desc_gall_peters()
  },
  {
    id: 'rect-2',
    projectionId: 'mercator',
    title: m.projection_name_mercator(),
    subtitle: m.card_subtitle_surfaces(),
    tag: 'Rectangulaire',
    ratio: '1:1',
    previewLabel: m.projection_preview_label(),
    variant: 'default',
    description: m.projection_desc_mercator()
  },
  {
    id: 'rect-3',
    projectionId: 'bonne',
    title: m.projection_name_bonne(),
    subtitle: m.card_subtitle_surfaces(),
    tag: 'Rectangulaire',
    ratio: '16:9',
    previewLabel: m.projection_preview_label(),
    variant: 'default',
    equalArea: true,
    description: m.projection_desc_bonne()
  },
  {
    id: 'arr-1',
    projectionId: 'equal-earth',
    title: m.projection_name_equal_earth(),
    subtitle: m.card_subtitle_surfaces(),
    tag: 'Arrondie',
    ratio: '2:1',
    previewLabel: m.projection_preview_label(),
    variant: 'default',
    equalArea: true,
    description: m.projection_desc_equal_earth()
  },
  {
    id: 'arr-2',
    projectionId: 'armadillo',
    title: m.projection_name_armadillo(),
    subtitle: m.card_subtitle_surfaces(),
    tag: 'Arrondie',
    ratio: '16:9',
    previewLabel: m.projection_preview_label(),
    variant: 'default',
    description: m.projection_desc_armadillo()
  },
  {
    id: 'arr-3',
    projectionId: 'atlantis',
    title: m.projection_name_atlantis(),
    subtitle: m.card_subtitle_surfaces(),
    tag: 'Arrondie',
    ratio: '2:1',
    previewLabel: m.projection_preview_label(),
    variant: 'default',
    equalArea: true,
    description: m.projection_desc_atlantis()
  },
  {
    id: 'disc-1',
    projectionId: 'bertin-1953',
    title: m.projection_name_bertin_1953(),
    subtitle: m.card_subtitle_surfaces(),
    tag: 'Discontinue',
    ratio: '16:9',
    previewLabel: m.projection_preview_label(),
    variant: 'default',
    description: m.projection_desc_bertin_1953()
  },
  {
    id: 'disc-2',
    projectionId: 'interrupted-mollweide',
    title: m.projection_name_interrupted_mollweide(),
    subtitle: m.card_subtitle_surfaces(),
    tag: 'Discontinue',
    ratio: '2:1',
    previewLabel: m.projection_preview_label(),
    variant: 'default',
    equalArea: true,
    description: m.projection_desc_interrupted_mollweide()
  },
  {
    id: 'disc-3',
    projectionId: 'mollweide',
    title: m.projection_name_mollweide(),
    subtitle: m.card_subtitle_surfaces(),
    tag: 'Discontinue',
    ratio: '2:1',
    previewLabel: m.projection_preview_label(),
    variant: 'default',
    equalArea: true,
    description: m.projection_desc_mollweide()
  }
];

export const GROUPS = [
  { id: 'Rectangulaire', labelKey: 'projection_group_rectangular' },
  { id: 'Arrondie', labelKey: 'projection_group_rounded' },
  { id: 'Discontinue', labelKey: 'projection_group_discontinuous' }
] as const;
