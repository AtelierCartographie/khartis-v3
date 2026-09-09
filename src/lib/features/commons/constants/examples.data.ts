import { ExampleCategory } from '$lib/features/commons/constants/ui.constants';
import {
  DataValidationError,
  PipelineError
} from '$lib/features/commons/pipeline.errors';
import { resolveStaticAssetUrl } from '$lib/features/commons/utils/static-asset-url';
import {
  FetchTimeoutError,
  fetchWithTimeout
} from '$lib/features/commons/utils/fetch-with-timeout';
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
    get title() {
      return m.example_world_population_title();
    },
    get subtitle() {
      return m.example_world_population_subtitle();
    },
    get description() {
      return m.example_world_population_description();
    },
    category: ExampleCategory.POLYGONS,
    thumbnail: resolveExampleAssetPath('/examples/world-population-thumb.jpg'),
    dataUrl: resolveExampleAssetPath(
      '/examples/data/countries-population-simple.csv'
    ),
    baseMapId: 'monde-countries-2024-medium',
    referenceBasemapId: 'europe-nuts1-2024-medium',
    visualizations: [
      {
        type: 'choropleth',
        variable: 'Population 2023',
        classification: 'quantile',
        classes: 5,
        palette: 'Blues'
      }
    ],
    get tags() {
      return [
        m.example_tag_population(),
        m.example_tag_europe(),
        m.example_tag_choropleth()
      ];
    }
  },

  {
    id: 'european-cities',
    get title() {
      return m.example_european_cities_title();
    },
    get subtitle() {
      return m.example_european_cities_subtitle();
    },
    get description() {
      return m.example_european_cities_description();
    },
    category: ExampleCategory.SYMBOLS,
    thumbnail: resolveExampleAssetPath('/examples/european-cities-thumb.jpg'),
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
    get tags() {
      return [
        m.example_tag_cities(),
        m.example_tag_europe(),
        m.example_tag_symbols()
      ];
    }
  },

  {
    id: 'world-countries-map',
    get title() {
      return m.example_world_countries_title();
    },
    get subtitle() {
      return m.example_world_countries_subtitle();
    },
    get description() {
      return m.example_world_countries_description();
    },
    category: ExampleCategory.POLYGONS,
    thumbnail: resolveExampleAssetPath('/examples/world-countries-thumb.jpg'),
    dataUrl: resolveExampleAssetPath('/examples/data/world-countries.geojson'),
    visualizations: [
      {
        type: 'simple',
        fillColor: '#4A90E2',
        strokeColor: '#FFFFFF',
        strokeWidth: 1
      }
    ],
    get tags() {
      return [
        m.example_tag_world(),
        m.example_tag_countries(),
        m.example_tag_borders()
      ];
    }
  },

  {
    id: 'gdp-evolution',
    get title() {
      return m.example_gdp_evolution_title();
    },
    get subtitle() {
      return m.example_gdp_evolution_subtitle();
    },
    get description() {
      return m.example_gdp_evolution_description();
    },
    category: ExampleCategory.HYBRIDS,
    thumbnail: resolveExampleAssetPath('/examples/gdp-evolution-thumb.jpg'),
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
    get tags() {
      return [
        m.example_tag_economy(),
        m.example_tag_gdp(),
        m.example_tag_bivariate()
      ];
    }
  },

  {
    id: 'transport-flows',
    get title() {
      return m.example_transport_flows_title();
    },
    get subtitle() {
      return m.example_transport_flows_subtitle();
    },
    get description() {
      return m.example_transport_flows_description();
    },
    category: ExampleCategory.LINES,
    thumbnail: resolveExampleAssetPath('/examples/transport-flows-thumb.jpg'),
    dataUrl: resolveExampleAssetPath('/examples/data/transport-flows.geojson'),
    visualizations: [
      {
        type: 'flow',
        variable: 'volume',
        curved: true
      }
    ],
    get tags() {
      return [
        m.example_tag_transport(),
        m.example_tag_flows(),
        m.example_tag_lines()
      ];
    }
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
): Promise<string> {
  try {
    if (!example.dataUrl) {
      throw new DataValidationError(
        m.error_example_data_url_missing(),
        'dataUrl',
        { exampleId: example.id }
      );
    }
    return await fetchWithTimeout(example.dataUrl, async (response) => {
      if (!response.ok) {
        throw new PipelineError(
          m.error_example_data_load_failed({ status: response.statusText }),
          'EXAMPLE_DATA_LOAD_FAILED',
          {
            exampleId: example.id,
            dataUrl: example.dataUrl,
            status: response.status,
            statusText: response.statusText
          }
        );
      }

      return response.text();
    });
  } catch (error) {
    if (error instanceof FetchTimeoutError) {
      throw new PipelineError(
        m.error_download_timeout(),
        'EXAMPLE_DATA_DOWNLOAD_TIMEOUT',
        {
          exampleId: example.id,
          dataUrl: example.dataUrl,
          timeoutMs: error.timeoutMs
        }
      );
    }

    throw new PipelineError(
      `${m.error_example_load_failed()}: ${String(error)}`,
      'EXAMPLE_LOAD_FAILED',
      {
        exampleId: example.id,
        cause: error
      }
    );
  }
}
