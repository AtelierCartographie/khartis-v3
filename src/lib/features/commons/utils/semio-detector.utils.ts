import {
  DuckDBSimplifiedType,
  type AnalysisResult
} from '$lib/features/duckdb';

export type SemioType =
  | 'geoid'
  | 'geolat'
  | 'geolon'
  | 'label'
  | 'QTA'
  | 'QTR'
  | 'QL'
  | 'QLO';

const YEAR_RANGE = { MIN: 1200, MAX: 2100 } as const;

const TYPE_MAX_SCORE: Record<SemioType, number> = {
  geoid: 6.5,
  geolat: 6,
  geolon: 6,
  label: 5,
  QTA: 7.5,
  QTR: 6.5,
  QL: 3,
  QLO: 7
};

const DATE_FIXED_SCORE = 0.5;

export function toStatNumber(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'bigint') return Number(value);
  return undefined;
}

export interface SemioDetectionResult {
  semioType: SemioType;
  semioScore: number;
  runnerUp?: {
    semioType: SemioType;
    semioScore: number;
  };
}

export const SEMIO_TYPES = {
  GEOID: 'geoid' as const,
  GEOLAT: 'geolat' as const,
  GEOLON: 'geolon' as const,
  LABEL: 'label' as const,
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
  shareRankInterval: number;
  isNumeric: boolean;
}

interface GeoLatIndicators {
  latWords: boolean;
  coordWord: boolean;
  min: number;
  max: number;
}

interface GeoLonIndicators {
  lonWords: boolean;
  coordWord: boolean;
  min: number;
  max: number;
}

interface QTAIndicators {
  uniqueCount: number;
  extentMagnitude: number;
  shareIntegers: number;
  shareRankInterval: number;
  stockWords: boolean;
  skewness: number | undefined;
}

interface QTRIndicators {
  ratioWords: boolean;
  extentMagnitude: number;
  min: number;
  max: number;
  shareFloats: number;
  skewness: number | undefined;
}

interface QLIndicators {
  shareUniques: number;
  uniqueCount: number;
  isNumeric: boolean;
  ordinalCategories: boolean;
}

interface QLOIndicators {
  rankWords: boolean;
  shareRankInterval: number;
  yearLikely: boolean;
  ordinalCategories: boolean;
  likertLikely: boolean;
}

interface LabelIndicators {
  labelWords: boolean;
  idWords: boolean;
  shareUniques: number;
  uniqueCount: number;
}

function scoreGeoId(indicators: GeoIdIndicators): SemioScore {
  let score = 0;
  if (indicators.shareUniques >= 0.9) score += indicators.isNumeric ? 0.5 : 1;
  if (indicators.shareNulls <= 0.1) score += indicators.isNumeric ? 0.5 : 1.5;
  if (indicators.idWords) {
    score += indicators.shareUniques >= 0.5 ? 4 : 3.5;
  }
  if (indicators.isNumeric && indicators.shareRankInterval >= 0.8) score += 2;
  if (indicators.isNumeric && indicators.shareRankInterval >= 0.95)
    score += 0.5;
  return { semioType: SEMIO_TYPES.GEOID, score: Math.min(score, 6.5) };
}

function scoreGeoLat(indicators: GeoLatIndicators): SemioScore {
  if (!indicators.latWords && !indicators.coordWord) {
    return { semioType: SEMIO_TYPES.GEOLAT, score: 0 };
  }
  if (Math.abs(indicators.min) > 90 || Math.abs(indicators.max) > 90) {
    return { semioType: SEMIO_TYPES.GEOLAT, score: 0 };
  }

  return {
    semioType: SEMIO_TYPES.GEOLAT,
    score: (indicators.latWords ? 4 : 2) + 2
  };
}

function scoreGeoLon(indicators: GeoLonIndicators): SemioScore {
  if (!indicators.lonWords && !indicators.coordWord) {
    return { semioType: SEMIO_TYPES.GEOLON, score: 0 };
  }
  if (Math.abs(indicators.min) > 180 || Math.abs(indicators.max) > 180) {
    return { semioType: SEMIO_TYPES.GEOLON, score: 0 };
  }

  return {
    semioType: SEMIO_TYPES.GEOLON,
    score: (indicators.lonWords ? 4 : 2) + 2
  };
}

