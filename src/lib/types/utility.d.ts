export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;
export type JsonObject = { [key: string]: JsonValue };
export type JsonArray = JsonValue[];

export type DataRecord = Record<string, JsonValue>;
export type DataRow = DataRecord;
export type DataTable = DataRow[];

export type GeoJSONProperties = Record<string, JsonValue>;
export type GeoJSONCoordinates = number[] | number[][] | number[][][];

export type DuckDBValue = string | number | boolean | null | Date;
export type DuckDBRow = Record<string, DuckDBValue>;
export type DuckDBTable = DuckDBRow[];

export type UnknownRecord = Record<string, unknown>;
export type UnknownObject = { [key: string]: unknown };
