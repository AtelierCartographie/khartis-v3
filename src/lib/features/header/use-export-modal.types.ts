import type {
  MapExportFormat,
  DataExportFormat,
  ExportTabType,
  ExportResolution
} from './types';

export interface UseExportModalReturn {
  readonly isOpen: boolean;
  readonly isExporting: boolean;
  readonly selectedTab: ExportTabType;
  readonly fileName: string;
  readonly mapFormat: MapExportFormat;
  readonly dataFormat: DataExportFormat;
  readonly resolution: ExportResolution;

  open: () => void;
  close: () => void;
  setTab: (tab: ExportTabType) => void;
  setFileName: (name: string) => void;
  setMapFormat: (format: MapExportFormat) => void;
  setDataFormat: (format: DataExportFormat) => void;
  setResolution: (resolution: ExportResolution) => void;
  executeExport: () => Promise<void>;
}
