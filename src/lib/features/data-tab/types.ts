import type { VariableBadgeType } from '$lib/features/commons/types/variable-badge.types';

export interface GeocodeColumnItem {
  id: number;
  text: string;
  columnName: string;
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

import { JoinStatus } from '$lib/features/commons/constants/ui.constants';
import type { JoinCandidate } from '$lib/features/commons/types/data-tab.types';

export type { JoinCandidate };

export interface JoinEntity {
  dataValue: string;
  geoValue?: string;
  basemapValue?: string;
  status: JoinStatus;
  matches?: string[];
  matchCount?: number;
  candidates?: JoinCandidate[];
  basemapOptions?: string[];
  selectedMapping?: string;
}

export interface JoinStats {
  joinedCount: number;
  toVerifyCount: number;
  duplicateCount: number;
  unrecognizedCount: number;
  ignoredCount?: number;
  entities: JoinEntity[];
  totalEntities: number;
  duplicateLines: Array<{ dataValue: string; lines: number[] }>;
}
