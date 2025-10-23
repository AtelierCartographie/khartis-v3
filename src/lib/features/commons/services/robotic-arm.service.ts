import { datasetsStore } from '../store/datasets.store.svelte';
import {
  dataTabActions,
  dataTabState,
  hasJoinErrors,
  totalEntities
} from '../store/data-tab.store.svelte';
import { BasemapCatalogService } from '../../create-project/services/basemap-catalog.service';
import { logger, LogCategory } from '../utils/logger';
import type {
  RoboticArmResult,
  DatasetInfo,
  GeoDetectionResult,
  BasemapSuggestion,
  JoinStatistics,
  AutoConfigurationResult
} from './robotic-arm.types';
import { RoboticArmStatus, RoboticArmCommand } from './robotic-arm.types';
import type { DataColumn } from '../utils/data-pipeline.utils';

interface ColumnInfo {
  name: string;
  type_js: 'string' | 'number' | 'date' | 'boolean' | 'geometry';
}

function convertColumnsToColumnInfo(columns: DataColumn[]): ColumnInfo[] {
  return columns.map((col) => ({
    name: col.name,
    type_js: col.type
  }));
}

function detectGeoColumns(columns: ColumnInfo[]): {
  hasGeoColumns: boolean;
  detectedType?: 'coordinates' | 'location_name' | 'geo_code';
  latitudeColumn?: string;
  longitudeColumn?: string;
  locationColumn?: string;
  geoCodeColumn?: string;
} {
  const latPatterns = /^(lat|latitude|y|ycoord|y_coord)$/i;
  const lonPatterns = /^(lon|long|longitude|x|xcoord|x_coord)$/i;
  const locationPatterns =
    /^(city|ville|town|location|place|address|locality|commune|region|country|pays)$/i;
  const codePatterns =
    /^(iso|iso3|iso2|nuts|nuts_id|code|geo_code|region_code|country_code|code_geo|code_insee)$/i;

  const latitudeCol = columns.find(
    (col) => latPatterns.test(col.name) && col.type_js === 'number'
  )?.name;
  const longitudeCol = columns.find(
    (col) => lonPatterns.test(col.name) && col.type_js === 'number'
  )?.name;
  const locationCol = columns.find(
    (col) => locationPatterns.test(col.name) && col.type_js === 'string'
  )?.name;
  const codeCol = columns.find(
    (col) => codePatterns.test(col.name) && col.type_js === 'string'
  )?.name;

  let detectedType: 'coordinates' | 'location_name' | 'geo_code' | undefined;

  if (latitudeCol && longitudeCol) {
    detectedType = 'coordinates';
  } else if (codeCol) {
    detectedType = 'geo_code';
  } else if (locationCol) {
    detectedType = 'location_name';
  }

  return {
    hasGeoColumns: !!(latitudeCol || longitudeCol || locationCol || codeCol),
    latitudeColumn: latitudeCol,
    longitudeColumn: longitudeCol,
    locationColumn: locationCol,
    geoCodeColumn: codeCol,
    detectedType
  };
}

function detectGeoCodePattern(values: string[]): string | undefined {
  if (values.length === 0) return undefined;

  const sampleSize = Math.min(10, values.length);
  const samples = values
    .slice(0, sampleSize)
    .filter((v) => v && typeof v === 'string' && v.trim());

  if (samples.length === 0) return undefined;

  const firstValue = samples[0];

  if (/^[A-Z]{2}\d{1,3}$/.test(firstValue)) {
    return 'NUTS';
  }

  if (/^[A-Z]{2,3}$/.test(firstValue)) {
    return 'ISO';
  }

  if (/^(FR|fr)\d{2,5}$/.test(firstValue)) {
    return 'INSEE';
  }

  if (/^\d{2,5}$/.test(firstValue)) {
    return 'NUMERIC_CODE';
  }

  return undefined;
}

const MINIMUM_MATCH_SCORE = 40;

