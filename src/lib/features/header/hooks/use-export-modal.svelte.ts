import { projectStore } from '$lib/features/commons/store/project.store.svelte';
import { showError } from '$lib/features/commons/utils/notification.utils.svelte';
import { logger, LogCategory } from '$lib/features/commons/utils/logger';
import { m } from '$lib/paraglide/messages.js';
import {
  type MapExportFormat,
  type DataExportFormat,
  type ExportTabType,
  ExportTab,
  MAP_FORMAT,
  DATA_FORMAT
} from '../types';
import {
  exportProject,
  exportMapAsSvg,
  exportMapAsJpg,
  exportData,
  ExportError
} from '../services/export.service';

export interface UseExportModalReturn {
  readonly isOpen: boolean;
  readonly isExporting: boolean;
  readonly selectedTab: ExportTabType;
  readonly fileName: string;
  readonly mapFormat: MapExportFormat;
  readonly dataFormat: DataExportFormat;

  open: () => void;
  close: () => void;
  setTab: (tab: ExportTabType) => void;
  setFileName: (name: string) => void;
  setMapFormat: (format: MapExportFormat) => void;
  setDataFormat: (format: DataExportFormat) => void;
  executeExport: () => Promise<void>;
}

export function useExportModal(): UseExportModalReturn {
  let isOpen = $state(false);
  let isExporting = $state(false);
  let selectedTab = $state<ExportTabType>(ExportTab.PROJECT);
  let fileName = $state(projectStore.projectName || 'untitled');
  let mapFormat = $state<MapExportFormat>(MAP_FORMAT.SVG);
  let dataFormat = $state<DataExportFormat>(DATA_FORMAT.CSV);

  function open(): void {
    fileName = projectStore.projectName || 'untitled';
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

        case ExportTab.MAP:
          if (mapFormat === MAP_FORMAT.SVG) {
            await exportMapAsSvg(fileName);
          } else {
            await exportMapAsJpg(fileName);
          }
          break;

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

    open,
    close,
    setTab,
    setFileName,
    setMapFormat,
    setDataFormat,
    executeExport
  };
}
