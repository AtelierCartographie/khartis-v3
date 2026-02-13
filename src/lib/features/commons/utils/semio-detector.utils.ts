import type { AnalysisResult } from '$lib/features/duckdb';

export type SemioType =
  | 'geoid'
  | 'geolat'
  | 'geolon'
  | 'QTA'
  | 'QTR'
  | 'QL'
  | 'QLO';

export interface SemioDetectionResult {
  semioType: SemioType;
  semioScore: number;
}

export const SEMIO_TYPES = {
  GEOID: 'geoid' as const,
  GEOLAT: 'geolat' as const,
  GEOLON: 'geolon' as const,
  QTA: 'QTA' as const,
  QTR: 'QTR' as const,
  QL: 'QL' as const,
  QLO: 'QLO' as const
};

interface SemioScore {
  semioType: SemioType;
  score: number;
}

interface GeoIdIndicators {
  shareUniques: number;
  shareNulls: number;
  idWords: boolean;
}

interface GeoLatIndicators {
  latWords: boolean;
  min: number;
  max: number;
}

interface GeoLonIndicators {
  lonWords: boolean;
  min: number;
  max: number;
}

interface QTAIndicators {
  uniqueCount: number;
  extentMagnitude: number;
  shareIntegers: number;
  shareRankInterval: number;
}

interface QTRIndicators {
  ratioWords: boolean;
  extentMagnitude: number;
  min: number;
  max: number;
  shareFloats: number;
}

interface QLIndicators {
  shareUniques: number;
  uniqueCount: number;
}

interface QLOIndicators {
  rankWords: boolean;
  shareRankInterval: number;
}

function scoreGeoId(indicators: GeoIdIndicators): SemioScore {
  let score = 0;
  if (indicators.shareUniques >= 0.9) score += 1;
  if (indicators.shareNulls <= 0.1) score += 1.5;
  if (indicators.idWords && indicators.shareUniques >= 0.5) score += 4;
  return { semioType: SEMIO_TYPES.GEOID, score };
}

function scoreGeoLat(indicators: GeoLatIndicators): SemioScore {
  let score = 0;
  if (indicators.latWords) score += 4;
  if (Math.abs(indicators.min) < 90 && Math.abs(indicators.max) < 90)
    score += 2;
  return { semioType: SEMIO_TYPES.GEOLAT, score };
}

function scoreGeoLon(indicators: GeoLonIndicators): SemioScore {
  let score = 0;
  if (indicators.lonWords) score += 4;
  if (Math.abs(indicators.min) < 180 && Math.abs(indicators.max) < 180)
    score += 2;
  return { semioType: SEMIO_TYPES.GEOLON, score };
}

function scoreQTA(indicators: QTAIndicators): SemioScore {
  let score = 0;
  if (indicators.shareIntegers >= 0.7) score += 1;
  if (indicators.shareIntegers >= 0.9) score += 1;
  if (indicators.shareRankInterval <= 0.1) score += 1;
  if (indicators.extentMagnitude >= 2) score += 1;
  return { semioType: SEMIO_TYPES.QTA, score };
}

function scoreQTR(indicators: QTRIndicators): SemioScore {
  let score = 0;
  if (indicators.shareFloats >= 0.7) score += 1;
  if (indicators.shareFloats >= 0.9) score += 1;
  if (indicators.ratioWords) score += 3;
  if (indicators.extentMagnitude <= 2) score += 1;
  if (indicators.min < 0 && indicators.max > 0) score += 0.5;
  return { semioType: SEMIO_TYPES.QTR, score };
}

function scoreQL(indicators: QLIndicators): SemioScore {
  let score = 0;
  if (indicators.shareUniques <= 0.2) score += 2;
  if (indicators.uniqueCount <= 10) score += 1;
  return { semioType: SEMIO_TYPES.QL, score };
}

function scoreQLO(indicators: QLOIndicators): SemioScore {
  let score = 0;
  if (indicators.rankWords) score += 4;
  if (indicators.shareRankInterval >= 0.8) score += 2;
  return { semioType: SEMIO_TYPES.QLO, score };
}

