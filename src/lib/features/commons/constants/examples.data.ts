import { ExampleCategory } from '$lib/features/commons/constants/ui.constants';
import { resolveStaticAssetUrl } from '$lib/features/commons/utils/static-asset-url';
import * as m from '$lib/paraglide/messages';
import type { ExampleProject } from '../types/create-project.types';

interface ExampleCategoryConfig {
  id: ExampleCategory;
  label: string;
  icon?: string;
}

export const EXAMPLE_CATEGORIES: ExampleCategoryConfig[] = [
  { id: ExampleCategory.ALL, label: 'try_example_all' },
  { id: ExampleCategory.SYMBOLS, label: 'try_example_symbols' },
  { id: ExampleCategory.POLYGONS, label: 'try_example_polygons' },
  { id: ExampleCategory.LINES, label: 'try_example_lines' },
  { id: ExampleCategory.TEXTS, label: 'try_example_texts' },
  { id: ExampleCategory.HYBRIDS, label: 'try_example_hybrids' }
];

function resolveExampleAssetPath(path?: string): string | undefined {
  return path ? resolveStaticAssetUrl(path) : undefined;
}

export const EXAMPLE_PROJECTS: ExampleProject[] = [
  {
    id: 'world-population',
    title: m.example_world_population_title(),
    subtitle: m.example_world_population_subtitle(),
    description: m.example_world_population_description(),
    category: ExampleCategory.POLYGONS,
    thumbnail: resolveExampleAssetPath('/examples/world-population-thumb.svg'),
    dataUrl: resolveExampleAssetPath(
      '/examples/data/countries-population-simple.csv'
    ),
    baseMapId: 'monde-countries-2024-medium',
    visualizations: [
      {
        type: 'choropleth',
        variable: 'Population 2023',
        classification: 'quantile',
        classes: 5,
        palette: 'Blues'
      }
    ],
    tags: [
      m.example_tag_population(),
      m.example_tag_europe(),
      m.example_tag_choropleth()
    ]
  },

  {
    id: 'european-cities',
    title: m.example_european_cities_title(),
    subtitle: m.example_european_cities_subtitle(),
    description: m.example_european_cities_description(),
    category: ExampleCategory.SYMBOLS,
    thumbnail: resolveExampleAssetPath('/examples/european-cities-thumb.svg'),
    dataUrl: resolveExampleAssetPath('/examples/data/european-cities.csv'),
    baseMapId: undefined,
    referenceBasemapId: 'europe-nuts1-2024-medium',
    visualizations: [
      {
        type: 'proportional',
        variable: 'population',
        symbol: 'circle',
        minSize: 5,
        maxSize: 50,
        color: '#E6142D'
      }
    ],
    tags: [
      m.example_tag_cities(),
      m.example_tag_europe(),
      m.example_tag_symbols()
    ]
  },

  {
    id: 'world-countries-map',
    title: m.example_world_countries_title(),
    subtitle: m.example_world_countries_subtitle(),
    description: m.example_world_countries_description(),
    category: ExampleCategory.POLYGONS,
    thumbnail: resolveExampleAssetPath('/examples/world-countries-thumb.svg'),
    dataUrl: resolveExampleAssetPath('/examples/data/world-countries.geojson'),
    visualizations: [
      {
        type: 'simple',
        fillColor: '#4A90E2',
        strokeColor: '#FFFFFF',
        strokeWidth: 1
      }
    ],
    tags: [
      m.example_tag_world(),
      m.example_tag_countries(),
      m.example_tag_borders()
    ]
  },

  {
    id: 'gdp-evolution',
    title: m.example_gdp_evolution_title(),
    subtitle: m.example_gdp_evolution_subtitle(),
    description: m.example_gdp_evolution_description(),
    category: ExampleCategory.HYBRIDS,
    thumbnail: resolveExampleAssetPath('/examples/gdp-evolution-thumb.svg'),
    dataUrl: resolveExampleAssetPath('/examples/data/gdp-growth-2023.csv'),
    baseMapId: 'monde-countries-2024-medium',
    visualizations: [
      {
        type: 'bivariate',
        variable1: 'gdp_per_capita',
        variable2: 'growth_rate',
        palette: 'PurpleGreen'
      }
    ],
    tags: [
      m.example_tag_economy(),
      m.example_tag_gdp(),
      m.example_tag_bivariate()
    ]
  },

  {
    id: 'transport-flows',
    title: m.example_transport_flows_title(),
    subtitle: m.example_transport_flows_subtitle(),
    description: m.example_transport_flows_description(),
    category: ExampleCategory.LINES,
    thumbnail: resolveExampleAssetPath('/examples/transport-flows-thumb.svg'),
    dataUrl: resolveExampleAssetPath('/examples/data/transport-flows.geojson'),
    visualizations: [
      {
        type: 'flow',
        variable: 'volume',
        curved: true
      }
    ],
    tags: [
      m.example_tag_transport(),
      m.example_tag_flows(),
      m.example_tag_lines()
    ]
  }
];

export function getExamplesByCategory(
  category: ExampleCategory
): ExampleProject[] {
  if (category === ExampleCategory.ALL) {
    return EXAMPLE_PROJECTS;
  }
  return EXAMPLE_PROJECTS.filter((example) => example.category === category);
}

export async function loadExampleData(
  example: ExampleProject
): Promise<unknown> {
  try {
    if (!example.dataUrl) {
      throw new Error(m.error_example_data_url_missing());
    }
    const response = await fetch(example.dataUrl);

    if (!response.ok) {
      throw new Error(
        m.error_example_data_load_failed({ status: response.statusText })
      );
    }

    const contentType = response.headers.get('content-type');

    if (contentType?.includes('json')) {
      return await response.json();
    } else {
      return await response.text();
    }
  } catch (error) {
    throw new Error(`${m.error_example_load_failed()}: ${String(error)}`, {
      cause: error
    });
  }
}
