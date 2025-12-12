import { LogCategory, logger } from './logger';
import { normalizeForMatching } from './string.utils';

export interface MatchResult {
  matched: string[];
  unmatched: string[];
  fuzzyMatches: Array<{
    original: string;
    suggestion: string;
    similarity: number;
  }>;
  duplicates: string[];
  matchRate: number;
  confidence: number;
  catalogueCoverage?: number;
}

export interface CatalogueInfo {
  id: string;
  name: string;
  type: 'country' | 'region' | 'city' | 'custom';
  entries: Set<string>;
  alternativeNames?: Map<string, string[]>;
}

/**
 * Creates a GeoMatcher instance with encapsulated cache
 * @returns GeoMatcher object with matching functions
 */
function createGeoMatcher() {
  // Private state encapsulated in closure
  const catalogueCache = new Map<string, CatalogueInfo>();
  const MIN_FUZZY_SIMILARITY = 0.7;
  const MAX_FUZZY_SUGGESTIONS = 3;

  async function validateAgainstCatalogue(
    values: string[],
    catalogueId: string,
    options: {
      caseSensitive?: boolean;
      fuzzyMatch?: boolean;
      suggestionLimit?: number;
    } = {}
  ): Promise<MatchResult> {
    const catalogue = await loadCatalogue(catalogueId);

    if (!catalogue) {
      throw new Error(`Catalogue "${catalogueId}" non trouvé`);
    }

    const normalizedValues = preprocessValues(values, options.caseSensitive);

    const result: MatchResult = {
      matched: [],
      unmatched: [],
      fuzzyMatches: [],
      duplicates: [],
      matchRate: 0,
      confidence: 0
    };

    const valueCounts = new Map<string, number>();
    normalizedValues.forEach(({ normalized }) => {
      valueCounts.set(normalized, (valueCounts.get(normalized) || 0) + 1);
    });

    valueCounts.forEach((count, value) => {
      if (count > 1) {
        result.duplicates.push(value);
      }
    });

    for (const { original, normalized } of normalizedValues) {
      if (catalogue.entries.has(normalized)) {
        result.matched.push(original);
      } else if (checkAlternativeNames(normalized, catalogue)) {
        result.matched.push(original);
      } else if (options.fuzzyMatch !== false) {
        const fuzzyMatch = findFuzzyMatch(
          normalized,
          catalogue,
          options.suggestionLimit || MAX_FUZZY_SUGGESTIONS
        );

        if (fuzzyMatch.length > 0) {
          result.fuzzyMatches.push({
            original,
            suggestion: fuzzyMatch[0].match,
            similarity: fuzzyMatch[0].similarity
          });
        } else {
          result.unmatched.push(original);
        }
      } else {
        result.unmatched.push(original);
      }
    }

    const uniqueMatches = new Set(result.matched.map((v) => normalize(v)));
    result.catalogueCoverage =
      (uniqueMatches.size / catalogue.entries.size) * 100;

    result.matchRate =
      values.length > 0 ? result.matched.length / values.length : 0;

    result.confidence = calculateConfidence(result);

    return result;
  }

  function preprocessValues(
    values: string[],
    caseSensitive?: boolean
  ): Array<{ original: string; normalized: string }> {
    return values.map((value) => ({
      original: value,
      normalized: normalize(value, caseSensitive)
    }));
  }

  function normalize(value: string, caseSensitive?: boolean): string {
    if (value == null) return '';

    let normalized = value.trim();

    // Normalize quotes and spaces before calling normalizeForMatching
    normalized = normalized
      .replace(/[''`]/g, "'")
      .replace(/[""«»]/g, '"')
      .replace(/\s+/g, ' ')
      .replace(/^(LE|LA|LES|L'|THE)\s+/i, '');

    // Use the centralized normalization function to remove accents
    // and normalize case efficiently (replaces ~40 lines of manual code)
    normalized = normalizeForMatching(normalized, caseSensitive);

    return normalized;
  }

  function checkAlternativeNames(
    value: string,
    catalogue: CatalogueInfo
  ): boolean {
    if (!catalogue.alternativeNames) return false;

    for (const alternatives of catalogue.alternativeNames.values()) {
      if (alternatives.some((alt) => normalize(alt) === value)) {
        return true;
      }
    }

    return false;
  }

  function findFuzzyMatch(
    value: string,
    catalogue: CatalogueInfo,
    limit: number
  ): Array<{ match: string; similarity: number }> {
    const matches: Array<{ match: string; similarity: number }> = [];

    catalogue.entries.forEach((entry) => {
      const similarity = calculateSimilarity(value, entry);
      if (similarity >= MIN_FUZZY_SIMILARITY) {
        matches.push({ match: entry, similarity });
      }
    });

    return matches.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
  }

  function calculateSimilarity(str1: string, str2: string): number {
    const maxLen = Math.max(str1.length, str2.length);
    if (maxLen === 0) return 1;

    const distance = levenshteinDistance(str1, str2);
    return 1 - distance / maxLen;
  }

  /**
   * Calculates the Levenshtein distance between two strings
   * Optimized to use O(min(m,n)) space instead of O(m×n)
   * @param str1 First string
   * @param str2 Second string
   * @returns Levenshtein distance
   */
  function levenshteinDistance(str1: string, str2: string): number {
    const m = str1.length;
    const n = str2.length;

    if (m === 0) return n;
    if (n === 0) return m;

    // Limit size to avoid expensive computations
    const MAX_LENGTH = 1000;
    if (m > MAX_LENGTH || n > MAX_LENGTH) {
      // For very long strings, use a simple heuristic
      return Math.max(m, n);
    }

    // Optimization: use only two rows instead of a full matrix
    // Space complexity O(min(m,n)) instead of O(m×n)
    let prevRow = new Array(n + 1);
    let currRow = new Array(n + 1);

    // Initialize the first row
    for (let j = 0; j <= n; j++) {
      prevRow[j] = j;
    }

    // Calculate subsequent rows
    for (let i = 1; i <= m; i++) {
      currRow[0] = i;

      for (let j = 1; j <= n; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        currRow[j] = Math.min(
          currRow[j - 1] + 1, // insertion
          prevRow[j] + 1, // suppression
          prevRow[j - 1] + cost // substitution
        );
      }

      // Swap rows
      [prevRow, currRow] = [currRow, prevRow];
    }

    return prevRow[n];
  }

  function calculateConfidence(result: MatchResult): number {
    let confidence = result.matchRate;

    if (result.fuzzyMatches.length > 0) {
      const avgFuzzySimilarity =
        result.fuzzyMatches.reduce((sum, match) => sum + match.similarity, 0) /
        result.fuzzyMatches.length;
      confidence = confidence * 0.8 + avgFuzzySimilarity * 0.2;
    }

    if (result.duplicates.length > 0) {
      confidence *= 0.95;
    }

    if (result.catalogueCoverage && result.catalogueCoverage < 10) {
      confidence *= 0.9;
    }

    return Math.min(confidence, 1);
  }

  async function loadCatalogue(
    catalogueId: string
  ): Promise<CatalogueInfo | null> {
    if (catalogueCache.has(catalogueId)) {
      return catalogueCache.get(catalogueId)!;
    }

    const mockCatalogues: Record<string, CatalogueInfo> = {
      world_countries: {
        id: 'world_countries',
        name: 'Pays du monde',
        type: 'country',
        entries: new Set([
          'FRANCE',
          'ALLEMAGNE',
          'ESPAGNE',
          'ITALIE',
          'ROYAUME-UNI',
          'POLOGNE',
          'ROUMANIE',
          'PAYS-BAS',
          'BELGIQUE',
          'GRECE',
          'PORTUGAL',
          'TCHEQUIE',
          'HONGRIE',
          'SUEDE',
          'AUTRICHE',
          'BULGARIE',
          'DANEMARK',
          'FINLANDE',
          'SLOVAQUIE',
          'IRLANDE',
          'CROATIE',
          'LITUANIE',
          'SLOVENIE',
          'LETTONIE',
          'ESTONIE',
          'CHYPRE',
          'LUXEMBOURG',
          'MALTE'
        ]),
        alternativeNames: new Map([
          ['ALLEMAGNE', ['GERMANY', 'DEUTSCHLAND', 'ALEMANIA']],
          ['ESPAGNE', ['SPAIN', 'ESPAÑA', 'SPANIEN']],
          [
            'ROYAUME-UNI',
            ['UNITED KINGDOM', 'UK', 'GRANDE-BRETAGNE', 'GREAT BRITAIN']
          ],
          ['PAYS-BAS', ['NETHERLANDS', 'HOLLAND', 'HOLLANDE', 'NEDERLAND']],
          ['TCHEQUIE', ['CZECH REPUBLIC', 'CZECHIA', 'REPUBLIQUE TCHEQUE']]
        ])
      },
      france_regions: {
        id: 'france_regions',
        name: 'Régions de France',
        type: 'region',
        entries: new Set([
          'ILE-DE-FRANCE',
          'AUVERGNE-RHONE-ALPES',
          'HAUTS-DE-FRANCE',
          'NOUVELLE-AQUITAINE',
          'OCCITANIE',
          'GRAND EST',
          "PROVENCE-ALPES-COTE D'AZUR",
          'PAYS DE LA LOIRE',
          'NORMANDIE',
          'BRETAGNE',
          'BOURGOGNE-FRANCHE-COMTE',
          'CENTRE-VAL DE LOIRE',
          'CORSE',
          'GUADELOUPE',
          'MARTINIQUE',
          'GUYANE',
          'LA REUNION',
          'MAYOTTE'
        ]),
        alternativeNames: new Map([
          [
            "PROVENCE-ALPES-COTE D'AZUR",
            ['PACA', "PROVENCE-ALPES-CÔTE D'AZUR"]
          ],
          ['ILE-DE-FRANCE', ['IDF', 'ÎLE-DE-FRANCE', 'REGION PARISIENNE']]
        ])
      }
    };

    const catalogue = mockCatalogues[catalogueId];
    if (catalogue) {
      catalogueCache.set(catalogueId, catalogue);
    }

    return catalogue || null;
  }

  async function suggestCatalogue(
    sampleValues: string[],
    availableCatalogues?: string[]
  ): Promise<{ catalogueId: string; confidence: number } | null> {
    const cataloguesToTest = availableCatalogues || [
      'world_countries',
      'france_regions'
    ];
    const results: Array<{
      catalogueId: string;
      matchRate: number;
      confidence: number;
    }> = [];

    for (const catalogueId of cataloguesToTest) {
      try {
        const result = await validateAgainstCatalogue(
          sampleValues.slice(0, 100),
          catalogueId,
          { fuzzyMatch: true }
        );

        results.push({
          catalogueId,
          matchRate: result.matchRate,
          confidence: result.confidence
        });
      } catch (error) {
        logger.error(
          `Erreur lors du test du catalogue ${catalogueId}`,
          LogCategory.DATA,
          error
        );
      }
    }

    if (results.length === 0) return null;

    results.sort((a, b) => b.confidence - a.confidence);

    const best = results[0];
    return best.confidence > 0.3
      ? { catalogueId: best.catalogueId, confidence: best.confidence }
      : null;
  }

  function formatMatchReport(result: MatchResult): string {
    const lines: string[] = [];

    lines.push('=== RAPPORT DE CORRESPONDANCE ===\n');
    lines.push(
      `Taux de correspondance: ${(result.matchRate * 100).toFixed(1)}%`
    );
    lines.push(`Confiance: ${(result.confidence * 100).toFixed(1)}%`);

    if (result.catalogueCoverage !== undefined) {
      lines.push(
        `Couverture du catalogue: ${result.catalogueCoverage.toFixed(1)}%`
      );
    }

    lines.push('');

    lines.push(`✅ Correspondances exactes: ${result.matched.length}`);
    if (result.matched.length > 0 && result.matched.length <= 10) {
      result.matched.slice(0, 5).forEach((value) => {
        lines.push(`   - ${value}`);
      });
      if (result.matched.length > 5) {
        lines.push(`   ... et ${result.matched.length - 5} autres`);
      }
    }

    if (result.fuzzyMatches.length > 0) {
      lines.push(
        `\n🔄 Correspondances approximatives: ${result.fuzzyMatches.length}`
      );
      result.fuzzyMatches.slice(0, 5).forEach((match) => {
        lines.push(
          `   - "${match.original}" → "${match.suggestion}" (${(match.similarity * 100).toFixed(0)}%)`
        );
      });
    }

    if (result.unmatched.length > 0) {
      lines.push(`\n❌ Non correspondances: ${result.unmatched.length}`);
      if (result.unmatched.length <= 10) {
        result.unmatched.forEach((value) => {
          lines.push(`   - ${value}`);
        });
      } else {
        result.unmatched.slice(0, 5).forEach((value) => {
          lines.push(`   - ${value}`);
        });
        lines.push(`   ... et ${result.unmatched.length - 5} autres`);
      }
    }

    if (result.duplicates.length > 0) {
      lines.push(`\n⚠️  Valeurs dupliquées: ${result.duplicates.length}`);
      result.duplicates.slice(0, 5).forEach((value) => {
        lines.push(`   - ${value}`);
      });
    }

    return lines.join('\n');
  }

  // Return public API
  return {
    validateAgainstCatalogue,
    loadCatalogue,
    suggestCatalogue,
    formatMatchReport
  } as const;
}

/**
 * GeoMatcher singleton instance
 * Provides geographic data matching with caching
 */
export const GeoMatcher = createGeoMatcher();
