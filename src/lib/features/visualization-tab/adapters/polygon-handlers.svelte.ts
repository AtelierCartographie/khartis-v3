import {
  PrimitiveFilterType,
  type ClassificationConfig,
  type PolygonPrimitiveConfig,
  type PrimitiveFilter,
  type VisualizationConfig,
  type VisualizationModes,
  getPolygonPrimitive
} from '$lib/features/commons/stores/visualization.store.svelte';
import type { DensityConfig } from '$lib/features/commons/constants/visualization.constants';
import { pickOwnedKeys, pickRenamedKeys } from './pick-owned.utils';
import { createPrimitiveAdapter } from './primitive-adapter.factory';

export interface PolygonHandlersDeps {
  getSelectedVisualization: () => VisualizationConfig | undefined;
  updateSelectedVisualization: (
    updates: Partial<VisualizationConfig>,
    afterUpdate?: (next: VisualizationConfig) => void
  ) => void;
  buildNextPrimitiveFilters: (
    updates: Partial<Record<PrimitiveFilter, boolean>>
  ) => PrimitiveFilter[];
  updatePrimitiveClassificationState: (
    primitive: PrimitiveFilterType,
    updates: Partial<ClassificationConfig>
  ) => void;
  applyPrimitiveMappingUpdate: (
    primitive: PrimitiveFilterType,
    updates: Partial<VisualizationConfig['mapping']>
  ) => void;
  applyPrimitiveStrokeMappingUpdate: (
    primitive: PrimitiveFilterType.POINT | PrimitiveFilterType.POLYGON,
    updates: Partial<VisualizationConfig['mapping']>
  ) => void;
  invertPrimitivePalette: (primitive: PrimitiveFilterType) => void;
  invertPrimitiveStrokePalette: (
    primitive: PrimitiveFilterType.POINT | PrimitiveFilterType.POLYGON
  ) => void;
  ensurePrimitiveClassificationDefaults: (
    primitive: PrimitiveFilterType,
    visualization: VisualizationConfig
  ) => void;
  ensureAutoColumns: (
    primitive: PrimitiveFilterType,
    visualization: VisualizationConfig
  ) => void;
  ensurePrimitiveStrokeClassificationDefaults: (
    primitive: PrimitiveFilterType.POINT | PrimitiveFilterType.POLYGON,
    visualization: VisualizationConfig
  ) => void;
  ensurePrimitiveStrokeAutoColumns: (
    primitive: PrimitiveFilterType.POINT | PrimitiveFilterType.POLYGON,
    visualization: VisualizationConfig
  ) => void;
}

export function createPolygonHandlers(deps: PolygonHandlersDeps) {
  const polygonAdapter = createPrimitiveAdapter<PolygonPrimitiveConfig>(deps, {
    primitive: PrimitiveFilterType.POLYGON,
    getConfig: getPolygonPrimitive,
    buildUpdate: (polygon) => ({ polygon })
  });
  const handlePolygonChange = polygonAdapter.handleChange;

  function handlePolygonStyleChange(
    updates: Partial<VisualizationConfig['style']>
  ): void {
    const polygon = getPolygonPrimitive(deps.getSelectedVisualization());
    if (!polygon) return;

    const passthrough = pickOwnedKeys(updates, [
      'fillColor',
      'strokeColor'
    ] as const);
    const fallbackKeys = [
      'fillOpacity',
      'strokeWidth',
      'strokeOpacity',
      'strokeDashed',
      'strokeDashedPattern'
    ] as const;
    const withFallback = pickOwnedKeys(updates, fallbackKeys, polygon);

    handlePolygonChange({ ...passthrough, ...withFallback });
  }

  function handlePolygonModesChange(
    updates: Partial<VisualizationModes>
  ): void {
    const polygon = getPolygonPrimitive(deps.getSelectedVisualization());
    if (!polygon) return;

    const renamed = pickRenamedKeys<VisualizationModes, PolygonPrimitiveConfig>(
      updates,
      [
        { from: 'fill', to: 'fillMode' },
        { from: 'stroke', to: 'strokeMode' }
      ],
      polygon
    );

    deps.updateSelectedVisualization(
      {
        polygon: { ...polygon, ...renamed }
      },
      (next) => {
        deps.ensurePrimitiveClassificationDefaults(
          PrimitiveFilterType.POLYGON,
          next
        );
        deps.ensureAutoColumns(PrimitiveFilterType.POLYGON, next);
        deps.ensurePrimitiveStrokeClassificationDefaults(
          PrimitiveFilterType.POLYGON,
          next
        );
        deps.ensurePrimitiveStrokeAutoColumns(
          PrimitiveFilterType.POLYGON,
          next
        );
      }
    );
  }

  const handlePolygonMissingDataChange = polygonAdapter.handleMissingDataChange;

  const handlePolygonClassificationChange =
    polygonAdapter.handleClassificationChange;

  const handlePolygonMappingChange = polygonAdapter.handleMappingChange;

  function handlePolygonStrokeMappingChange(
    updates: Partial<VisualizationConfig['mapping']>
  ): void {
    deps.applyPrimitiveStrokeMappingUpdate(
      PrimitiveFilterType.POLYGON,
      updates
    );
  }

  const handlePolygonPaletteInvert = polygonAdapter.handlePaletteInvert;

  function handlePolygonStrokePaletteInvert(): void {
    deps.invertPrimitiveStrokePalette(PrimitiveFilterType.POLYGON);
  }

  function handlePolygonDensityChange(updates: Partial<DensityConfig>): void {
    const viz = deps.getSelectedVisualization();
    deps.updateSelectedVisualization({
      density: {
        ...(viz?.density ?? {}),
        ...updates
      }
    });
  }

  return {
    handlePolygonChange,
    handlePolygonStyleChange,
    handlePolygonModesChange,
    handlePolygonMissingDataChange,
    handlePolygonClassificationChange,
    handlePolygonMappingChange,
    handlePolygonStrokeMappingChange,
    handlePolygonPaletteInvert,
    handlePolygonStrokePaletteInvert,
    handlePolygonDensityChange
  };
}
