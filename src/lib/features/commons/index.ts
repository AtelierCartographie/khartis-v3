// =============================================================================
// Constants
// =============================================================================
export {
  AnnotationKind,
  BasemapLayerType,
  BasemapSource,
  ColorBlindnessType,
  DEFAULT_MARGINS,
  DistanceUnit,
  DrawingType,
  ExampleCategory,
  FileStatus,
  FormatMode,
  GeoreferenceType,
  IGNORED_FILE_PREFIXES,
  InsetMapType,
  JoinStatus,
  LegendPosition,
  LegendTab,
  Orientation,
  OrientationIndicatorStyle,
  PAGE_PRESETS,
  PageModel,
  SHAPEFILE_EXTENSIONS,
  SimplificationTarget,
  StrokeStyle,
  TableViewType,
  ViewMode
} from './constants/ui.constants';

// =============================================================================
// Types
// =============================================================================
export type {
  ColumnTransformation,
  ColumnTransformationType,
  CreateProjectState,
  ExampleProject,
  FileValidation,
  ProjectTab,
  SavedProject,
  UploadedFile
} from './store/create-project.types';

export { DataSourceType, FileType } from './store/create-project.types';

export type { GlobalState, ZoomState } from './types/global';

export {
  StylingTools,
  ToolbarState,
  ToolbarStep,
  VisualizationTools
} from './types/global';

export type { ProjectionFilterId, ProjectionViewMode } from './types/global';

export {
  ButtonKind,
  Position,
  SimplificationLevel,
  SimplificationSource,
  TextAlign
} from './types/enums';

// =============================================================================
// Stores
// =============================================================================
export { basemapStyleStore } from './store/basemap-style.store.svelte';
export {
  createProjectActions,
  createProjectState
} from './store/create-project.store.svelte';
export { dataTabActions, dataTabState } from './store/data-tab.store.svelte';
export { datasetsStore } from './store/datasets.store.svelte';
export {
  globalActions,
  globalState,
  MOBILE_BREAKPOINT
} from './store/global.svelte';
export { mapInstanceStore } from './store/map-instance.store.svelte';
export { projectStore } from './store/project.store.svelte';
export { projectsStore } from './store/projects.store.svelte';
export {
  ClassificationMethod,
  visualizationStore,
  VisualizationType
} from './store/visualization.store.svelte';

export type {
  ClassificationConfig,
  MissingDataConfig,
  VisualizationConfig,
  VisualizationModes
} from './store/visualization.store.svelte';

// =============================================================================
// Services
// =============================================================================
export { dataOrchestratorService } from './services/data-orchestrator.service.svelte';
export { importRollbackService } from './services/import-rollback.service';
export {
  vizSuggester,
  VizSuggesterService,
  type EnrichedColumn,
  type GeometryType,
  type SimplifiedGeometryType,
  type VizSuggestion
} from './services/viz-suggester.service';
export { SEMIO_TYPES } from './utils/semio-detector.utils';

// =============================================================================
// Errors
// =============================================================================
export {
  DataValidationError,
  DuckDBError,
  DuplicateFileError,
  formatError,
  isFatalError,
  isPipelineError,
  NonFatalError,
  ParseError,
  PipelineError
} from './errors/pipeline.errors';

// =============================================================================
// Utils - Logger
// =============================================================================
export { logger, LogCategory, LogLevel } from './utils/logger';

// =============================================================================
// Utils - Format
// =============================================================================
export { formatDate, formatFileSize } from './utils/format.utils';

// =============================================================================
// Utils - Validation
// =============================================================================
export { DataValidator, ProjectValidator } from './utils/validation.utils';
export type { ValidationResult } from './configs/validation.config';
export { STORAGE_LIMITS } from './configs/validation.config';

// =============================================================================
// Utils - Sanitization
// =============================================================================
export {
  escapeIdentifier,
  escapeSqlString,
  sanitizeProjectName,
  sanitizeTextInput
} from './utils/sanitize.utils';

