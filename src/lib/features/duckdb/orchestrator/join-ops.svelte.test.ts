import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BasemapLayerType } from '$lib/features/commons/constants/ui.constants';
import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';
import type { DuckDBClientForJoin } from './join-ops';

const mocks = vi.hoisted(() => ({
  ensureAttributesLoaded: vi.fn(),
  getLocale: vi.fn(() => 'fr')
}));

vi.mock('$lib/features/map/services/basemap.service.svelte', () => ({
  basemapService: {
    ensureAttributesLoaded: mocks.ensureAttributesLoaded
  }
}));

vi.mock('$lib/paraglide/runtime', () => ({
  getLocale: mocks.getLocale
}));

const { getBasemapAttributeValues, getBasemapAttributeAliasesByValue } =
  await import('./join-ops');

function createBasemap(): BasemapMetadata {
  return {
    file: 'monde-countries-2024-medium',
    title_fr: 'Monde',
    title_en: 'World',
    source: 'test',
    date: '2024',
    display_id_fr: 'name_fren',
    display_id_en: 'name_engl',
    bbox: [-180, -90, 180, 90],
    proj_source: 'EPSG:4326',
    proj_to: { type: 'simple' },
    layers: [
      {
        type: BasemapLayerType.POLYGON
      }
    ]
  };
}

function createDuck() {
  const queries: string[] = [];
  return {
    queries,
    duck: {
      query: vi.fn(async (sql: string) => {
        queries.push(sql);
        if (sql.includes("table_name = 'basemap_attributes'")) {
          return [{ table_name: 'basemap_attributes' }];
        }
        if (sql.includes('COUNT(*) as cnt')) {
          return [{ cnt: 1 }];
        }
        if (sql.includes('ROW_NUMBER() OVER')) {
          return [{ raw: 'Brésil' }, { raw: 'France' }];
        }
        return [];
      }),
      join_by_id: vi.fn(),
      apply_join_association: vi.fn()
    } satisfies DuckDBClientForJoin
  };
}

describe('join-ops basemap attribute values', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getLocale.mockReturnValue('fr');
  });

  it('returns one display value per basemap entity using the localized display variant first', async () => {
    const { duck, queries } = createDuck();

    const values = await getBasemapAttributeValues(createBasemap(), duck);

    expect(values).toEqual(['Brésil', 'France']);
    const valueQuery = queries.find((query) =>
      query.includes('PARTITION BY entity_id')
    );
    expect(valueQuery).toContain("variant = 'name_fren'");
    expect(valueQuery).toContain('COALESCE(id, raw) AS entity_id');
  });
});

describe('join-ops basemap aliases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('groups aliases by the provided basemap entity id', async () => {
    const queries: string[] = [];
    const duck = {
      query: vi.fn(async (sql: string) => {
        queries.push(sql);
        if (sql.includes("table_name = 'basemap_attributes'")) {
          return [{ table_name: 'basemap_attributes' }];
        }
        if (sql.includes('COUNT(*) as cnt')) {
          return [{ cnt: 1 }];
        }
        if (sql.includes('entity_id')) {
          return [
            {
              raw: 'BRA',
              variant: 'iso3_code',
              entity_id: 'BRA',
              rn: 1
            },
            {
              raw: 'Brésil',
              variant: 'name_fren',
              entity_id: 'BRA',
              rn: 2
            },
            {
              raw: 'Brazil',
              variant: 'name_engl',
              entity_id: 'BRA',
              rn: 3
            }
          ];
        }
        return [];
      }),
      join_by_id: vi.fn(),
      apply_join_association: vi.fn()
    } satisfies DuckDBClientForJoin;

    const aliases = await getBasemapAttributeAliasesByValue(
      createBasemap(),
      duck
    );

    expect(aliases.BRA).toEqual([
      { value: 'Brésil', variant: 'name_fren' },
      { value: 'Brazil', variant: 'name_engl' }
    ]);
    expect(aliases['Brésil']).toEqual([
      { value: 'BRA', variant: 'iso3_code' },
      { value: 'Brazil', variant: 'name_engl' }
    ]);
    expect(queries.join('\n')).not.toContain('SUM(CASE WHEN variant');
  });
});
