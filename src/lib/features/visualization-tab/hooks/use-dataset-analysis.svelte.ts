import {
  type PrimitiveFilter,
  PrimitiveFilterType,
  resolveAllowedPrimitiveFilters,
  type VisualizationConfig
} from '$lib/features/commons/stores/visualization.store.svelte';
import {
  COLUMN_TYPE_GEOMETRY,
  GEO_COLUMN_TYPE,
  JOINED_BASEMAP_COLUMN
} from '$lib/features/commons/constants/data.constants';
import { datasetsStore } from '$lib/features/commons/stores/datasets.store.svelte';
import { filterVisualizableDataColumns } from '$lib/features/commons/utils/visualization-columns.utils';
import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
import { basemapCatalogService } from '$lib/features/map/services/basemap-catalog.service.svelte';
import * as m from '$lib/paraglide/messages';

export interface DataFieldItem {
  id: number;
  text: string;
  type?: string;
  stats?: { uniques?: number };
}

/** A label field shows `label` in its picker and maps to the column `text`. */
export interface LabelFieldItem extends DataFieldItem {
  label?: string;
}

const NUMERIC_DATA_FIELD_TYPES = new Set(['number', 'numeric']);

export function isNumericDataFieldType(type: string | undefined): boolean {
  return NUMERIC_DATA_FIELD_TYPES.has(type ?? '');
}

export const DATE_DATA_FIELD_TYPE = 'date';

/** How a column can be classed: numeric breaks, calendar breaks on a date, or not at all. */
export type ClassableFieldKind = 'numeric' | 'date';

export function resolveClassableFieldKind(
  type: string | undefined
): ClassableFieldKind | null {
  if (isNumericDataFieldType(type)) return 'numeric';
  if (type === DATE_DATA_FIELD_TYPE) return 'date';
  return null;
}

export interface UseDatasetAnalysisDeps {
  getSelectedVisualization: () => VisualizationConfig | undefined;
}

export interface DatasetAnalysis {
  readonly selectedDataset: ReturnType<
    typeof datasetsStore.datasets.find
  > | null;
  readonly dataFieldItems: DataFieldItem[];
  /** Names of the joined basemap entities, offered as map labels only. */
  readonly basemapLabelFieldItems: LabelFieldItem[];
  readonly hasGeometry: boolean;
  readonly availablePrimitiveFilters: PrimitiveFilter[];
  readonly showsSymbolsConfig: boolean;
  readonly showsPolygonsConfig: boolean;
  readonly showsLinesConfig: boolean;
  getClassableFieldKind(
    columnName: string | undefined
  ): ClassableFieldKind | null;
  getSelectedDataset(): ReturnType<typeof datasetsStore.datasets.find> | null;
}

export function useDatasetAnalysis(
  deps: UseDatasetAnalysisDeps
): DatasetAnalysis {
  function getSelectedDataset() {
    const viz = deps.getSelectedVisualization();
    if (!viz?.datasetId) return null;
    return (
      datasetsStore.datasets.find((dataset) => dataset.id === viz.datasetId) ??
      null
    );
  }

  const dataFieldItems = $derived.by(() => {
    const dataset = getSelectedDataset() ?? datasetsStore.selectedDataset;
    if (!dataset?.columns) return [];
    return filterVisualizableDataColumns(dataset.columns).map((col, id) => ({
      id,
      text: col.name,
      type: col.type,
      stats: col.stats ? { uniques: col.stats.uniques } : undefined
    }));
  });

  const basemapLabelFieldItems = $derived.by((): LabelFieldItem[] => {
    const dataset = getSelectedDataset() ?? datasetsStore.selectedDataset;
    const duckDataset = dataset?.sourceFileId
      ? duckDBOrchestrator.getDatasetBySourceFile(dataset.sourceFileId)
      : null;
    if (!duckDataset?.hasJoinKey || !duckDataset.joinedBasemap) return [];

    const basemap = basemapCatalogService.getBasemapById(
      duckDataset.joinedBasemap
    );
    const firstId = dataFieldItems.length;
    const isBilingual =
      !!basemap?.display_id_fr &&
      !!basemap.display_id_en &&
      basemap.display_id_fr !== basemap.display_id_en;
    if (!isBilingual) {
      return [
        {
          id: firstId,
          text: JOINED_BASEMAP_COLUMN.NAME_FR,
          type: 'string',
          label: m.table_joined_entity_column()
        }
      ];
    }
    return [
      {
        id: firstId,
        text: JOINED_BASEMAP_COLUMN.NAME_FR,
        type: 'string',
        label: m.viz_basemap_entity_name_fr()
      },
      {
        id: firstId + 1,
        text: JOINED_BASEMAP_COLUMN.NAME_EN,
        type: 'string',
        label: m.viz_basemap_entity_name_en()
      }
    ];
  });

  const hasGeometry = $derived.by(() => {
    const dataset = getSelectedDataset() ?? datasetsStore.selectedDataset;
    if (!dataset) return false;

    const duckDataset = dataset.sourceFileId
      ? duckDBOrchestrator.getDatasetBySourceFile(dataset.sourceFileId)
      : null;

    if (
      dataset.geometry ||
      dataset.joinedBasemap ||
      dataset.geoColumn ||
      duckDataset?.joinedBasemap ||
      duckDataset?.gpsMode ||
      dataset.columns?.some((col) => col.type === COLUMN_TYPE_GEOMETRY)
    ) {
      return true;
    }

    const detectedGeoColumns = dataset.geoDetection?.geoColumns ?? [];
    const hasLatitude = detectedGeoColumns.some(
      (column) => column.type === GEO_COLUMN_TYPE.LATITUDE
    );
    const hasLongitude = detectedGeoColumns.some(
      (column) => column.type === GEO_COLUMN_TYPE.LONGITUDE
    );

    return hasLatitude && hasLongitude;
  });

  const availablePrimitiveFilters = $derived.by(() => {
    const dataset = getSelectedDataset();
    const viz = deps.getSelectedVisualization();
    if (!viz || !dataset) return [];
    return resolveAllowedPrimitiveFilters(viz.type, dataset);
  });

  const showsSymbolsConfig = $derived(
    availablePrimitiveFilters.includes(PrimitiveFilterType.POINT)
  );
  const showsPolygonsConfig = $derived(
    availablePrimitiveFilters.includes(PrimitiveFilterType.POLYGON)
  );
  const showsLinesConfig = $derived(
    availablePrimitiveFilters.includes(PrimitiveFilterType.LINE)
  );

  function getClassableFieldKind(
    columnName: string | undefined
  ): ClassableFieldKind | null {
    if (!columnName) return null;
    const field = dataFieldItems.find((item) => item.text === columnName);
    return resolveClassableFieldKind(field?.type);
  }

  return {
    get selectedDataset() {
      return getSelectedDataset();
    },
    get dataFieldItems() {
      return dataFieldItems;
    },
    get basemapLabelFieldItems() {
      return basemapLabelFieldItems;
    },
    get hasGeometry() {
      return hasGeometry;
    },
    get availablePrimitiveFilters() {
      return availablePrimitiveFilters;
    },
    get showsSymbolsConfig() {
      return showsSymbolsConfig;
    },
    get showsPolygonsConfig() {
      return showsPolygonsConfig;
    },
    get showsLinesConfig() {
      return showsLinesConfig;
    },
    getClassableFieldKind,
    getSelectedDataset
  };
}
