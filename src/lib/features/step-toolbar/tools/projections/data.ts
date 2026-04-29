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
    projectionId: 'mercator',
    title: m.projection_name_mercator(),
    subtitle: m.card_subtitle_surfaces(),
    tag: m.tag_rectangular(),
    ratio: '1:1',
    previewLabel: m.projection_preview_label(),
    variant: 'default',
    description: m.projection_desc_mercator()
  },
  {
    id: 'arr-1',
    projectionId: 'natural-earth',
    title: m.projection_name_natural_earth(),
    subtitle: m.card_subtitle_surfaces(),
    tag: m.projection_group_rounded(),
    ratio: '2:1',
    previewLabel: m.projection_preview_label(),
    variant: 'default',
    description: m.projection_desc_natural_earth()
  },
  {
    id: 'rect-2',
    projectionId: 'equirectangular',
    title: m.projection_name_equirectangular(),
    subtitle: m.card_subtitle_surfaces(),
    tag: m.tag_rectangular(),
    ratio: '2:1',
    previewLabel: m.projection_preview_label(),
    variant: 'default',
    description: m.projection_desc_equirectangular()
  },
  {
    id: 'arr-2',
    projectionId: 'orthographic',
    title: m.projection_name_orthographic(),
    subtitle: m.card_subtitle_surfaces(),
    tag: m.projection_group_rounded(),
    ratio: '1:1',
    previewLabel: m.projection_preview_label(),
    variant: 'default',
    description: m.projection_desc_orthographic()
  },
  {
    id: 'rect-3',
    projectionId: 'albers',
    title: m.projection_name_albers(),
    subtitle: m.card_subtitle_surfaces(),
    tag: m.tag_rectangular(),
    ratio: '16:9',
    previewLabel: m.projection_preview_label(),
    variant: 'default',
    equalArea: true,
    description: m.projection_desc_albers()
  },
  {
    id: 'rect-4',
    projectionId: 'lambert-conformal',
    title: m.projection_name_lambert_conformal(),
    subtitle: m.card_subtitle_surfaces(),
    tag: m.tag_rectangular(),
    ratio: '16:9',
    previewLabel: m.projection_preview_label(),
    variant: 'default',
    description: m.projection_desc_lambert_conformal()
  },
  {
    id: 'arr-3',
    projectionId: 'robinson',
    title: m.projection_name_robinson(),
    subtitle: m.card_subtitle_surfaces(),
    tag: m.projection_group_rounded(),
    ratio: '2:1',
    previewLabel: m.projection_preview_label(),
    variant: 'default',
    description: m.projection_desc_robinson()
  },
  {
    id: 'arr-4',
    projectionId: 'winkel-tripel',
    title: m.projection_name_winkel_tripel(),
    subtitle: m.card_subtitle_surfaces(),
    tag: m.projection_group_rounded(),
    ratio: '2:1',
    previewLabel: m.projection_preview_label(),
    variant: 'default',
    description: m.projection_desc_winkel_tripel()
  },
  {
    id: 'arr-5',
    projectionId: 'aitoff',
    title: m.projection_name_aitoff(),
    subtitle: m.card_subtitle_surfaces(),
    tag: m.projection_group_rounded(),
    ratio: '2:1',
    previewLabel: m.projection_preview_label(),
    variant: 'default',
    description: m.projection_desc_aitoff()
  },
  {
    id: 'arr-6',
    projectionId: 'mollweide',
    title: m.projection_name_mollweide(),
    subtitle: m.card_subtitle_surfaces(),
    tag: m.projection_group_rounded(),
    ratio: '2:1',
    previewLabel: m.projection_preview_label(),
    variant: 'default',
    equalArea: true,
    description: m.projection_desc_mollweide()
  },
  {
    id: 'arr-7',
    projectionId: 'stereographic',
    title: m.projection_name_stereographic(),
    subtitle: m.card_subtitle_surfaces(),
    tag: m.projection_group_rounded(),
    ratio: '1:1',
    previewLabel: m.projection_preview_label(),
    variant: 'default',
    description: m.projection_desc_stereographic()
  },
  {
    id: 'arr-8',
    projectionId: 'azimuthal-equal-area',
    title: m.projection_name_azimuthal_equal_area(),
    subtitle: m.card_subtitle_surfaces(),
    tag: m.projection_group_rounded(),
    ratio: '1:1',
    previewLabel: m.projection_preview_label(),
    variant: 'default',
    equalArea: true,
    description: m.projection_desc_azimuthal_equal_area()
  }
];

export const GROUPS = [
  { id: m.tag_rectangular(), labelKey: 'projection_group_rectangular' },
  { id: m.projection_group_rounded(), labelKey: 'projection_group_rounded' },
  {
    id: m.projection_group_discontinuous(),
    labelKey: 'projection_group_discontinuous'
  }
] as const;
