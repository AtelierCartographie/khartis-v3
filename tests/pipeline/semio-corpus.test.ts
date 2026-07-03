import { describe, expect, it, afterAll, beforeAll, vi } from 'vitest';
import {
  createTestInstance,
  destroyTestInstance,
  type TestDuckDB
} from './duckdb-node-helper';
import { loadCsv, summarizeColumn } from './semio-fixture-helper';

vi.mock('$lib/features/duckdb', () => ({
  DuckDBSimplifiedType: {
    NUMERIC: 'numeric',
    BOOLEAN: 'boolean',
    DATE: 'date',
    STRING: 'string',
    GEOMETRY: 'geometry',
    OTHER: 'other'
  }
}));

import {
  detectSemioType,
  type SemioType
} from '$lib/features/commons/utils/semio-detector.utils';

interface CorpusEntry {
  file: string;
  table: string;
  delimiter?: string;
  expectations: Record<string, SemioType[]>;
}

const CORPUS: CorpusEntry[] = [
  {
    file: 'fossil-fuel-subsidies-gdp-2021.csv',
    table: 'corpus_fossil',
    expectations: {
      Entity: ['label'],
      Code: ['geoid'],
      Year: ['QLO'],
      'Fossil-fuel subsidies (consumption and production) as a proportion of total GDP (%)':
        ['QTR']
    }
  },
  {
    file: 'france-regions-simplification-check.csv',
    table: 'corpus_regions',
    delimiter: ';',
    expectations: {
      'Code Région 2016': ['geoid'],
      'Nom région': ['label'],
      'Valeur test': ['QTA', 'QTR']
    }
  },
  {
    file: 'fuzzy-countries.csv',
    table: 'corpus_fuzzy',
    expectations: {
      entity: ['label'],
      value: ['QTA', 'QTR']
    }
  },
  {
    file: 'sites-seveso-idf.csv',
    table: 'corpus_seveso',
    delimiter: ';',
    expectations: {
      Lat: ['geolat'],
      Long: ['geolon'],
      "Nom de l'installation": ['label'],
      Commune: ['label'],
      'Code Postal': ['geoid'],
      'Directive IPPC': ['QL'],
      'Code Seveso': ['QL', 'geoid'],
      'Statut Seveso': ['QL']
    }
  },
  {
    file: 'tabular-gps-gcpnt-columns.csv',
    table: 'corpus_gcpnt',
    delimiter: ';',
    expectations: {
      city: ['label'],
      country: ['label'],
      gcpnt_lon: ['geolon'],
      gcpnt_lat: ['geolat'],
      population: ['QTA']
    }
  },
  {
    file: 'tiny-geo-3features-enrich.csv',
    table: 'corpus_tiny',
    expectations: {
      id: ['geoid'],
      name: ['label'],
      population_2024: ['QTA'],
      category: ['QL']
    }
  },
  {
    file: 'visualization-toolbox-cases.csv',
    table: 'corpus_toolbox',
    expectations: {
      lat: ['geolat'],
      long: ['geolon'],
      place_name: ['label'],
      category: ['QL'],
      segment: ['QL'],
      capacity_total: ['QTA'],
      population_total: ['QTA'],
      year: ['QLO']
    }
  },
  {
    file: 'world-bank-rural-pop.csv',
    table: 'corpus_worldbank',
    expectations: {
      'Country Code': ['geoid'],
      'Country Name': ['label'],
      '1960': ['QTR'],
      '1980': ['QTR'],
      '2000': ['QTR'],
      '2020': ['QTR']
    }
  },
  {
    file: 'diverging-values-test.csv',
    table: 'corpus_diverging',
    expectations: {
      pays: ['label'],
      taux_solde: ['QTR'],
      population: ['QTA']
    }
  },
  {
    file: 'mixed-numeric-type-test.csv',
    table: 'corpus_mixed',
    expectations: {
      ville: ['label'],
      annee: ['QLO']
    }
  },
  {
    file: 'naissances-par-commune-departement-et-region-2018.csv',
    table: 'corpus_naissances',
    delimiter: ';',
    expectations: {
      'Code INSEE Commune': ['geoid'],
      'Nom Commune': ['label'],
      'Code Région 2016': ['geoid'],
      'Code Département': ['geoid'],
      Année: ['QLO'],
      Naissances: ['QTA'],
      'Nom Département': ['label'],
      'Nom région': ['label', 'QL'],
      'Code EPCI': ['geoid'],
      EPCI: ['QL', 'label']
    }
  }
];

let db: TestDuckDB;

beforeAll(async () => {
  db = await createTestInstance();
});

afterAll(async () => {
  await destroyTestInstance(db);
});

function formatConfusionMatrix(
  confusion: Map<string, Map<string, number>>
): string {
  const types = [
    'geoid',
    'geolat',
    'geolon',
    'label',
    'QTA',
    'QTR',
    'QL',
    'QLO'
  ];
  const header = ['attendu \\ détecté', ...types].join('\t');
  const lines = types
    .filter((expected) => confusion.has(expected))
    .map((expected) => {
      const row = confusion.get(expected)!;
      return [expected, ...types.map((got) => String(row.get(got) ?? 0))].join(
        '\t'
      );
    });
  return [header, ...lines].join('\n');
}

describe('semio-detector — corpus étiqueté', () => {
  it('classifies every labeled column of the corpus as expected', async () => {
    const failures: string[] = [];
    const confusion = new Map<string, Map<string, number>>();
    let total = 0;
    let correct = 0;

    for (const entry of CORPUS) {
      await loadCsv(db, entry.file, entry.table, entry.delimiter);

      for (const [column, accepted] of Object.entries(entry.expectations)) {
        const summary = await summarizeColumn(db, entry.table, column);
        const result = detectSemioType(summary as never);

        const expectedKey = accepted[0];
        const row = confusion.get(expectedKey) ?? new Map<string, number>();
        row.set(result.semioType, (row.get(result.semioType) ?? 0) + 1);
        confusion.set(expectedKey, row);

        total += 1;
        if (accepted.includes(result.semioType)) {
          correct += 1;
        } else {
          failures.push(
            `${entry.file} :: ${column} → ${result.semioType} (score ${result.semioScore.toFixed(2)}, attendu ${accepted.join(' | ')})`
          );
        }
      }
    }

    if (failures.length > 0) {
      throw new Error(
        `Précision corpus : ${correct}/${total} (${((correct / total) * 100).toFixed(1)} %)\n\n${formatConfusionMatrix(confusion)}\n\nErreurs :\n${failures.join('\n')}`
      );
    }

    expect(total).toBeGreaterThanOrEqual(40);
  });
});
