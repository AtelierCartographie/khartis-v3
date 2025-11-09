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

export class GeoMatcher {
  private static catalogueCache = new Map<string, CatalogueInfo>();

  private static readonly MIN_FUZZY_SIMILARITY = 0.7;

  private static readonly MAX_FUZZY_SUGGESTIONS = 3;

  static async validateAgainstCatalogue(
    values: string[],
    catalogueId: string,
    options: {
      caseSensitive?: boolean;
      fuzzyMatch?: boolean;
      suggestionLimit?: number;
    } = {}
  ): Promise<MatchResult> {
    const catalogue = await this.loadCatalogue(catalogueId);

    if (!catalogue) {
      throw new Error(`Catalogue "${catalogueId}" non trouvé`);
    }

    const normalizedValues = this.preprocessValues(
      values,
      options.caseSensitive
    );

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
      } else if (this.checkAlternativeNames(normalized, catalogue)) {
        result.matched.push(original);
      } else if (options.fuzzyMatch !== false) {
        const fuzzyMatch = this.findFuzzyMatch(
          normalized,
          catalogue,
          options.suggestionLimit || this.MAX_FUZZY_SUGGESTIONS
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

    const uniqueMatches = new Set(result.matched.map((v) => this.normalize(v)));
    result.catalogueCoverage =
      (uniqueMatches.size / catalogue.entries.size) * 100;

    result.matchRate =
      values.length > 0 ? result.matched.length / values.length : 0;

    result.confidence = this.calculateConfidence(result, catalogue);

    return result;
  }

  private static preprocessValues(
    values: string[],
    caseSensitive?: boolean
  ): Array<{ original: string; normalized: string }> {
    return values.map((value) => ({
      original: value,
      normalized: this.normalize(value, caseSensitive)
    }));
  }

  private static normalize(value: string, caseSensitive?: boolean): string {
    if (value == null) return '';

    let normalized = value.trim();

    if (!caseSensitive) {
      normalized = normalized.toUpperCase();
    }

    normalized = normalized
      .replace(/[''`]/g, "'")
      .replace(/[""«»]/g, '"')
      .replace(/\s+/g, ' ')
      .replace(/^(LE|LA|LES|L'|THE)\s+/i, '');

    const accentsMap: { [key: string]: string } = {
      À: 'A',
      Á: 'A',
      Â: 'A',
      Ã: 'A',
      Ä: 'A',
      Å: 'A',
      È: 'E',
      É: 'E',
      Ê: 'E',
      Ë: 'E',
      Ì: 'I',
      Í: 'I',
      Î: 'I',
      Ï: 'I',
      Ò: 'O',
      Ó: 'O',
      Ô: 'O',
      Õ: 'O',
      Ö: 'O',
      Ù: 'U',
      Ú: 'U',
      Û: 'U',
      Ü: 'U',
      Ñ: 'N',
      Ç: 'C'
    };

    for (const [accent, base] of Object.entries(accentsMap)) {
      normalized = normalized.replace(new RegExp(accent, 'g'), base);
      normalized = normalized.replace(
        new RegExp(accent.toLowerCase(), 'g'),
        base.toLowerCase()
      );
    }

    return normalized;
  }

  private static checkAlternativeNames(
    value: string,
    catalogue: CatalogueInfo
  ): boolean {
    if (!catalogue.alternativeNames) return false;

    for (const alternatives of catalogue.alternativeNames.values()) {
      if (alternatives.some((alt) => this.normalize(alt) === value)) {
        return true;
      }
    }

    return false;
  }

  private static findFuzzyMatch(
    value: string,
    catalogue: CatalogueInfo,
    limit: number
  ): Array<{ match: string; similarity: number }> {
    const matches: Array<{ match: string; similarity: number }> = [];

    catalogue.entries.forEach((entry) => {
      const similarity = this.calculateSimilarity(value, entry);
      if (similarity >= this.MIN_FUZZY_SIMILARITY) {
        matches.push({ match: entry, similarity });
      }
    });

    return matches.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
  }

  private static calculateSimilarity(str1: string, str2: string): number {
    const maxLen = Math.max(str1.length, str2.length);
    if (maxLen === 0) return 1;

    const distance = this.levenshteinDistance(str1, str2);
    return 1 - distance / maxLen;
  }

  private static levenshteinDistance(str1: string, str2: string): number {
    const m = str1.length;
    const n = str2.length;

    if (m === 0) return n;
    if (n === 0) return m;

    const matrix: number[][] = [];

    for (let i = 0; i <= m; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= n; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }

    return matrix[m][n];
  }

  private static calculateConfidence(
    result: MatchResult,
    _catalogue: CatalogueInfo
  ): number {
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

  static async loadCatalogue(
    catalogueId: string
  ): Promise<CatalogueInfo | null> {
    if (this.catalogueCache.has(catalogueId)) {
      return this.catalogueCache.get(catalogueId)!;
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
      this.catalogueCache.set(catalogueId, catalogue);
    }

    return catalogue || null;
  }

  static async suggestCatalogue(
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
        const result = await this.validateAgainstCatalogue(
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
        console.error(
          `Erreur lors du test du catalogue ${catalogueId}:`,
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

  static formatMatchReport(result: MatchResult): string {
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
}
