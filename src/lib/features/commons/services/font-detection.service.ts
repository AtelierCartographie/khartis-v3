import type { DatasetResult } from '$lib/features/data-pipeline';
import { ColumnType } from '$lib/features/data-pipeline';
import { duckDBOrchestrator } from '$lib/features/duckdb';
import {
  detectRequiredFonts,
  type RequiredFallbackFont
} from '../utils/detect-required-fonts';
import { sqlIdentifier } from '$lib/features/commons/utils/sql.utils';

const SAMPLE_SIZE = 100;

export async function detectFontsInDataset(
  dataset: DatasetResult
): Promise<Set<RequiredFallbackFont>> {
  let text = '';

  if (dataset.tableName && dataset.rowCount > 0) {
    try {
      const textColumns = dataset.columns
        .filter((c) => c.type === ColumnType.TEXT)
        .map((c) => sqlIdentifier(c.name))
        .join(', ');

      if (textColumns) {
        const result = await duckDBOrchestrator.runQuery(
          `SELECT ${textColumns} FROM ${sqlIdentifier(dataset.tableName)} LIMIT ${SAMPLE_SIZE}`
        );
        if (result && typeof result.toArray === 'function') {
          for (const row of result.toArray()) {
            for (const value of Object.values(row)) {
              if (value !== null && value !== undefined) {
                text += String(value);
              }
            }
          }
        }
      }
    } catch {
      return detectRequiredFonts(text);
    }
  }

  return detectRequiredFonts(text);
}
