import { projectStore } from '$lib/features/commons/store/project.store.svelte';
import { showError } from '$lib/features/commons/utils/notification.utils.svelte';
import { logger, LogCategory } from '$lib/features/commons/utils/logger';
import { m } from '$lib/paraglide/messages.js';
import {
  type MapExportFormat,
  type DataExportFormat,
  type ExportTabType,
  type ExportResolution,
  ExportTab,
  MAP_FORMAT,
  DATA_FORMAT,
  EXPORT_RESOLUTION,
  RESOLUTION_DIMENSIONS
} from '../types';
import {
  exportProject,
  exportMapAsSvg,
  exportMapAsJpg,
  exportMapAsPng,
  exportData,
  ExportError
} from '../services/export.service';

const DEFAULT_FILE_NAME = 'untitled';

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

export function useExportModal(): UseExportModalReturn {
  let isOpen = $state(false);
  let isExporting = $state(false);
  let selectedTab = $state<ExportTabType>(ExportTab.PROJECT);
  let fileName = $state(projectStore.projectName || DEFAULT_FILE_NAME);
  let mapFormat = $state<MapExportFormat>(MAP_FORMAT.SVG);
  let dataFormat = $state<DataExportFormat>(DATA_FORMAT.CSV);
  let resolution = $state<ExportResolution>(EXPORT_RESOLUTION.HD_1080P);

  function open(): void {
    fileName = projectStore.projectName || DEFAULT_FILE_NAME;
    selectedTab = ExportTab.PROJECT;
    logger.info('Export modal opened', LogCategory.EXPORT);
    isOpen = true;
  }

  function close(): void {
    isOpen = false;
  }

  function setTab(tab: ExportTabType): void {
    selectedTab = tab;
  }

  function setFileName(name: string): void {
    fileName = name;
  }

  function setMapFormat(format: MapExportFormat): void {
    mapFormat = format;
  }

  function setDataFormat(format: DataExportFormat): void {
    dataFormat = format;
  }

  function setResolution(res: ExportResolution): void {
    resolution = res;
  }

  async function executeExport(): Promise<void> {
    if (fileName !== projectStore.projectName) {
      projectStore.updateProjectName(fileName);
    }

    isExporting = true;

    try {
      switch (selectedTab) {
        case ExportTab.PROJECT:
          await exportProject(fileName);
          break;

        case ExportTab.MAP: {
          const dims = RESOLUTION_DIMENSIONS[resolution];
          if (mapFormat === MAP_FORMAT.SVG) {
            await exportMapAsSvg(fileName);
          } else if (mapFormat === MAP_FORMAT.PNG) {
            await exportMapAsPng(fileName, dims.width, dims.height);
          } else {
            await exportMapAsJpg(fileName, dims.width, dims.height);
          }
          break;
        }

        case ExportTab.DATA:
          await exportData(fileName, dataFormat);
          break;
      }

      isOpen = false;
    } catch (error) {
      handleExportError(error);
    } finally {
      isExporting = false;
    }
  }

  function handleExportError(error: unknown): void {
    if (error instanceof ExportError) {
      showError(error.title, error.message);
    } else {
      const message =
        error instanceof Error ? error.message : m.export_unknown_error();
      showError(m.export_error(), message);
    }
    logger.error('Export failed', LogCategory.EXPORT, { error });
  }

  return {
    get isOpen() {
      return isOpen;
    },
    get isExporting() {
      return isExporting;
    },
    get selectedTab() {
      return selectedTab;
    },
    get fileName() {
      return fileName;
    },
    get mapFormat() {
      return mapFormat;
    },
    get dataFormat() {
      return dataFormat;
    },
    get resolution() {
      return resolution;
    },

    open,
    close,
    setTab,
    setFileName,
    setMapFormat,
    setDataFormat,
    setResolution,
    executeExport
  };
}
