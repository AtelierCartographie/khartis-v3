import { JoinStatus } from '$lib/features/commons/constants/ui.constants';

export interface JoinEntity {
  dataValue: string;
  geoValue?: string;
  basemapValue?: string;
  status: JoinStatus;
  matches?: string[];
  matchCount?: number;
  basemapOptions?: string[];
  selectedMapping?: string;
}

export interface JoinStats {
  joinedCount: number;
  toVerifyCount: number;
  duplicateCount: number;
  unrecognizedCount: number;
  entities: JoinEntity[];
  totalEntities: number;
  duplicateLines: Array<{ dataValue: string; lines: number[] }>;
}
