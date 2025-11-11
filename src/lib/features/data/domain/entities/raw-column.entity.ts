/**
 * Raw column entity
 *
 * Represents a column as parsed from source file (before type inference).
 * Values are kept as unknown[] - type inference happens later.
 *
 * @example
 * ```typescript
 * const column: RawColumn = {
 *   name: 'population',
 *   values: ['1000', '2000', '3000'] // Still strings after parsing
 * };
 * ```
 */
export interface RawColumn {
  /**
   * Column name (from header)
   */
  name: string;

  /**
   * Raw values (before type conversion)
   */
  values: unknown[];
}
