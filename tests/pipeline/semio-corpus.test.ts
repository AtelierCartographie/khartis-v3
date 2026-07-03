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
  readOptions?: string;
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
    file: 'kh-v1/01-population-etats.csv',
    table: 'corpus_kh_population',
    readOptions: "decimal_separator = ','",
    expectations: {
      ISO3: ['geoid'],
      Country: ['label'],
      Pop_2010: ['QTA'],
      Pop_2015: ['QTA']
    }
  },
  {
    file: 'kh-v1/02-evolution-idh-1990-2014.csv',
    table: 'corpus_kh_idh',
    readOptions: "decimal_separator = ','",
    expectations: {
      ISO3: ['geoid'],
      'HDI rank': ['QLO'],
      Country: ['label'],
      IDH_1990: ['QTR'],
      IDH_2014: ['QTR'],
      IDH_1990_2014: ['QTR']
    }
  },
  {
    file: 'kh-v1/03-sous-alimentation-2014-2016.csv',
    table: 'corpus_kh_alimentation',
    expectations: {
      AreaName: ['label'],
      'NOMBRE sous-alimentées': ['QTA'],
      'NOMBRE FlagD': ['QL'],
      'PART sous-alimentées': ['QTR'],
      'PART FlagD': ['QL']
    }
  },
  {
    file: 'kh-v1/04-rdv-societe-civile.csv',
    table: 'corpus_kh_rdv',
    expectations: {
      Description: ['QL'],
      Date: ['QLO'],
      Pays: ['label'],
      Ville: ['label'],
      Lat: ['geolat'],
      Long: ['geolon']
    }
  },
  {
    file: 'kh-v1/05-sites-unesco-2015.csv',
    table: 'corpus_kh_unesco',
    readOptions: "decimal_separator = ','",
    expectations: {
      unique_number: ['geoid', 'QTA'],
      id_no: ['geoid'],
      name_en: ['label'],
      date_inscribed: ['QLO'],
      longitude: ['geolon'],
      latitude: ['geolat'],
      area_hectares: ['QTA'],
      C1: ['QL'],
      category: ['QL'],
      iso_code: ['geoid']
    }
  },
  {
    file: 'kh-v1/06-independance-africaine.csv',
    table: 'corpus_kh_independance',
    expectations: {
      Pays: ['label'],
      'Classes ID': ['QLO', 'QL', 'geoid'],
      'Classes D': ['QL', 'QLO']
    }
  },
  {
    file: 'kh-v1/eu-nuts2-agriculture.csv',
    table: 'corpus_kh_agriculture',
    readOptions: "decimal_separator = ',', nullstr = [':', '']",
    expectations: {
      ID: ['geoid'],
      'Total SAU (superficie agricole utilisée)': ['QTA'],
      'SAU des exploitations 50 ha et plus': ['QTA'],
      '% SAU des exploitations 0-9.9 ha': ['QTR'],
      'De 20 à 29.9 ha': ['QTA']
    }
  },
  {
    file: 'kh-v1/eu-nuts2-travail.csv',
    table: 'corpus_kh_travail',
    readOptions: "decimal_separator = ',', nullstr = [':', '']",
    expectations: {
      ID: ['geoid'],
      'Total 25-64 ans - heures de travail hebdo 2015': ['QTR', 'QTA'],
      'Femme 65-74 ans - heures de travail hebdo 2015': ['QTR']
    }
  },
  {
    file: 'kh-v1/eu-nuts3-pop.csv',
    table: 'corpus_kh_nuts3',
    readOptions: "decimal_separator = ','",
    expectations: {
      ID: ['geoid'],
      'Habitant au km2 - 2015': ['QTR']
    }
  },
  {
    file: 'kh-v1/fr-dpt-pauvrete-2013.csv',
    table: 'corpus_kh_pauvrete',
    readOptions: "decimal_separator = ','",
    expectations: {
      'Code géographique': ['geoid'],
      'Libellé géographique': ['label'],
      'Nombre de ménages fiscaux': ['QTA'],
      'Part des ménages fiscaux imposés (%)': ['QTR'],
      'Taux de pauvreté-Ensemble (% pop totale)': ['QTR'],
      'Revenu disponible par unité de consommation (Médiane)': ['QTR'],
      'Revenu disponible par unité de consommation (1er décile)': ['QTR']
    }
  },
  {
    file: 'kh-v1/fr-dpt-pop-2013.csv',
    table: 'corpus_kh_dpt_pop',
    expectations: {
      ID: ['geoid'],
      Départements: ['label'],
      Population2013: ['QTA']
    }
  },
  {
    file: 'SIPRI-Milex-data-1949-2025_v1.2-KHARTIS.csv',
    table: 'corpus_sipri',
    readOptions: "decimal_separator = ',', nullstr = ['...', '…', '']",
    expectations: {
      Country: ['label'],
      Continent: ['QL'],
      'Sous-continent': ['QL'],
      'Military expenditure, in constant (2024) US$ m. 2015': ['QTA'],
      'Military expenditure % of GDP, 2015': ['QTR'],
      'Military expenditure per capita by country, 2015': ['QTR'],
      'Military expenditure by country as % of government spending, 2025': [
        'QTR'
      ]
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
      await loadCsv(
        db,
        entry.file,
        entry.table,
        entry.delimiter,
        entry.readOptions
      );

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
