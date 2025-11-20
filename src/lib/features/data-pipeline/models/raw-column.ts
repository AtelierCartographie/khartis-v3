/**
 * Column as parsed from the source file before any type inference.
 */
export interface RawColumn {
  name: string;
  values: unknown[];
}
