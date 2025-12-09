export interface JoinEntity {
  dataValue: string;
  geoValue?: string;
  status: 'joined' | 'to_verify' | 'duplicate' | 'unrecognized';
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
