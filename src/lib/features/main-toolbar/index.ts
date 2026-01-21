// =============================================================================
// Constants
// =============================================================================
export {
  BASEMAP_COLOR_VALUES,
  BASEMAP_LAYER_CONFIG,
  BasemapCityCategory,
  BasemapCitySymbol,
  BasemapColorId,
  BasemapDottedPattern,
  BasemapRemarquables,
  BasemapRepresentation,
  ColorName,
  DEFAULT_COLORS,
  DiscretizationMethod,
  FillMode,
  FillType,
  LabelPosition,
  LabelStrokeType,
  MissingDataShape,
  PatternType,
  ProportionalType,
  SearchSource,
  ShapeType,
  SLIDER_LIMITS,
  StrokeMode,
  SymbolMode,
  SymbolsType,
  ThicknessMode,
  VISUALIZATION_DEFAULTS,
  VizSubTab
} from './constants';

// =============================================================================
// State
// =============================================================================
export {
  getDerivedToolbarState,
  mainToolbarActions,
  mainToolbarState,
  type MainToolbarState
} from './main-toolbar.state.svelte';

// =============================================================================
// Main Components
// =============================================================================
export { default as MainToolbar } from './main-toolbar.svelte';
export { default as MobileToolbar } from './mobile-toolbar.svelte';

// =============================================================================
// Toolbar Components
// =============================================================================
export { default as MainToolbarHeader } from './components/main-toolbar-header.svelte';
export { default as ToolbarTabs } from './components/toolbar-tabs.svelte';
export { default as AddDataModal } from './components/add-data-modal.svelte';

// =============================================================================
// Data Tab
// =============================================================================
export { default as DataTab } from './data-tab/data-tab.svelte';
export { default as DataControlStep } from './data-tab/data-control-step.svelte';
export { default as GeolocationStep } from './data-tab/geolocation-step.svelte';
export { default as BasemapJoinStep } from './data-tab/basemap-join-step.svelte';
export { default as EnrichDataStep } from './data-tab/enrich-data-step.svelte';

// Data Tab Stores
export { dataTabStore } from './data-tab/data-tab.store.svelte';
export {
  dataToolsStore,
  DataToolType
} from './data-tab/data-tools.store.svelte';

// Data Tab Components
export {
  BasemapImportDropzone,
  JoinAccordion,
  OSMSelector,
  type JoinEntity,
  type JoinStats
} from './data-tab/components';

// =============================================================================
// Visualization Tab
// =============================================================================
export {
  Actions,
  BasemapStyleSelector,
  ChooseVisualization,
  ConfigureVisualization,
  CustomizeBasemap,
  MapProjectionSelector,
  VisualizationTab
} from './visualization-tab';

// Visualization Tab Shared Components
export {
  ColorSelector,
  DiscretizationRow,
  MissingDataSection,
  PalettePreview,
  SectionTitle,
  SliderWithInput,
  ToggleWithLabel
} from './visualization-tab/components/shared';

// Visualization Tab Symbol Components
export {
  SymbolModeCategories,
  SymbolModeProportional,
  SymbolModeUnique,
  type SymbolModeProps,
  type SymbolStyleState
} from './visualization-tab/components/symbols';