function scoreQTA(indicators: QTAIndicators): SemioScore {
  let score = 0;
  if (indicators.shareIntegers >= 0.7) score += 1;
  if (indicators.shareIntegers >= 0.9) score += 1;
  if (indicators.shareRankInterval <= 0.1) score += 1;
  if (indicators.extentMagnitude >= 2) score += 1;
  if (indicators.stockWords) score += 2.5;
  if (indicators.skewness !== undefined && indicators.skewness >= 2) score += 1;
  return { semioType: SEMIO_TYPES.QTA, score };
}

function scoreQTR(indicators: QTRIndicators): SemioScore {
  let score = 0;
  if (indicators.shareFloats >= 0.7) score += 1;
  if (indicators.shareFloats >= 0.9) score += 1;
  if (indicators.ratioWords) score += 3;
  if (indicators.extentMagnitude <= 2) score += 0.5;
  if (indicators.min < 0 && indicators.max > 0) score += 0.5;
  if (indicators.min >= 0 && indicators.max <= 100) score += 0.5;
  if (indicators.skewness !== undefined && Math.abs(indicators.skewness) <= 1)
    score += 0.5;
  return { semioType: SEMIO_TYPES.QTR, score };
}

function scoreQL(indicators: QLIndicators): SemioScore {
  let score = 0;
  if (indicators.shareUniques <= 0.2) score += indicators.isNumeric ? 1 : 2;
  if (indicators.uniqueCount <= 10) score += indicators.isNumeric ? 0.5 : 1;
  if (indicators.ordinalCategories) score -= 1.5;
  return { semioType: SEMIO_TYPES.QL, score: Math.max(score, 0) };
}

function scoreQLO(indicators: QLOIndicators): SemioScore {
  let score = 0;
  if (indicators.rankWords) score += 4;
  if (indicators.shareRankInterval >= 0.8) score += 2;
  if (indicators.yearLikely) score += 5;
  if (indicators.ordinalCategories) score += 4;
  if (indicators.likertLikely) score += 1.5;
  return { semioType: SEMIO_TYPES.QLO, score };
}

function scoreLabel(indicators: LabelIndicators): SemioScore {
  if (indicators.idWords && !indicators.labelWords) {
    return { semioType: SEMIO_TYPES.LABEL, score: 0 };
  }

  let score = 0;
  if (indicators.labelWords) score += 3;
  if (indicators.shareUniques >= 0.4) score += 1;
  if (indicators.uniqueCount >= 20) score += 1;
  return { semioType: SEMIO_TYPES.LABEL, score };
}

const ORDINAL_SEQUENCES: readonly (readonly string[])[] = [
  [
    'tres faible',
    'faible',
    'plutot faible',
    'moyen',
    'moyenne',
    'intermediaire',
    'plutot eleve',
    'eleve',
    'tres eleve',
    'fort',
    'tres fort'
  ],
  ['very low', 'low', 'medium', 'moderate', 'average', 'high', 'very high'],
  ['bas', 'plutot bas', 'moyen', 'haut', 'tres haut'],
  ['petit', 'moyen', 'grand', 'tres grand'],
  ['small', 'medium', 'large', 'extra large'],
  ['xs', 's', 'm', 'l', 'xl', 'xxl'],
  ['jamais', 'rarement', 'parfois', 'souvent', 'toujours'],
  ['never', 'rarely', 'sometimes', 'often', 'always'],
  ['insuffisant', 'passable', 'moyen', 'bien', 'tres bien', 'excellent'],
  ['poor', 'fair', 'good', 'very good', 'excellent']
];

const ORDINAL_NUMERIC_PREFIX = /^\d+\s*[-–.):]/;
const ORDINAL_MATCH_MIN_SHARE = 0.6;
const ORDINAL_MAX_CATEGORIES = 12;

