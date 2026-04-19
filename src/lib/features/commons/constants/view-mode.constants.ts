export const MAP_VIEW_MODE = {
  MAPLIBRE: 'maplibre',
  ORTHOGRAPHIC: 'orthographic'
} as const;

export type MapViewModeValue =
  (typeof MAP_VIEW_MODE)[keyof typeof MAP_VIEW_MODE];

export const MAP_PROJECTION_TYPE = {
  MERCATOR: 'mercator',
  GLOBE: 'globe'
} as const;

export type MapProjectionTypeValue =
  (typeof MAP_PROJECTION_TYPE)[keyof typeof MAP_PROJECTION_TYPE];
