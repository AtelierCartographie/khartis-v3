import type { DatasetResult } from '$lib/features/data-pipeline';
import { ColumnType } from '$lib/features/data-pipeline';
import { duckDBOrchestrator } from '$lib/features/duckdb';
import { escapeIdentifier } from '$lib/features/commons/utils/sanitize.utils';
import {
  detectRequiredFonts,
  type RequiredFallbackFont
} from '../utils/detect-required-fonts';

const SAMPLE_SIZE = 100;

export async function detectFontsInDataset(
  dataset: DatasetResult
): Promise<Set<RequiredFallbackFont>> {
  let text = '';

  if (dataset.data) {
    for (const row of dataset.data.slice(0, SAMPLE_SIZE)) {
      for (const value of Object.values(row)) {
        if (typeof value === 'string') {
          text += value;
        }
      }
    }
  }

  if (dataset.originalData?.data) {
    for (const row of dataset.originalData.data.slice(0, SAMPLE_SIZE)) {
      for (const value of Object.values(row)) {
        if (typeof value === 'string') {
          text += value;
        }
      }
    }
  }

  if (!text && dataset.tableName && dataset.rowCount > 0) {
    try {
      const textColumns = dataset.columns
        .filter(
          (c) => c.type === ColumnType.TEXT || c.type === ColumnType.GEOMETRY
        )
        .map((c) => `"${escapeIdentifier(c.name)}"`)
        .join(', ');

      if (textColumns) {
        const result = await duckDBOrchestrator.runQuery(
          `SELECT ${textColumns} FROM "${escapeIdentifier(dataset.tableName)}" LIMIT ${SAMPLE_SIZE}`
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
