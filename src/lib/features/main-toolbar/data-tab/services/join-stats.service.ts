import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { Duck } from '$lib/features/duckdb';
import type { JoinEntity, JoinStats } from '../components';

export interface ComputeJoinStatsOptions {
  sourceTableName: string;
  sourceColumn: string;
  targetTableName: string;
  targetColumn: string;
}

function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

export async function computeDatasetJoinStats(
  options: ComputeJoinStatsOptions
): Promise<JoinStats> {
  const { sourceTableName, sourceColumn, targetTableName, targetColumn } =
    options;

  logger.info('Computing dataset join stats', LogCategory.DATA, {
    sourceTableName,
    sourceColumn,
    targetTableName,
    targetColumn
  });

  const sourceValues = (await Duck.query(
    `SELECT DISTINCT CAST("${sourceColumn}" AS VARCHAR) as val FROM "${sourceTableName}" WHERE "${sourceColumn}" IS NOT NULL`,
    { format: 'array' }
  )) as Array<{ val: string }>;

  const targetValues = (await Duck.query(
    `SELECT DISTINCT CAST("${targetColumn}" AS VARCHAR) as val FROM "${targetTableName}" WHERE "${targetColumn}" IS NOT NULL`,
    { format: 'array' }
  )) as Array<{ val: string }>;

  const targetSet = new Set(
    targetValues.map((v) => v.val?.toLowerCase?.() || '')
  );

  const entities: JoinEntity[] = [];
  const duplicateCheck: globalThis.Map<string, number> = new globalThis.Map();

  for (const row of sourceValues) {
    const val = row.val;
    const normalizedVal = val?.toLowerCase?.() || '';
    duplicateCheck.set(
      normalizedVal,
      (duplicateCheck.get(normalizedVal) || 0) + 1
    );
  }

  for (const row of sourceValues) {
    const val = row.val;
    const normalizedVal = val?.toLowerCase?.() || '';

    if (duplicateCheck.get(normalizedVal)! > 1) {
      entities.push({
        dataValue: val,
        status: 'duplicate'
      });
    } else if (targetSet.has(normalizedVal)) {
      entities.push({
        dataValue: val,
        geoValue: val,
        status: 'joined'
      });
    } else {
      const possibleMatches = targetValues
        .filter((t) => {
          const tNorm = t.val?.toLowerCase?.() || '';
          return (
            tNorm.includes(normalizedVal) ||
            normalizedVal.includes(tNorm) ||
            levenshteinDistance(normalizedVal, tNorm) <= 2
          );
        })
        .map((t) => t.val);

      if (possibleMatches.length > 0) {
        entities.push({
          dataValue: val,
          status: 'to_verify',
          matches: possibleMatches.slice(0, 5)
        });
      } else {
        entities.push({
          dataValue: val,
          status: 'unrecognized'
        });
      }
    }
  }

  const stats: JoinStats = {
    joinedCount: entities.filter((e) => e.status === 'joined').length,
    toVerifyCount: entities.filter((e) => e.status === 'to_verify').length,
    duplicateCount: entities.filter((e) => e.status === 'duplicate').length,
    unrecognizedCount: entities.filter((e) => e.status === 'unrecognized')
      .length,
    entities
  };

  logger.success('Dataset join stats computed', LogCategory.DATA, {
    joinedCount: stats.joinedCount,
    toVerifyCount: stats.toVerifyCount,
    duplicateCount: stats.duplicateCount,
    unrecognizedCount: stats.unrecognizedCount
  });

  return stats;
}
