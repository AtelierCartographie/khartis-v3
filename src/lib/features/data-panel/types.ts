/**
 * Types for Data Panel components
 * Based on Figma Design Analysis - 2026-01-31
 */

export type StatusType = 'success' | 'warning' | 'error' | 'info';

export type NotificationKind = 'error' | 'warning' | 'info' | 'success';

export type GeocodeType = 'entities' | 'longlat';

/**
 * Mapping row for basemap merger
 */
export type MappingRow = {
  id: string;
  dataValue: string;
  basemapValue: string;
  status: StatusType;
  suggestion?: string;
};

/**
 * Entity mapping statistics
 */
export type MappingStats = {
  joinedCount: number;
  toVerifyCount: number;
  duplicateCount: number;
  unrecognizedCount: number;
};

/**
 * Column metadata for data table
 */
export type ColumnMetadata = {
  name: string;
  type: 'text' | 'numeric' | 'date' | 'geometry';
  totalRows: number;
  nullCount: number;
  duplicateCount: number;
  uniqueCount: number;
  categoryCount?: number;
  categories?: string[];
};

/**
 * Data table row
 */
export type DataTableRow = {
  id: string;
  values: Record<string, unknown>;
};

/**
 * Geocode settings for entities
 */
export type GeocodeSettingsEntities = {
  type: 'entities';
  linkedVariable: string;
  entityColumn: string;
};

/**
 * Geocode settings for longitude/latitude
 */
export type GeocodeSettingsLonLat = {
  type: 'longlat';
  longitudeColumn: string;
  latitudeColumn: string;
};

/**
 * Geocode settings union type
 */
export type GeocodeSettings = GeocodeSettingsEntities | GeocodeSettingsLonLat;

/**
 * Basemap merger error
 */
export type MappingError = {
  type: 'duplicate' | 'unrecognized' | 'ambiguous';
  dataValue: string;
  possibleMatches?: string[];
  message: string;
};

/**
 * Props for BasemapMerger component
 */
export type BasemapMergerProps = {
  mappings: MappingRow[];
  stats: MappingStats;
  errors: MappingError[];
  dataColumnName: string;
  basemapColumnName: string;
  onReplace?: () => void;
  onCorrect?: (id: string, newValue: string) => void;
};

/**
 * Props for GeocodeSettings component
 */
export type GeocodeSettingsProps = {
  type: GeocodeType;
  variables: string[];
  currentSettings?: GeocodeSettings;
  onUpdate?: (settings: GeocodeSettings) => void;
};

/**
 * Props for StatusIcon component
 */
export type StatusIconProps = {
  status: StatusType;
  size?: 'sm' | 'md' | 'lg';
  withLabel?: boolean;
};

/**
 * Props for DataTableRowItem component
 */
export type DataTableRowItemProps = {
  row: DataTableRow;
  columns: ColumnMetadata[];
  isSelected?: boolean;
  onSelect?: (id: string) => void;
};

/**
 * Props for DataPanelContent component
 */
export type DataPanelContentProps = {
  columns: ColumnMetadata[];
  rows: DataTableRow[];
  mappings?: MappingRow[];
  geocodeSettings?: GeocodeSettings;
  isExpanded?: boolean;
  onExpand?: () => void;
};

/**
 * Notification message
 */
export type NotificationMessage = {
  id: string;
  kind: NotificationKind;
  title: string;
  subtitle?: string;
  dismissible?: boolean;
};

/**
 * Helper type guards
 */
export const isEntitiesGeocode = (
  settings: GeocodeSettings
): settings is GeocodeSettingsEntities => {
  return settings.type === 'entities';
};

export const isLonLatGeocode = (
  settings: GeocodeSettings
): settings is GeocodeSettingsLonLat => {
  return settings.type === 'longlat';
};

/**
 * Constants for status types
 */
export const STATUS_TYPES = {
  SUCCESS: 'success' as const,
  WARNING: 'warning' as const,
  ERROR: 'error' as const,
  INFO: 'info' as const
};

/**
 * Constants for notification kinds
 */
export const NOTIFICATION_KINDS = {
  ERROR: 'error' as const,
  WARNING: 'warning' as const,
  INFO: 'info' as const,
  SUCCESS: 'success' as const
};

/**
 * Constants for geocode types
 */
export const GEOCODE_TYPES = {
  ENTITIES: 'entities' as const,
  LONGLAT: 'longlat' as const
};
