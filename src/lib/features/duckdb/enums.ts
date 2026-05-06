export enum DuckDBSimplifiedType {
  NUMERIC = 'numeric',
  BOOLEAN = 'boolean',
  DATE = 'date',
  STRING = 'string',
  GEOMETRY = 'geometry',
  OTHER = 'other'
}

export enum QueryFormatEnum {
  ARROW_TABLE = 'arrow-table',
  ARROW_IPC = 'arrow-ipc',
  ARRAY = 'array'
}

export enum FilterOperatorEnum {
  GTE = 'gte',
  LTE = 'lte',
  CONTAINS = 'contains',
  EQUALS = 'equals',
  NOT_EQUALS = 'not_equals',
  BETWEEN = 'between',
  TOP_ASC = 'top_asc',
  TOP_DESC = 'top_desc',
  EMPTY = 'empty',
  NOT_EMPTY = 'not_empty'
}

export enum RefineOperation {
  UPPERCASE = 'uppercase',
  LOWERCASE = 'lowercase',
  TITLECASE = 'titlecase',
  TRIM = 'trim',
  TRIM_ALL = 'trim_all'
}

export type QueryFormat = `${QueryFormatEnum}`;
export type FilterOperator = `${FilterOperatorEnum}`;
