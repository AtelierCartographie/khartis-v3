import type { VariableBadgeType } from '$lib/features/commons/types/variable-badge.types';

export interface GeocodeColumnItem {
  id: number;
  text: string;
  columnName: string;
  isGeo?: boolean;
  confidence?: number;
}

export interface GeocodeFieldProps {
  label: string;
  infoText?: string;
  items: GeocodeColumnItem[];
  selectedId: number | undefined;
  selectedColumnName: string | undefined;
  badgeType?: VariableBadgeType;
  placeholder?: string;
  onSelect: (id: number, columnName: string) => void;
}
