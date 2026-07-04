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
}

export interface ReadGeofileOptions {
  tablename?: string;
  meta?: boolean;
  shapefile?: boolean;
  layer?: string;
}

export interface ReadLinkOptions {
  tablename?: string;
  decimal_separator?: string;
}

export interface RegisterFilesOptions {
  shapefile?: boolean;
}

export interface AnalyseOptions {
  force?: boolean;
}
