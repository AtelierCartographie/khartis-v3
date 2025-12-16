import { JoinStatus } from '$lib/features/commons/constants/ui.constants';

export interface JoinEntity {
  dataValue: string;
  geoValue?: string;
  status: JoinStatus;
  matches?: string[];
  basemapOptions?: string[];
  selectedMapping?: string;
}

export interface JoinStats {
  joinedCount: number;
  toVerifyCount: number;
  duplicateCount: number;
  unrecognizedCount: number;
  entities: JoinEntity[];
}
