import { base } from '$app/paths';
import type { ExampleProject } from '../store/create-project.types';

export interface ExampleCategory {
  id: string;
  label: string;
  icon?: string;
}

export const EXAMPLE_CATEGORIES: ExampleCategory[] = [
  { id: 'all', label: 'try_example_all' },
  { id: 'symbols', label: 'try_example_symbols' },
  { id: 'polygons', label: 'try_example_polygons' },
  { id: 'lines', label: 'try_example_lines' },
  { id: 'texts', label: 'try_example_texts' },
  { id: 'hybrids', label: 'try_example_hybrids' }
];

export const EXAMPLE_PROJECTS: ExampleProject[] = [
  {
    id: 'world-population',
    title: 'Population Europe 2023',
    subtitle: 'Carte choroplèthe de la population par pays',
    description:
      'Visualisation de la répartition de la population européenne avec une palette séquentielle',
    category: 'polygons',
    thumbnail: '/examples/world-population-thumb.png',
    dataUrl: '/examples/data/countries-population-simple.csv',
    baseMapId: 'world-countries',
    visualizations: [
      {
        type: 'choropleth',
        variable: 'Population 2023',
        classification: 'quantile',
        classes: 5,
        palette: 'Blues'
      }
    ],
    tags: ['population', 'europe', 'choroplèthe']
  },

  {
    id: 'european-cities',
    title: 'Villes européennes',
    subtitle: 'Symboles proportionnels des principales villes',
    description:
      'Représentation des villes européennes avec des cercles proportionnels à la population',
    category: 'symbols',
    thumbnail: '/examples/european-cities-thumb.png',
    dataUrl: '/examples/data/european-cities.csv',
    baseMapId: 'europe-countries',
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
    tags: ['villes', 'europe', 'symboles']
  },

  {
    id: 'world-countries-map',
    title: 'Carte du monde',
    subtitle: 'Pays du monde avec géométries',
    description:
      'Visualisation des frontières de tous les pays du monde avec données GeoJSON',
    category: 'polygons',
    thumbnail: '/examples/world-countries-thumb.png',
    dataUrl: '/examples/data/world-countries.geojson',
    visualizations: [
      {
        type: 'simple',
        fillColor: '#4A90E2',
        strokeColor: '#FFFFFF',
        strokeWidth: 1
      }
    ],
    tags: ['monde', 'pays', 'frontières']
  },

  {
    id: 'gdp-evolution',
    title: 'Évolution du PIB',
    subtitle: 'Carte bivariée PIB et croissance',
    description:
      'Analyse combinée du PIB par habitant et du taux de croissance',
    category: 'hybrids',
    thumbnail: '/examples/gdp-evolution-thumb.png',
    dataUrl: '/examples/data/gdp-growth-2023.csv',
    baseMapId: 'world-countries',
    visualizations: [
      {
        type: 'bivariate',
        variable1: 'gdp_per_capita',
        variable2: 'growth_rate',
        palette: 'PurpleGreen'
      }
    ],
    tags: ['économie', 'PIB', 'bivariée']
  },

  {
    id: 'transport-flows',
    title: 'Flux de transport',
    subtitle: 'Lignes de transport européennes',
    description: 'Visualisation des flux de transport avec lignes',
    category: 'lines',
    thumbnail: '/examples/transport-flows-thumb.png',
    dataUrl: '/examples/data/transport-flows.geojson',
    visualizations: [
      {
        type: 'flow',
        variable: 'volume',
        curved: true
      }
    ],
    tags: ['transport', 'flux', 'lignes']
  }
];

export function getExamplesByCategory(category: string): ExampleProject[] {
  if (category === 'all') {
    return EXAMPLE_PROJECTS;
  }
  return EXAMPLE_PROJECTS.filter((example) => example.category === category);
}

export function getExampleById(id: string): ExampleProject | undefined {
  return EXAMPLE_PROJECTS.find((example) => example.id === id);
}

export async function loadExampleData(
  example: ExampleProject
): Promise<unknown> {
  try {
    if (!example.dataUrl) {
      throw new Error('Example data URL is missing');
    }
    const url = example.dataUrl.startsWith('/')
      ? `${base}${example.dataUrl}`
      : example.dataUrl;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to load example data: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type');

    if (contentType?.includes('json')) {
      return await response.json();
    } else {
      return await response.text();
    }
  } catch (error) {
    throw new Error(`Error loading example "${example.title}": ${error}`);
  }
}
