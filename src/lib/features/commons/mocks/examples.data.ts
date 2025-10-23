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
    id: 'france-departments',
    title: 'Départements français',
    subtitle: 'Données socio-économiques',
    description:
      'Carte thématique des départements français avec données INSEE',
    category: 'polygons',
    thumbnail: '/examples/france-departments-thumb.png',
    dataUrl: '/examples/data/france-departments-insee.csv',
    baseMapId: 'france-departments',
    visualizations: [
      {
        type: 'categorical',
        variable: 'region',
        palette: 'Set3'
      }
    ],
    tags: ['france', 'départements', 'INSEE']
  },

  {
    id: 'climate-zones',
    title: 'Zones climatiques',
    subtitle: 'Classification Köppen-Geiger',
    description: 'Représentation des zones climatiques mondiales',
    category: 'polygons',
    thumbnail: '/examples/climate-zones-thumb.png',
    dataUrl: '/examples/data/climate-zones.geojson',
    visualizations: [
      {
        type: 'categorical',
        variable: 'climate_type',
        palette: 'Climate'
      }
    ],
    tags: ['climat', 'environnement', 'classification']
  },

  {
    id: 'election-results',
    title: 'Résultats électoraux',
    subtitle: 'Carte par circonscription',
    description:
      'Visualisation des résultats électoraux avec symboles et couleurs',
    category: 'hybrids',
    thumbnail: '/examples/election-results-thumb.png',
    dataUrl: '/examples/data/election-results-2024.csv',
    baseMapId: 'france-circonscriptions',
    visualizations: [
      {
        type: 'categorical',
        variable: 'winner_party',
        palette: 'Political'
      },
      {
        type: 'proportional',
        variable: 'turnout',
        symbol: 'square',
        minSize: 3,
        maxSize: 15
      }
    ],
    tags: ['élections', 'politique', 'France']
  },

  {
    id: 'covid-spread',
    title: 'Propagation COVID-19',
    subtitle: 'Évolution temporelle 2020-2023',
    description:
      'Animation de la propagation du virus avec données temporelles',
    category: 'symbols',
    thumbnail: '/examples/covid-spread-thumb.png',
    dataUrl: '/examples/data/covid-timeline.csv',
    baseMapId: 'world-countries',
    visualizations: [
      {
        type: 'heatmap',
        variable: 'cases_per_100k',
        temporal: true,
        timeVariable: 'date'
      }
    ],
    tags: ['santé', 'COVID-19', 'temporal']
  },

  {
    id: 'urban-density',
    title: 'Densité urbaine',
    subtitle: 'Métropoles mondiales',
    description:
      'Analyse de la densité de population dans les grandes métropoles',
    category: 'symbols',
    thumbnail: '/examples/urban-density-thumb.png',
    dataUrl: '/examples/data/urban-density.csv',
    baseMapId: 'world-cities',
    visualizations: [
      {
        type: 'density',
        variable: 'density_km2',
        radius: 50,
        palette: 'Viridis'
      }
    ],
    tags: ['urbain', 'densité', 'métropoles']
  },

  {
    id: 'trade-routes',
    title: 'Routes commerciales',
    subtitle: 'Commerce international maritime',
    description: 'Principales routes commerciales maritimes mondiales',
    category: 'lines',
    thumbnail: '/examples/trade-routes-thumb.png',
    dataUrl: '/examples/data/trade-routes.geojson',
    visualizations: [
      {
        type: 'flow',
        variable: 'volume_teu',
        curved: true,
        animation: 'pulse'
      }
    ],
    tags: ['commerce', 'maritime', 'flux']
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

export async function loadExampleData(example: ExampleProject): Promise<any> {
  try {
    if (!example.dataUrl) {
      throw new Error('Example data URL is missing');
    }
    const response = await fetch(example.dataUrl);

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
