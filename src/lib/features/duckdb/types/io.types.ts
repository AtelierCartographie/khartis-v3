export interface FileWithId extends File {
  id: string;
}

export interface ReadTabularOptions {
  tablename?: string;
  decimal_separator?: string;
  thousands_separator?: string;
  delimiter?: string;
  header?: boolean;
  ignore_errors?: boolean;
  all_varchar?: boolean;
  format?: string;
  /** Warns about lines `ignore_errors` drops; off for replays of a known file. */
  report_skipped_lines?: boolean;
}

export interface ReadGeofileOptions {
  tablename?: string;
  meta?: boolean;
  shapefile?: boolean;
  layer?: string;
}

export interface RegisterFilesOptions {
  shapefile?: boolean;
}

export interface AnalyseOptions {
  force?: boolean;
}
