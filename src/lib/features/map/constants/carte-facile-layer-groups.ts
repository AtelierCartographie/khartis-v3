export type LayerGroupId =
  | 'background'
  | 'aerial'
  | 'landcover'
  | 'hydro'
  | 'buildings'
  | 'streets'
  | 'boundaries'
  | 'labels'
  | 'other'
  | 'admin_boundaries'
  | 'cadastre';

export interface LayerGroupDefinition {
  id: LayerGroupId;
  defaultVisible: boolean;
  showInUI: boolean;
}

export type ZoneId = 'france' | 'monde';

export type StyleVariantId = 'couleurs' | 'niveaux-de-gris' | 'satellite';

export interface StyleConfig {
  id: string;
  zone: ZoneId;
  style: StyleVariantId;
  groups: LayerGroupDefinition[];
}

const BACKGROUND: LayerGroupDefinition = {
  id: 'background',
  defaultVisible: true,
  showInUI: false
};

const AERIAL: LayerGroupDefinition = {
  id: 'aerial',
  defaultVisible: true,
  showInUI: false
};

const LANDCOVER: LayerGroupDefinition = {
  id: 'landcover',
  defaultVisible: true,
  showInUI: true
};

const HYDRO: LayerGroupDefinition = {
  id: 'hydro',
  defaultVisible: true,
  showInUI: true
};

const BUILDINGS: LayerGroupDefinition = {
  id: 'buildings',
  defaultVisible: true,
  showInUI: true
};

const STREETS: LayerGroupDefinition = {
  id: 'streets',
  defaultVisible: true,
  showInUI: true
};

const BOUNDARIES: LayerGroupDefinition = {
  id: 'boundaries',
  defaultVisible: true,
  showInUI: true
};

const LABELS: LayerGroupDefinition = {
  id: 'labels',
  defaultVisible: true,
  showInUI: true
};

const OTHER: LayerGroupDefinition = {
  id: 'other',
  defaultVisible: true,
  showInUI: false
};

const ADMIN_BOUNDARIES: LayerGroupDefinition = {
  id: 'admin_boundaries',
  defaultVisible: false,
  showInUI: true
};

const CADASTRE: LayerGroupDefinition = {
  id: 'cadastre',
  defaultVisible: false,
  showInUI: true
};

export const STYLE_CONFIGS: StyleConfig[] = [
  {
    id: 'france-couleurs',
    zone: 'france',
    style: 'couleurs',
    groups: [
      BACKGROUND,
      LANDCOVER,
      HYDRO,
      BUILDINGS,
      STREETS,
      BOUNDARIES,
      LABELS,
      OTHER,
      ADMIN_BOUNDARIES,
      CADASTRE
    ]
  },
  {
    id: 'france-niveaux-de-gris',
    zone: 'france',
    style: 'niveaux-de-gris',
    groups: [
      BACKGROUND,
      LANDCOVER,
      HYDRO,
      BUILDINGS,
      STREETS,
      BOUNDARIES,
      LABELS,
      OTHER,
      ADMIN_BOUNDARIES,
      CADASTRE
    ]
  },
  {
    id: 'france-satellite',
    zone: 'france',
    style: 'satellite',
    groups: [BACKGROUND, AERIAL, STREETS, LABELS, ADMIN_BOUNDARIES, CADASTRE]
  },

  {
    id: 'monde-couleurs',
    zone: 'monde',
    style: 'couleurs',
    groups: [
      BACKGROUND,
      LANDCOVER,
      HYDRO,
      BUILDINGS,
      STREETS,
      BOUNDARIES,
      LABELS
    ]
  },
  {
    id: 'monde-niveaux-de-gris',
    zone: 'monde',
    style: 'niveaux-de-gris',
    groups: [
      BACKGROUND,
      LANDCOVER,
      HYDRO,
      BUILDINGS,
      STREETS,
      BOUNDARIES,
      LABELS
    ]
  },
  {
    id: 'monde-satellite',
    zone: 'monde',
    style: 'satellite',
    groups: [BACKGROUND, AERIAL, STREETS, LABELS]
  }
];

export const ZONES: { id: ZoneId }[] = [{ id: 'monde' }, { id: 'france' }];

export function getStylesForZone(zone: ZoneId): StyleConfig[] {
  return STYLE_CONFIGS.filter((s) => s.zone === zone);
}

export function getStyleConfig(id: string): StyleConfig | undefined {
  return STYLE_CONFIGS.find((s) => s.id === id);
}

export function getToggleableGroups(
  config: StyleConfig
): LayerGroupDefinition[] {
  return config.groups.filter((g) => g.showInUI);
}

export function getDefaultVisibility(
  config: StyleConfig
): Record<LayerGroupId, boolean> {
  const result = {} as Record<LayerGroupId, boolean>;
  for (const g of config.groups) {
    result[g.id] = g.defaultVisible;
  }
  return result;
}
