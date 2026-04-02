/**
 * Définition des groupes de calques pour chaque combinaison zone × style.
 *
 * La résolution « calque → groupe » se fait par la métadonnée
 * `metadata["cartefacile:group"]` présente dans chaque calque des JSON
 * de style. Ce fichier n'a donc pas besoin de connaître les identifiants
 * individuels des calques.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

/** Identifiant d'un groupe de calques (valeur de metadata["cartefacile:group"]) */
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

/** Décrit un groupe de calques pour l'UI */
export interface LayerGroupDefinition {
  /** Identifiant technique (= valeur de cartefacile:group dans le JSON) */
  id: LayerGroupId;
  /** Visible par défaut au chargement ? */
  defaultVisible: boolean;
  /** Affiché dans l'UI (toggle) ? false = toujours affiché, pas de toggle */
  showInUI: boolean;
}

/** Zones géographiques */
export type ZoneId = 'france' | 'monde';

/** Styles de rendu */
export type StyleVariantId = 'couleurs' | 'niveaux-de-gris' | 'satellite';

/** Configuration complète d'un style (zone + variante) */
export interface StyleConfig {
  /** Identifiant unique (ex: "france-couleurs"), correspond à BasemapStyle enum value */
  id: string;
  /** Zone géographique */
  zone: ZoneId;
  /** Style de rendu */
  style: StyleVariantId;
  /** Groupes de calques disponibles pour ce style, dans l'ordre d'affichage */
  groups: LayerGroupDefinition[];
}

// ─── Groupes de calques partagés ────────────────────────────────────────────

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

// ─── Configuration des 6 styles ─────────────────────────────────────────────

export const STYLE_CONFIGS: StyleConfig[] = [
  // ── France ──────────────────────────────────────────────
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

  // ── Monde ───────────────────────────────────────────────
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

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Zones disponibles */
export const ZONES: { id: ZoneId }[] = [{ id: 'france' }, { id: 'monde' }];

/** Styles disponibles pour une zone */
export function getStylesForZone(zone: ZoneId): StyleConfig[] {
  return STYLE_CONFIGS.filter((s) => s.zone === zone);
}

/** Récupère un style par son identifiant composite */
export function getStyleConfig(id: string): StyleConfig | undefined {
  return STYLE_CONFIGS.find((s) => s.id === id);
}

/** Groupes affichés dans l'UI (avec toggle) pour un style donné */
export function getToggleableGroups(
  config: StyleConfig
): LayerGroupDefinition[] {
  return config.groups.filter((g) => g.showInUI);
}

/** État de visibilité par défaut pour un style donné */
export function getDefaultVisibility(
  config: StyleConfig
): Record<LayerGroupId, boolean> {
  const result = {} as Record<LayerGroupId, boolean>;
  for (const g of config.groups) {
    result[g.id] = g.defaultVisible;
  }
  return result;
}
