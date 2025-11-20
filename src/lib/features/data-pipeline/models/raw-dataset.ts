import type { RawColumn } from './raw-column';
import type { GeometryInfo } from './geometry-info';

/**
 * Raw tabular data returned by a parser before inference and analysis.
 */
export interface RawDataset {
  headers: string[];
  rows: unknown[][];
  columns: RawColumn[];
  geometry?: GeometryInfo;
  metadata: Record<string, unknown>;
}
