import { ExampleCategory } from '$lib/features/commons/constants/ui.constants';
import { PipelineError } from '$lib/features/commons/pipeline.errors';
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
  { id: ExampleCategory.HYBRIDS, label: 'try_example_hybrids' },
  { id: ExampleCategory.COLLECTION, label: 'try_example_collection' }
];

function exampleProject(
  id: string,
  title: () => string,
  categories: ExampleCategory[]
): ExampleProject {
  return {
    id,
    get title() {
      return title();
    },
    categories,
    thumbnail: resolveStaticAssetUrl(`/examples/${id}.jpg`),
    archiveUrl: resolveStaticAssetUrl(`/examples/${id}.kh`)
  };
}

// Same order and categories as the example gallery of the Khartis
// "Prise en main" page on the Atelier de cartographie website.
export const EXAMPLE_PROJECTS: ExampleProject[] = [
  exampleProject('emissions-co2-2005-2024', m.example_co2_title, [
    ExampleCategory.SYMBOLS,
    ExampleCategory.TEXTS
  ]),
  exampleProject(
    'participation-europeennes-2019-2024',
    m.example_turnout_title,
    [ExampleCategory.POLYGONS]
  ),
  exampleProject('etablissements-scolaires-brest-2026', m.example_brest_title, [
    ExampleCategory.SYMBOLS
  ]),
  exampleProject('ecart-diplomes-superieur-ue-2025', m.example_degrees_title, [
    ExampleCategory.POLYGONS
  ]),
  exampleProject('pauvrete-seine-saint-denis-2023', m.example_poverty_title, [
    ExampleCategory.SYMBOLS,
    ExampleCategory.POLYGONS,
    ExampleCategory.TEXTS,
    ExampleCategory.HYBRIDS
  ]),
  exampleProject(
    'producteurs-energies-fossiles-2014-2024',
    m.example_fossil_title,
    [ExampleCategory.SYMBOLS, ExampleCategory.TEXTS, ExampleCategory.COLLECTION]
  ),
  exampleProject(
    'frequentation-cyclable-hambourg-2025',
    m.example_cycling_title,
    [ExampleCategory.LINES]
  ),
  exampleProject('age-bati-paris-13', m.example_buildings_title, [
    ExampleCategory.POLYGONS,
    ExampleCategory.TEXTS,
    ExampleCategory.HYBRIDS
  ])
];

export function getExamplesByCategory(
  category: ExampleCategory
): ExampleProject[] {
  if (category === ExampleCategory.ALL) {
    return EXAMPLE_PROJECTS;
  }
  return EXAMPLE_PROJECTS.filter((example) =>
    example.categories.includes(category)
  );
}

export async function loadExampleArchive(
  example: ExampleProject
): Promise<File> {
  try {
    const blob = await fetchWithTimeout(
      example.archiveUrl,
      async (response) => {
        if (!response.ok) {
          throw new PipelineError(
            m.error_example_data_load_failed({ status: response.statusText }),
            'EXAMPLE_DATA_LOAD_FAILED',
            {
              exampleId: example.id,
              archiveUrl: example.archiveUrl,
              status: response.status,
              statusText: response.statusText
            }
          );
        }

        return response.blob();
      }
    );
    return new File([blob], `${example.id}.kh`, { type: 'application/zip' });
  } catch (error) {
    if (error instanceof FetchTimeoutError) {
      throw new PipelineError(
        m.error_download_timeout(),
        'EXAMPLE_DATA_DOWNLOAD_TIMEOUT',
        {
          exampleId: example.id,
          archiveUrl: example.archiveUrl,
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
