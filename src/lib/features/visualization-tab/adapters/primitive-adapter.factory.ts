import {
  type ClassificationConfig,
  type MissingDataConfig,
  type PrimitiveFilter,
  type VisualizationConfig
} from '$lib/features/commons/stores/visualization.store.svelte';

export interface PrimitiveAdapterDeps {
  getSelectedVisualization: () => VisualizationConfig | undefined;
  updateSelectedVisualization: (
    updates: Partial<VisualizationConfig>,
    afterUpdate?: (next: VisualizationConfig) => void
  ) => void;
  buildNextPrimitiveFilters: (
    updates: Partial<Record<PrimitiveFilter, boolean>>
  ) => PrimitiveFilter[];
  updatePrimitiveClassificationState: (
    primitive: PrimitiveFilter,
    updates: Partial<ClassificationConfig>
  ) => void;
  applyPrimitiveMappingUpdate: (
    primitive: PrimitiveFilter,
    updates: Partial<VisualizationConfig['mapping']>
  ) => void;
  invertPrimitivePalette: (primitive: PrimitiveFilter) => void;
}

interface PrimitiveAdapterOptions<Config extends { enabled: boolean }> {
  primitive: PrimitiveFilter;
  getConfig: (
    visualization: VisualizationConfig | undefined
  ) => Config | undefined;
  buildUpdate: (config: Config) => Partial<VisualizationConfig>;
}

export function createPrimitiveAdapter<
  Config extends { enabled: boolean; missingData?: MissingDataConfig }
>(deps: PrimitiveAdapterDeps, options: PrimitiveAdapterOptions<Config>) {
  function handleChange(updates: Partial<Config>): void {
    const config = options.getConfig(deps.getSelectedVisualization());
    if (!config) return;

    const enabledHasUpdate = Object.prototype.hasOwnProperty.call(
      updates,
      'enabled'
    );
    const nextConfig = { ...config, ...updates };

    deps.updateSelectedVisualization({
      ...options.buildUpdate(nextConfig),
      ...(enabledHasUpdate
        ? {
            primitiveFilters: deps.buildNextPrimitiveFilters({
              [options.primitive]: updates.enabled ?? config.enabled
            })
          }
        : {})
    });
  }

  function handleMissingDataChange(updates: Partial<MissingDataConfig>): void {
    const config = options.getConfig(deps.getSelectedVisualization());
    if (!config?.missingData) return;

    handleChange({
      missingData: { ...config.missingData, ...updates }
    } as Partial<Config>);
  }

  function handleClassificationChange(
    updates: Partial<ClassificationConfig>
  ): void {
    deps.updatePrimitiveClassificationState(options.primitive, updates);
  }

  function handleMappingChange(
    updates: Partial<VisualizationConfig['mapping']>
  ): void {
    deps.applyPrimitiveMappingUpdate(options.primitive, updates);
  }

  function handlePaletteInvert(): void {
    deps.invertPrimitivePalette(options.primitive);
  }

  return {
    handleChange,
    handleMissingDataChange,
    handleClassificationChange,
    handleMappingChange,
    handlePaletteInvert
  };
}
