import {
  PrimitiveFilterType,
  resolveAllowedPrimitiveFilters,
  type PrimitiveFilter,
  type VisualizationConfig
} from '$lib/features/commons/stores/visualization.store.svelte';
import {
  COLUMN_TYPE_GEOMETRY,
  GEO_COLUMN_TYPE
} from '$lib/features/commons/constants/data.constants';
import { datasetsStore } from '$lib/features/commons/stores/datasets.store.svelte';
import { filterVisualizableDataColumns } from '$lib/features/commons/utils/visualization-columns.utils';
import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';

export interface DataFieldItem {
  id: number;
  text: string;
  type?: string;
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
      type: col.type
    }));
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