function detectKeywordsFromName(columnName: string): {
  idWords: boolean;
  latWords: boolean;
  lonWords: boolean;
  ratioWords: boolean;
  rankWords: boolean;
} {
  const lowerName = columnName.toLowerCase();
  const nameParts = lowerName.split(/[^a-zA-Z0-9%]/);

  return {
    idWords: nameParts.some((p) => ['id', 'code', 'iso'].includes(p)),
    latWords: nameParts.some((p) => ['lat', 'latitude'].includes(p)),
    lonWords: nameParts.some((p) => ['lon', 'lng', 'longitude'].includes(p)),
    ratioWords: nameParts.some((p) =>
      ['ratio', 'rate', 'percent', 'pct', '%', 'pour', 'taux'].includes(p)
    ),
    rankWords: nameParts.some((p) =>
      ['rank', 'order', 'niveau', 'level'].includes(p)
    )
  };
}

export function detectSemioType(
  analysis: AnalysisResult
): SemioDetectionResult {
  const results: SemioScore[] = [];

  const columnName = analysis.name ?? '';
  const typeSimple = analysis.type_simple ?? 'string';

  const totalCount = (analysis.count as number) ?? 0;
  const uniqueCount = (analysis.uniques as number) ?? 0;
  const nullCount = (analysis.nulls as number) ?? 0;

  const shareUniques =
    (analysis.share_uniques as number) ??
    (totalCount > 0 ? uniqueCount / totalCount : 0);
  const shareNulls =
    (analysis.share_nulls as number) ??
    (totalCount > 0 ? nullCount / totalCount : 0);

  const min = typeof analysis.min === 'number' ? analysis.min : 0;
  const max = typeof analysis.max === 'number' ? analysis.max : 0;

  const keywords =
    analysis.id_words !== undefined
      ? {
          idWords: Boolean(analysis.id_words),
          latWords: Boolean(analysis.lat_words),
          lonWords: Boolean(analysis.lon_words),
          ratioWords: Boolean(analysis.ratio_words),
          rankWords: Boolean(analysis.rank_words)
        }
      : detectKeywordsFromName(columnName);

  const extentMagnitude =
    (analysis.extent_magnitude as number) ??
    (max > 0 ? Math.log10(max / Math.max(min, 1)) : 0);

  const shareIntegers = (analysis.share_integers as number) ?? 0;
  const shareFloats = (analysis.share_floats as number) ?? 0;
  const shareRankInterval = (analysis.share_rank_interval as number) ?? 0;

  switch (typeSimple) {
    case 'numeric':
      results.push(
        scoreQTA({ uniqueCount, extentMagnitude, shareIntegers, shareRankInterval }),
        scoreQTR({
          ratioWords: keywords.ratioWords,
          extentMagnitude,
          min,
          max,
          shareFloats
        }),
        scoreQL({ shareUniques, uniqueCount }),
        scoreQLO({ rankWords: keywords.rankWords, shareRankInterval }),
        scoreGeoId({
          shareUniques,
          shareNulls,
          idWords: keywords.idWords
        }),
        scoreGeoLat({ latWords: keywords.latWords, min, max }),
        scoreGeoLon({ lonWords: keywords.lonWords, min, max })
      );
      break;

    case 'date':
      results.push({
        semioType: uniqueCount <= 10 ? SEMIO_TYPES.QL : SEMIO_TYPES.QTR,
        score: 2
      });
      break;

    case 'string':
    default:
      results.push(
        scoreQL({ shareUniques, uniqueCount }),
        scoreQLO({ rankWords: keywords.rankWords, shareRankInterval }),
        scoreGeoId({
          shareUniques,
          shareNulls,
          idWords: keywords.idWords
        })
      );
      break;
  }

  const best = results.sort((a, b) => b.score - a.score)[0];

  if (best.semioType === SEMIO_TYPES.QL && uniqueCount === 1) {
    best.score = 0;
  }

  return {
    semioType: best.semioType,
    semioScore: best.score
  };
}