function normalizeCategoryLabel(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function detectOrdinalCategories(categories: string[] | undefined): boolean {
  if (
    !categories ||
    categories.length < 2 ||
    categories.length > ORDINAL_MAX_CATEGORIES
  ) {
    return false;
  }

  const normalized = categories.map(normalizeCategoryLabel);

  if (normalized.every((value) => ORDINAL_NUMERIC_PREFIX.test(value))) {
    return true;
  }

  return ORDINAL_SEQUENCES.some((sequence) => {
    const matches = normalized.filter((value) =>
      sequence.includes(value)
    ).length;
    return (
      matches >= 2 && matches / normalized.length >= ORDINAL_MATCH_MIN_SHARE
    );
  });
}

const ID_KEYWORDS = [
  'id',
  'fid',
  'gid',
  'oid',
  'pk',
  'code',
  'iso',
  'objectid',
  'object_id',
  'rowid'
];
const LAT_KEYWORDS = ['lat', 'latitude'];
const LON_KEYWORDS = ['lon', 'long', 'lng', 'longitude'];
const RATIO_KEYWORDS = [
  'ratio',
  'rate',
  'taux',
  'tx',
  'percent',
  'pct',
  '%',
  'pour',
  'part',
  'share',
  'proportion',
  'indice',
  'densite',
  'density',
  'per',
  'capita',
  'habitant',
  'habitants',
  'moyenne',
  'mean',
  'avg',
  'median',
  'mediane',
  'esperance'
];
const RATIO_NAME_MARKERS = ['%', '‰', '/'];
const STOCK_KEYWORDS = [
  'population',
  'pop',
  'nombre',
  'number',
  'nb',
  'count',
  'total',
  'effectif',
  'effectifs',
  'superficie',
  'surface',
  'area',
  'montant',
  'somme',
  'sum'
];
const RANK_KEYWORDS = [
  'rank',
  'ranking',
  'rang',
  'classement',
  'order',
  'niveau',
  'level'
];
const YEAR_KEYWORDS = ['year', 'years', 'yr', 'annee', 'annees'];
const LABEL_KEYWORDS = [
  'name',
  'nom',
  'noms',
  'label',
  'libelle',
  'title',
  'titre',
  'address',
  'adresse',
  'city',
  'ville',
  'commune',
  'quartier',
  'site',
  'station',
  'stop',
  'entity',
  'entite'
];

interface NameKeywords {
  idWords: boolean;
  latWords: boolean;
  lonWords: boolean;
  ratioWords: boolean;
  rankWords: boolean;
  stockWords: boolean;
  yearWords: boolean;
  labelWords: boolean;
  xWord: boolean;
  yWord: boolean;
}

function detectKeywordsFromName(columnName: string): NameKeywords {
  const normalizedName = columnName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const nameParts = normalizedName.split(/[^a-z0-9%]/);
  const hasKeyword = (keywords: readonly string[]) =>
    nameParts.some((p) => keywords.includes(p));

  return {
    idWords:
      hasKeyword(ID_KEYWORDS) ||
      ID_KEYWORDS.some((keyword) => normalizedName === keyword),
    latWords: hasKeyword(LAT_KEYWORDS),
    lonWords: hasKeyword(LON_KEYWORDS),
    ratioWords:
      hasKeyword(RATIO_KEYWORDS) ||
      RATIO_NAME_MARKERS.some((marker) => normalizedName.includes(marker)),
    rankWords: hasKeyword(RANK_KEYWORDS),
    stockWords: hasKeyword(STOCK_KEYWORDS),
    yearWords: hasKeyword(YEAR_KEYWORDS),
    labelWords: hasKeyword(LABEL_KEYWORDS),
    xWord: nameParts.includes('x'),
    yWord: nameParts.includes('y')
  };
}

export function detectSemioType(
  analysis: AnalysisResult
): SemioDetectionResult {
  const results: SemioScore[] = [];

  const columnName = analysis.name ?? '';
  const typeSimple = analysis.type_simple ?? DuckDBSimplifiedType.STRING;

  const totalCount = (analysis.count as number) ?? 0;
  const uniqueCount = (analysis.uniques as number) ?? 0;
  const nullCount = (analysis.nulls as number) ?? 0;

  const shareUniques =
    (analysis.share_uniques as number) ??
    (totalCount > 0 ? uniqueCount / totalCount : 0);
  const shareNulls =
    (analysis.share_nulls as number) ??
    (totalCount > 0 ? nullCount / totalCount : 0);

  const min = toStatNumber(analysis.min) ?? 0;
  const max = toStatNumber(analysis.max) ?? 0;

  const keywords = detectKeywordsFromName(columnName);

  const extentMagnitude =
    (analysis.extent_magnitude as number) ??
    (max > 0 ? Math.log10(max / Math.max(min, 1)) : 0);

  const shareIntegers = (analysis.share_integers as number) ?? 0;
  const shareFloats = (analysis.share_floats as number) ?? 0;
  const shareRankInterval = (analysis.share_rank_interval as number) ?? 0;
  const skewness = toStatNumber(analysis.skewness);
  const categories = Array.isArray(analysis.categories)
    ? (analysis.categories as string[])
    : undefined;

  const yearLikely =
    keywords.yearWords &&
    shareIntegers >= 0.9 &&
    min >= YEAR_RANGE.MIN &&
    max <= YEAR_RANGE.MAX;

  const likertLikely =
    shareIntegers >= 0.9 &&
    uniqueCount >= 3 &&
    uniqueCount <= 7 &&
    min >= 0 &&
    max <= 10;

  const ordinalCategories = detectOrdinalCategories(categories);

  switch (typeSimple) {
    case DuckDBSimplifiedType.NUMERIC:
      results.push(
        scoreQTA({
          uniqueCount,
          extentMagnitude,
          shareIntegers,
          shareRankInterval,
          stockWords: keywords.stockWords,
          skewness
        }),
        scoreQTR({
          ratioWords: keywords.ratioWords,
          extentMagnitude,
          min,
          max,
          shareFloats,
          skewness
        }),
        scoreQL({
          shareUniques,
          uniqueCount,
          isNumeric: true,
          ordinalCategories
        }),
        scoreQLO({
          rankWords: keywords.rankWords,
          shareRankInterval,
          yearLikely,
          ordinalCategories,
          likertLikely
        }),
        scoreGeoId({
          shareUniques,
          shareNulls,
          idWords: keywords.idWords,
          shareRankInterval,
          isNumeric: true
        }),
        scoreGeoLat({
          latWords: keywords.latWords,
          coordWord: keywords.yWord,
          min,
          max
        }),
        scoreGeoLon({
          lonWords: keywords.lonWords,
          coordWord: keywords.xWord,
          min,
          max
        })
      );
      break;

    case DuckDBSimplifiedType.DATE:
      return {
        semioType: uniqueCount <= 10 ? SEMIO_TYPES.QL : SEMIO_TYPES.QTR,
        semioScore: DATE_FIXED_SCORE
      };

    case DuckDBSimplifiedType.STRING:
    default:
      results.push(
        scoreQL({
          shareUniques,
          uniqueCount,
          isNumeric: false,
          ordinalCategories
        }),
        scoreQLO({
          rankWords: keywords.rankWords,
          shareRankInterval,
          yearLikely,
          ordinalCategories,
          likertLikely
        }),
        scoreGeoId({
          shareUniques,
          shareNulls,
          idWords: keywords.idWords,
          shareRankInterval,
          isNumeric: false
        }),
        scoreLabel({
          labelWords: keywords.labelWords,
          idWords: keywords.idWords,
          shareUniques,
          uniqueCount
        })
      );
      break;
  }

  const ranked = results
    .map((entry) => ({
      semioType: entry.semioType,
      score: Math.min(entry.score / TYPE_MAX_SCORE[entry.semioType], 1)
    }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];

  if (best.semioType === SEMIO_TYPES.QL && uniqueCount === 1) {
    best.score = 0;
  }

  if (best.semioType === SEMIO_TYPES.GEOID && uniqueCount <= 1) {
    best.score = 0;
  }

  const second = ranked[1];
  const runnerUp =
    best.score > 0 && second && second.score > 0
      ? { semioType: second.semioType, semioScore: second.score }
      : undefined;

  return {
    semioType: best.semioType,
    semioScore: best.score,
    ...(runnerUp ? { runnerUp } : {})
  };
}
