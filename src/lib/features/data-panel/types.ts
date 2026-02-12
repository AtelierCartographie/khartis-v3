export type StatusType = 'success' | 'warning' | 'error' | 'info';

export type NotificationKind = 'error' | 'warning' | 'info' | 'success';

export type GeocodeType = 'entities' | 'longlat';

export type MappingRow = {
  id: string;
  dataValue: string;
  basemapValue: string;
  status: StatusType;
  suggestion?: string;
};

export type MappingStats = {
  joinedCount: number;
  toVerifyCount: number;
  duplicateCount: number;
  unrecognizedCount: number;
};

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

export type DataTableRow = {
  id: string;
  values: Record<string, unknown>;
};

export type GeocodeSettingsEntities = {
  type: 'entities';
  linkedVariable: string;
  entityColumn: string;
};

export type GeocodeSettingsLonLat = {
  type: 'longlat';
  longitudeColumn: string;
  latitudeColumn: string;
};

export type GeocodeSettings = GeocodeSettingsEntities | GeocodeSettingsLonLat;

export type MappingError = {
  type: 'duplicate' | 'unrecognized' | 'ambiguous';
  dataValue: string;
  possibleMatches?: string[];
  message: string;
};

export type BasemapMergerProps = {
  mappings: MappingRow[];
  stats: MappingStats;
  errors: MappingError[];
  dataColumnName: string;
  basemapColumnName: string;
  onReplace?: () => void;
  onCorrect?: (id: string, newValue: string) => void;
};

export type GeocodeSettingsProps = {
  type: GeocodeType;
  variables: string[];
  currentSettings?: GeocodeSettings;
  onUpdate?: (settings: GeocodeSettings) => void;
};

export type StatusIconProps = {
  status: StatusType;
  size?: 'sm' | 'md' | 'lg';
  withLabel?: boolean;
};

export type DataTableRowItemProps = {
  row: DataTableRow;
  columns: ColumnMetadata[];
  isSelected?: boolean;
  onSelect?: (id: string) => void;
};

export type DataPanelContentProps = {
  columns: ColumnMetadata[];
  rows: DataTableRow[];
  mappings?: MappingRow[];
  geocodeSettings?: GeocodeSettings;
  isExpanded?: boolean;
  onExpand?: () => void;
};

export type NotificationMessage = {
  id: string;
  kind: NotificationKind;
  title: string;
  subtitle?: string;
  dismissible?: boolean;
};

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

export const STATUS_TYPES = {
  SUCCESS: 'success' as const,
  WARNING: 'warning' as const,
  ERROR: 'error' as const,
  INFO: 'info' as const
};

export const NOTIFICATION_KINDS = {
  ERROR: 'error' as const,
  WARNING: 'warning' as const,
  INFO: 'info' as const,
  SUCCESS: 'success' as const
};

export const GEOCODE_TYPES = {
  ENTITIES: 'entities' as const,
  LONGLAT: 'longlat' as const
};