export class RoboticArmService {
  private static createResult<T>(
    status: RoboticArmStatus,
    message: string,
    data?: T,
    error?: string
  ): RoboticArmResult<T> {
    return {
      status,
      message,
      data,
      error,
      timestamp: new Date().toISOString()
    };
  }

  static listDatasets(): RoboticArmResult<DatasetInfo[] | undefined> {
    try {
      const datasets = datasetsStore.datasets;
      const selectedId = datasetsStore.selectedDatasetId;

      const datasetInfos: DatasetInfo[] = datasets.map((dataset) => ({
        id: dataset.id,
        name: dataset.name,
        rowCount: dataset.rowCount,
        columnCount: dataset.columns.length,
        hasGeometry: !!dataset.geometry,
        isSelected: dataset.id === selectedId,
        hasModifications: datasetsStore.hasModifications(dataset.id)
      }));

      logger.info('Listed datasets', LogCategory.DATA, {
        count: datasetInfos.length
      });

      return this.createResult(
        RoboticArmStatus.SUCCESS,
        `Found ${datasetInfos.length} dataset(s)`,
        datasetInfos
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to list datasets', LogCategory.DATA, error);
      return this.createResult(
        RoboticArmStatus.ERROR,
        'Failed to list datasets',
        undefined,
        errorMessage
      );
    }
  }

  static selectDataset(
    datasetId: string
  ): RoboticArmResult<DatasetInfo | undefined> {
    try {
      const dataset = datasetsStore.datasets.find((d) => d.id === datasetId);

      if (!dataset) {
        return this.createResult(
          RoboticArmStatus.ERROR,
          `Dataset with ID "${datasetId}" not found`,
          undefined,
          'Dataset not found'
        );
      }

      datasetsStore.selectDataset(datasetId);

      const datasetInfo: DatasetInfo = {
        id: dataset.id,
        name: dataset.name,
        rowCount: dataset.rowCount,
        columnCount: dataset.columns.length,
        hasGeometry: !!dataset.geometry,
        isSelected: true,
        hasModifications: datasetsStore.hasModifications(dataset.id)
      };

      logger.info('Dataset selected', LogCategory.DATA, {
        datasetId,
        name: dataset.name
      });

      return this.createResult(
        RoboticArmStatus.SUCCESS,
        `Dataset "${dataset.name}" selected`,
        datasetInfo
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to select dataset', LogCategory.DATA, error);
      return this.createResult(
        RoboticArmStatus.ERROR,
        'Failed to select dataset',
        undefined,
        errorMessage
      );
    }
  }

  static renameDataset(
    datasetId: string,
    newName: string
  ): RoboticArmResult<DatasetInfo | undefined> {
    try {
      const dataset = datasetsStore.datasets.find((d) => d.id === datasetId);

      if (!dataset) {
        return this.createResult(
          RoboticArmStatus.ERROR,
          `Dataset with ID "${datasetId}" not found`,
          undefined,
          'Dataset not found'
        );
      }

      const oldName = dataset.name;
      const success = datasetsStore.renameDataset(datasetId, newName);

      if (!success) {
        return this.createResult(
          RoboticArmStatus.ERROR,
          'Failed to rename dataset',
          undefined,
          'Invalid name or dataset not found'
        );
      }

      const updatedDataset = datasetsStore.datasets.find(
        (d) => d.id === datasetId
      )!;

      const datasetInfo: DatasetInfo = {
        id: updatedDataset.id,
        name: updatedDataset.name,
        rowCount: updatedDataset.rowCount,
        columnCount: updatedDataset.columns.length,
        hasGeometry: !!updatedDataset.geometry,
        isSelected: updatedDataset.id === datasetsStore.selectedDatasetId,
        hasModifications: datasetsStore.hasModifications(updatedDataset.id)
      };

      logger.info('Dataset renamed', LogCategory.DATA, { oldName, newName });

      return this.createResult(
        RoboticArmStatus.SUCCESS,
        `Dataset renamed from "${oldName}" to "${newName}"`,
        datasetInfo
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to rename dataset', LogCategory.DATA, error);
      return this.createResult(
        RoboticArmStatus.ERROR,
        'Failed to rename dataset',
        undefined,
        errorMessage
      );
    }
  }

  static resetDataset(
    datasetId: string
  ): RoboticArmResult<DatasetInfo | undefined> {
    try {
      const dataset = datasetsStore.datasets.find((d) => d.id === datasetId);

      if (!dataset) {
        return this.createResult(
          RoboticArmStatus.ERROR,
          `Dataset with ID "${datasetId}" not found`,
          undefined,
          'Dataset not found'
        );
      }

      if (!datasetsStore.hasModifications(datasetId)) {
        return this.createResult(
          RoboticArmStatus.WARNING,
          `Dataset "${dataset.name}" has no modifications to reset`,
          undefined
        );
      }

      const success = datasetsStore.resetDataset(datasetId);

      if (!success) {
        return this.createResult(
          RoboticArmStatus.ERROR,
          'Failed to reset dataset',
          undefined,
          'No original data available'
        );
      }

      const resetDataset = datasetsStore.datasets.find(
        (d) => d.id === datasetId
      )!;

      const datasetInfo: DatasetInfo = {
        id: resetDataset.id,
        name: resetDataset.name,
        rowCount: resetDataset.rowCount,
        columnCount: resetDataset.columns.length,
        hasGeometry: !!resetDataset.geometry,
        isSelected: resetDataset.id === datasetsStore.selectedDatasetId,
        hasModifications: false
      };

      logger.info('Dataset reset', LogCategory.DATA, {
        datasetId,
        name: dataset.name
      });

      return this.createResult(
        RoboticArmStatus.SUCCESS,
        `Dataset "${dataset.name}" reset to original state`,
        datasetInfo
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to reset dataset', LogCategory.DATA, error);
      return this.createResult(
        RoboticArmStatus.ERROR,
        'Failed to reset dataset',
        undefined,
        errorMessage
      );
    }
  }

  static autoDetectGeo(
    datasetId?: string
  ): RoboticArmResult<GeoDetectionResult | undefined> {
    try {
      const targetDataset = datasetId
        ? datasetsStore.datasets.find((d) => d.id === datasetId)
        : datasetsStore.selectedDataset;

      if (!targetDataset) {
        return this.createResult(
          RoboticArmStatus.ERROR,
          'No dataset available for geo detection',
          undefined,
          'Dataset not found or not selected'
        );
      }

      const columnInfo = convertColumnsToColumnInfo(targetDataset.columns);
      const detection = detectGeoColumns(columnInfo);

      let geoCodePattern: string | undefined;
      if (detection.geoCodeColumn) {
        const values = datasetsStore.getColumnValues(
          targetDataset.id,
          detection.geoCodeColumn
        );
        geoCodePattern = detectGeoCodePattern(values as string[]);
      }

      const result: GeoDetectionResult = {
        hasGeoColumns: detection.hasGeoColumns,
        detectedType: detection.detectedType,
        latitudeColumn: detection.latitudeColumn,
        longitudeColumn: detection.longitudeColumn,
        locationColumn: detection.locationColumn,
        geoCodeColumn: detection.geoCodeColumn,
        geoCodePattern
      };

      logger.info('Geo detection completed', LogCategory.DATA, result);

      if (!detection.hasGeoColumns) {
        return this.createResult(
          RoboticArmStatus.WARNING,
          'No geographic columns detected in dataset',
          result
        );
      }

      return this.createResult(
        RoboticArmStatus.SUCCESS,
        `Detected ${detection.detectedType} columns`,
        result
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to detect geo columns', LogCategory.DATA, error);
      return this.createResult(
        RoboticArmStatus.ERROR,
        'Failed to detect geographic columns',
        undefined,
        errorMessage
      );
    }
  }

  static configureGeolocation(
    geoReference: 'entities' | 'coordinates',
    linkedVariable?: number | string,
    linkedVariableName?: string
  ): RoboticArmResult<void> {
    try {
      const updates: Partial<typeof dataTabState.geolocation> = {
        geoReference
      };

      if (linkedVariable !== undefined) {
        updates.linkedVariable =
          typeof linkedVariable === 'string'
            ? parseInt(linkedVariable, 10)
            : linkedVariable;
      }

      if (linkedVariableName !== undefined) {
        updates.linkedVariableName = linkedVariableName;
      }

      dataTabActions.setGeolocationState(updates);

      logger.info('Geolocation configured', LogCategory.DATA, updates);

      return this.createResult(
        RoboticArmStatus.SUCCESS,
        `Geolocation configured as ${geoReference}`
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to configure geolocation', LogCategory.DATA, error);
      return this.createResult(
        RoboticArmStatus.ERROR,
        'Failed to configure geolocation',
        undefined,
        errorMessage
      );
    }
  }

  static async suggestBasemap(
    datasetId?: string
  ): Promise<RoboticArmResult<BasemapSuggestion[] | undefined>> {
    try {
      const targetDataset = datasetId
        ? datasetsStore.datasets.find((d) => d.id === datasetId)
        : datasetsStore.selectedDataset;

      if (!targetDataset) {
        return this.createResult(
          RoboticArmStatus.ERROR,
          'No dataset available for basemap suggestion',
          undefined,
          'Dataset not found or not selected'
        );
      }

      const columnInfo = convertColumnsToColumnInfo(targetDataset.columns);
      const detection = detectGeoColumns(columnInfo);
      let geoCodePattern: string | undefined;

      if (detection.geoCodeColumn) {
        const values = datasetsStore.getColumnValues(
          targetDataset.id,
          detection.geoCodeColumn
        );
        geoCodePattern = detectGeoCodePattern(values as string[]);
      }

      const suggestions =
        await BasemapCatalogService.suggestBasemaps(geoCodePattern);

      const filteredSuggestions = suggestions
        .filter((s) => s.matchScore >= MINIMUM_MATCH_SCORE)
        .slice(0, 3);

      const basemapSuggestions: BasemapSuggestion[] = filteredSuggestions.map(
        (s) => ({
          basemapFile: s.basemap.file,
          basemapTitle: s.basemap.title,
          matchScore: Math.round(s.matchScore),
          description: s.basemap.description
        })
      );

      logger.info('Basemap suggestions generated', LogCategory.DATA, {
        count: basemapSuggestions.length,
        suggestions: basemapSuggestions
      });

      if (basemapSuggestions.length === 0) {
        return this.createResult(
          RoboticArmStatus.WARNING,
          'No suitable basemap suggestions found',
          []
        );
      }

      return this.createResult(
        RoboticArmStatus.SUCCESS,
        `Found ${basemapSuggestions.length} basemap suggestion(s)`,
        basemapSuggestions
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to suggest basemap', LogCategory.DATA, error);
      return this.createResult(
        RoboticArmStatus.ERROR,
        'Failed to suggest basemap',
        undefined,
        errorMessage
      );
    }
  }

  static selectBasemap(basemapId: string): RoboticArmResult<void> {
    try {
      dataTabActions.selectBasemap(basemapId);

      logger.info('Basemap selected', LogCategory.DATA, { basemapId });

      return this.createResult(
        RoboticArmStatus.SUCCESS,
        `Basemap "${basemapId}" selected`
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to select basemap', LogCategory.DATA, error);
      return this.createResult(
        RoboticArmStatus.ERROR,
        'Failed to select basemap',
        undefined,
        errorMessage
      );
    }
  }

  static applyJoinCorrections(): RoboticArmResult<void> {
    try {
      dataTabActions.applyCorrections();

      logger.info('Join corrections applied', LogCategory.DATA);

      return this.createResult(
        RoboticArmStatus.SUCCESS,
        'Join corrections applied successfully'
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to apply join corrections', LogCategory.DATA, error);
      return this.createResult(
        RoboticArmStatus.ERROR,
        'Failed to apply join corrections',
        undefined,
        errorMessage
      );
    }
  }

  static getJoinStatistics(): RoboticArmResult<JoinStatistics | undefined> {
    try {
      const stats: JoinStatistics = {
        joinedEntities: dataTabState.basemapJoin.joinedEntities,
        entitiesToVerify: dataTabState.basemapJoin.entitiesToVerify,
        duplicateEntities: [...dataTabState.basemapJoin.duplicateEntities],
        unrecognizedEntities: [
          ...dataTabState.basemapJoin.unrecognizedEntities
        ],
        totalEntities: totalEntities(),
        successRate:
          totalEntities() > 0
            ? Math.round(
                (dataTabState.basemapJoin.joinedEntities / totalEntities()) *
                  100
              )
            : 0,
        hasErrors: hasJoinErrors()
      };

      logger.info('Join statistics retrieved', LogCategory.DATA, stats);

      return this.createResult(
        RoboticArmStatus.SUCCESS,
        `Join success rate: ${stats.successRate}%`,
        stats
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to get join statistics', LogCategory.DATA, error);
      return this.createResult(
        RoboticArmStatus.ERROR,
        'Failed to get join statistics',
        undefined,
        errorMessage
      );
    }
  }

  static async autoConfigurePipeline(
    datasetId?: string
  ): Promise<RoboticArmResult<AutoConfigurationResult | undefined>> {
    try {
      const warnings: string[] = [];
      const result: AutoConfigurationResult = {
        datasetSelected: false,
        geoDetected: false,
        basemapSuggested: false,
        basemapJoined: false,
        warnings
      };

      let targetDataset = datasetId
        ? datasetsStore.datasets.find((d) => d.id === datasetId)
        : datasetsStore.selectedDataset;

      if (!targetDataset && datasetsStore.datasets.length > 0) {
        datasetsStore.selectDataset(datasetsStore.datasets[0].id);
        targetDataset = datasetsStore.datasets[0];
        warnings.push(
          'No dataset selected, automatically selected first dataset'
        );
      }

      if (!targetDataset) {
        return this.createResult(
          RoboticArmStatus.ERROR,
          'No datasets available for auto-configuration',
          result,
          'No datasets found'
        );
      }

      result.datasetSelected = true;

      const geoDetectionResult = this.autoDetectGeo(targetDataset.id);
      if (
        geoDetectionResult.status === RoboticArmStatus.SUCCESS &&
        geoDetectionResult.data
      ) {
        result.geoDetected = true;
        result.geoType = geoDetectionResult.data.detectedType;

        if (geoDetectionResult.data.detectedType === 'coordinates') {
          this.configureGeolocation('coordinates');
        } else if (
          geoDetectionResult.data.detectedType === 'location_name' ||
          geoDetectionResult.data.detectedType === 'geo_code'
        ) {
          this.configureGeolocation('entities');
        }
      } else {
        warnings.push('Geographic columns not detected automatically');
      }

      const basemapSuggestionResult = await this.suggestBasemap(
        targetDataset.id
      );
      if (
        basemapSuggestionResult.status === RoboticArmStatus.SUCCESS &&
        basemapSuggestionResult.data &&
        basemapSuggestionResult.data.length > 0
      ) {
        result.basemapSuggested = true;
        const topSuggestion = basemapSuggestionResult.data[0];

        this.selectBasemap(topSuggestion.basemapFile);
        result.basemapSelected = topSuggestion.basemapFile;
        result.basemapJoined = true;

        const joinStats = this.getJoinStatistics();
        if (joinStats.data) {
          result.joinStats = joinStats.data;

          if (joinStats.data.hasErrors) {
            warnings.push(
              `Join has ${joinStats.data.entitiesToVerify} entities to verify`
            );
          }
        }
      } else {
        warnings.push('No suitable basemap suggestions found');
      }

      result.warnings = warnings;

      logger.info('Auto-configuration completed', LogCategory.DATA, result);

      return this.createResult(
        RoboticArmStatus.SUCCESS,
        'Auto-configuration completed',
        result
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      logger.error(
        'Failed to auto-configure pipeline',
        LogCategory.DATA,
        error
      );
      return this.createResult(
        RoboticArmStatus.ERROR,
        'Failed to auto-configure pipeline',
        undefined,
        errorMessage
      );
    }
  }

  static async executeCommand(
    command: RoboticArmCommand,
    params?: Record<string, unknown>
  ): Promise<RoboticArmResult<unknown>> {
    logger.info('Executing robotic arm command', LogCategory.DATA, {
      command,
      params
    });

    try {
      switch (command) {
        case RoboticArmCommand.LIST_DATASETS:
          return this.listDatasets();

        case RoboticArmCommand.SELECT_DATASET:
          if (!params?.datasetId || typeof params.datasetId !== 'string') {
            return this.createResult(
              RoboticArmStatus.ERROR,
              'Missing or invalid datasetId parameter',
              undefined,
              'datasetId is required'
            );
          }
          return this.selectDataset(params.datasetId);

        case RoboticArmCommand.RENAME_DATASET:
          if (
            !params?.datasetId ||
            typeof params.datasetId !== 'string' ||
            !params?.newName ||
            typeof params.newName !== 'string'
          ) {
            return this.createResult(
              RoboticArmStatus.ERROR,
              'Missing or invalid parameters',
              undefined,
              'datasetId and newName are required'
            );
          }
          return this.renameDataset(params.datasetId, params.newName);

        case RoboticArmCommand.RESET_DATASET:
          if (!params?.datasetId || typeof params.datasetId !== 'string') {
            return this.createResult(
              RoboticArmStatus.ERROR,
              'Missing or invalid datasetId parameter',
              undefined,
              'datasetId is required'
            );
          }
          return this.resetDataset(params.datasetId);

        case RoboticArmCommand.AUTO_DETECT_GEO:
          return this.autoDetectGeo(params?.datasetId as string | undefined);

        case RoboticArmCommand.CONFIGURE_GEOLOCATION:
          if (
            !params?.geoReference ||
            (params.geoReference !== 'entities' &&
              params.geoReference !== 'coordinates')
          ) {
            return this.createResult(
              RoboticArmStatus.ERROR,
              'Missing or invalid geoReference parameter',
              undefined,
              'geoReference must be "entities" or "coordinates"'
            );
          }
          return this.configureGeolocation(
            params.geoReference as 'entities' | 'coordinates',
            params.linkedVariable as number | string | undefined,
            params.linkedVariableName as string | undefined
          );

        case RoboticArmCommand.SUGGEST_BASEMAP:
          return await this.suggestBasemap(
            params?.datasetId as string | undefined
          );

        case RoboticArmCommand.SELECT_BASEMAP:
          if (!params?.basemapId || typeof params.basemapId !== 'string') {
            return this.createResult(
              RoboticArmStatus.ERROR,
              'Missing or invalid basemapId parameter',
              undefined,
              'basemapId is required'
            );
          }
          return this.selectBasemap(params.basemapId);

        case RoboticArmCommand.APPLY_JOIN_CORRECTIONS:
          return this.applyJoinCorrections();

        case RoboticArmCommand.GET_JOIN_STATS:
          return this.getJoinStatistics();

        case RoboticArmCommand.AUTO_CONFIGURE_PIPELINE:
          return await this.autoConfigurePipeline(
            params?.datasetId as string | undefined
          );

        default:
          return this.createResult(
            RoboticArmStatus.ERROR,
            `Unknown command: ${command}`,
            undefined,
            'Invalid command'
          );
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      logger.error('Command execution failed', LogCategory.DATA, error);
      return this.createResult(
        RoboticArmStatus.ERROR,
        `Command execution failed: ${command}`,
        undefined,
        errorMessage
      );
    }
  }
}
