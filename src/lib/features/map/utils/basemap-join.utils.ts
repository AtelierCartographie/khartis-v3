import type { JoinQuality, JoinEntity } from '../types/basemap.types';
import { Duck } from '../../commons/services/duckdb/duckdb';
import { logger, LogCategory } from '../../commons/utils/logger';

export async function analyzeJoinQuality(
  dataTableName: string,
  dataColumnName: string,
  basemapTableName: string,
  basemapColumnName: string
): Promise<JoinQuality> {
  if (!Duck) {
    throw new Error('DuckDB not initialized');
  }

  try {
    logger.info('Analyzing join quality', LogCategory.DATA);

    const totalCountResult: any = await Duck.query(`
      SELECT COUNT(*) as count
      FROM ${dataTableName}
    `);

    const totalEntities =
      totalCountResult &&
      Array.isArray(totalCountResult) &&
      totalCountResult.length > 0
        ? Number(totalCountResult[0].count)
        : 0;

    const joinedResult: any = await Duck.query(`
      SELECT DISTINCT d.${dataColumnName} as data_value
      FROM ${dataTableName} d
      INNER JOIN ${basemapTableName} b
      ON LOWER(TRIM(d.${dataColumnName})) = LOWER(TRIM(b.${basemapColumnName}))
    `);

    const joinedValues = new Set(
      joinedResult && Array.isArray(joinedResult)
        ? joinedResult.map((r: any) => String(r.data_value))
        : []
    );

    const duplicatesResult: any = await Duck.query(`
      SELECT
        d.${dataColumnName} as data_value,
        COUNT(*) as match_count
      FROM ${dataTableName} d
      INNER JOIN ${basemapTableName} b
      ON LOWER(TRIM(d.${dataColumnName})) = LOWER(TRIM(b.${basemapColumnName}))
      GROUP BY d.${dataColumnName}
      HAVING COUNT(*) > 1
    `);

    const duplicates =
      duplicatesResult && Array.isArray(duplicatesResult)
        ? duplicatesResult.map((r: any) => ({
            dataValue: String(r.data_value),
            matchCount: Number(r.match_count)
          }))
        : [];

    const unrecognizedResult: any = await Duck.query(`
      SELECT DISTINCT d.${dataColumnName} as data_value
      FROM ${dataTableName} d
      LEFT JOIN ${basemapTableName} b
      ON LOWER(TRIM(d.${dataColumnName})) = LOWER(TRIM(b.${basemapColumnName}))
      WHERE b.${basemapColumnName} IS NULL
    `);

    const unrecognized =
      unrecognizedResult && Array.isArray(unrecognizedResult)
        ? unrecognizedResult.map((r: any) => String(r.data_value))
        : [];

    const entities: JoinEntity[] = [];

    for (const value of joinedValues) {
      const duplicate = duplicates.find((d) => d.dataValue === value);
      if (duplicate) {
        entities.push({
          dataValue: value,
          status: 'duplicate',
          matchCount: duplicate.matchCount
        });
      } else {
        entities.push({
          dataValue: value,
          status: 'joined'
        });
      }
    }

    for (const value of unrecognized) {
      const similarMatches = await findSimilarMatches(
        value,
        basemapTableName,
        basemapColumnName
      );

      if (similarMatches.length > 0) {
        entities.push({
          dataValue: value,
          status: 'to_verify',
          matches: similarMatches
        });
      } else {
        entities.push({
          dataValue: value,
          status: 'unrecognized'
        });
      }
    }

    const quality: JoinQuality = {
      joinedCount: entities.filter((e) => e.status === 'joined').length,
      toVerifyCount: entities.filter((e) => e.status === 'to_verify').length,
      duplicateCount: entities.filter((e) => e.status === 'duplicate').length,
      unrecognizedCount: entities.filter((e) => e.status === 'unrecognized')
        .length,
      entities,
      totalEntities
    };

    logger.success(
      `Join analysis complete: ${quality.joinedCount}/${totalEntities} joined`,
      LogCategory.DATA
    );

    return quality;
  } catch (error) {
    logger.error('Failed to analyze join quality', LogCategory.DATA, error);
    throw error;
  }
}

async function findSimilarMatches(
  value: string,
  basemapTableName: string,
  basemapColumnName: string
): Promise<string[]> {
  if (!Duck) {
    return [];
  }

  try {
    const result: any = await Duck.query(`
      SELECT ${basemapColumnName}
      FROM ${basemapTableName}
      WHERE LOWER(${basemapColumnName}) LIKE '%' || LOWER('${value}') || '%'
         OR LOWER('${value}') LIKE '%' || LOWER(${basemapColumnName}) || '%'
      LIMIT 3
    `);

    return result && Array.isArray(result)
      ? result.map((r: any) => String(r[basemapColumnName]))
      : [];
  } catch (error) {
    logger.warn('Failed to find similar matches', LogCategory.DATA, error);
    return [];
  }
}

export function calculateJoinScore(quality: JoinQuality): number {
  if (quality.totalEntities === 0) return 0;

  const joinedRatio = quality.joinedCount / quality.totalEntities;
  const toVerifyRatio = quality.toVerifyCount / quality.totalEntities;
  const unrecognizedRatio = quality.unrecognizedCount / quality.totalEntities;
  const duplicateRatio = quality.duplicateCount / quality.totalEntities;

  const score =
    joinedRatio * 100 +
    toVerifyRatio * 50 -
    unrecognizedRatio * 20 -
    duplicateRatio * 30;

  return Math.max(0, Math.min(100, score));
}

export function getJoinQualityLabel(quality: JoinQuality): string {
  const score = calculateJoinScore(quality);

  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Bon';
  if (score >= 50) return 'Moyen';
  if (score >= 25) return 'Faible';
  return 'Très faible';
}