// =============================================================================
// Utils - File Operations
// =============================================================================
export {
  createUploadedFile,
  detectFileType,
  extractDataFromPaste,
  extractUrlsFromInput,
  getFilenameFromUrl,
  groupShapefiles,
  isShapefileComponent,
  isValidUrl,
  readFileContent,
  validateGeospatialFile,
  type ColumnStatSummary
} from './utils/file-import.utils';

export {
  downloadFile,
  exportDatasetToCsv,
  exportProcessedDatasets,
  exportToCsv,
  exportToGeoJson,
  exportToJson,
  generateExportFilename
} from './utils/file-export.utils';

export { FileValidator } from './utils/file-validator.utils';

// =============================================================================
// Utils - String Operations
// =============================================================================
export {
  generateFilename,
  generateProjectFilename,
  sanitizeDisplayName
} from './utils/string.utils';

// =============================================================================
// Utils - Notifications
// =============================================================================
export {
  notificationManager,
  NotificationType,
  showError,
  showSuccess,
  showWarning,
  type NotificationOptions
} from './utils/notification.utils.svelte';

// =============================================================================
// Utils - Debounce
// =============================================================================
export { debounce } from './utils/debounce.utils';

// =============================================================================
// Utils - Color
// =============================================================================
export {
  createColorValue,
  hexToHsl,
  hexToRgb,
  hslToHex,
  type ColorValue,
  type HSLColor
} from './utils/color-utils';

// =============================================================================
// Utils - Environment
// =============================================================================
export { Environment, EnvironmentUtils } from './utils/environment.utils';

// =============================================================================
// Utils - Processing
// =============================================================================
export { ProcessingSemaphore } from './utils/processing-semaphore';

// =============================================================================
// Utils - Deep Validator
// =============================================================================
export {
  DeepDataValidator,
  type DataAnalysisResult
} from './utils/deep-validator.utils';

// =============================================================================
// Utils - Geo Detection
// =============================================================================
export {
  GeoColumnDetector,
  GPS_COLUMN_PATTERNS,
  hasGPSCoordinateColumns,
  type GeoColumnResult,
  type GeoDetectionResult
} from './utils/geo-detector.utils';

// =============================================================================
// Utils - Semio Detection
// =============================================================================
export {
  detectSemioType,
  type SemioDetectionResult,
  type SemioType
} from './utils/semio-detector.utils';

// =============================================================================
// Utils - Click Outside (Svelte Action)
// =============================================================================
export { clickOutside } from './utils/click-outside';

// =============================================================================
// Utils - Store Utilities
// =============================================================================
export {
  createToolStore,
  type BaseActions,
  type ToolStoreResult
} from './utils/store.utils.svelte';

// =============================================================================
// Components
// =============================================================================
export { default as AppLoader } from './components/app-loader.svelte';
export { default as AutocompleteTextarea } from './components/autocomplete-textarea.svelte';
export { default as ColorPicker } from './components/color-picker.svelte';
export { default as CompactNumberInput } from './components/compact-number-input.svelte';
export { default as DeleteConfirmModal } from './components/delete-confirm-modal.svelte';
export { default as DuplicateProjectModal } from './components/duplicate-project-modal.svelte';
export { default as ExpandableSection } from './components/expandable-section.svelte';
export { default as KeyboardShortcuts } from './components/keyboard-shortcuts.svelte';
export { default as NotificationContainer } from './components/notification-container.svelte';
export { default as ProjectCard } from './components/project-card.svelte';
export { default as ProjectionCard } from './components/projection-card.svelte';
export { default as PwaUpdatePrompt } from './components/pwa-update-prompt.svelte';
export { default as Separator } from './components/separator.svelte';
export { default as SimpleCheckbox } from './components/simple-checkbox.svelte';
export { default as ToggleTabs } from './components/toggle-tabs.svelte';

// Advanced Data Table
export { default as AdvancedDataTable } from './components/advanced-data-table/advanced-data-table.svelte';

// Summary Plot
export { default as SummaryPlot } from './components/summary-plot/SummaryPlot.svelte';
