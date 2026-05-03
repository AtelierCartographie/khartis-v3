import {
  ALL_PRIMITIVE_FILTERS,
  PrimitiveFilterType,
  resolveAllowedPrimitiveFilters,
  type PrimitiveFilter,
  type VisualizationConfig
} from '$lib/features/commons/store/visualization.store.svelte';
import {
  COLUMN_TYPE_GEOMETRY,
  GEO_COLUMN_TYPE
} from '$lib/features/commons/constants/data.constants';
import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
import { isLikelyYearColumn } from '../components/year-filter.utils';

export interface DataFieldItem {
  id: number;
  text: string;
  type?: string;
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
  readonly hasYearDimension: boolean;
  readonly availablePrimitiveFilters: PrimitiveFilter[];
  readonly showsSymbolsConfig: boolean;
  readonly showsPolygonsConfig: boolean;
  readonly showsLinesConfig: boolean;
  isNumericDataField(columnName: string | undefined): boolean;
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
    return dataset.columns
      .filter((col) => col.type !== COLUMN_TYPE_GEOMETRY)
      .map((col, id) => ({ id, text: col.name, type: col.type }));
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

  const hasYearDimension = $derived.by(() => {
    const dataset = getSelectedDataset() ?? datasetsStore.selectedDataset;
    if (!dataset?.columns) return false;
    const rows = dataset.originalData?.data ?? dataset.data ?? [];
    return dataset.columns.some((column) => isLikelyYearColumn(column, rows));
  });

  const availablePrimitiveFilters = $derived.by(() => {
    const dataset = getSelectedDataset();
    const viz = deps.getSelectedVisualization();
    if (!viz || !dataset) return ALL_PRIMITIVE_FILTERS;
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

  function isNumericDataField(columnName: string | undefined): boolean {
    if (!columnName) return false;
    return dataFieldItems.some(
      (field) => field.text === columnName && field.type === 'number'
    );
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
    get hasYearDimension() {
      return hasYearDimension;
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
    isNumericDataField,
    getSelectedDataset
  };
}
