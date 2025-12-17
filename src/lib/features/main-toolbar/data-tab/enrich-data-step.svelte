<script lang="ts">
  import AdvancedDataTable from '$lib/features/commons/components/advanced-data-table/advanced-data-table.svelte';
  import {
    BasemapLayerType,
    BasemapSource
  } from '$lib/features/commons/constants/ui.constants';
  import { dataTabActions } from '$lib/features/commons/store/data-tab.store.svelte';
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import { GeoColumnDetector } from '$lib/features/commons/utils/geo-detector.utils';
  import { LogCategory, logger } from '$lib/features/commons/utils/logger';
  import type { DatasetResult } from '$lib/features/data-pipeline';
  import { ColumnType, dataPipeline } from '$lib/features/data-pipeline';
  import { Duck } from '$lib/features/duckdb';
  import { basemapCatalogService } from '$lib/features/map/services/basemap-catalog.service.svelte';
  import { osmBasemapStore } from '$lib/features/map/stores/osm-basemap.store.svelte';
  import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';
  import { generateCustomBasemapAttributes } from '$lib/features/map/utils/generate-basemap-attributes';
  import * as m from '$lib/paraglide/messages';
  import {
    Button,
    ComboBox,
    ContentSwitcher,
    FileUploaderDropContainer,
    InlineNotification,
    Switch,
    TextArea,
    TextInput,
    Toggle
  } from 'carbon-components-svelte';
  import {
    Catalog,
    ChevronDown,
    ChevronUp,
    Close,
    CloudDownload,
    Globe,
    MagicWand,
    Renew,
    Upload
  } from 'carbon-icons-svelte';
  import { SvelteMap } from 'svelte/reactivity';
  import MainToolBarHeader from '../components/main-toolbar-header.svelte';
  import {
    BasemapImportDropzone,
    JoinAccordion,
    OSMSelector,
    type JoinStats
  } from './components';
  import BasemapCardVertical from './components/basemap-card-vertical.svelte';
  import SectionHeaderWithIcon from './components/section-header-with-icon.svelte';
  import { computeDatasetJoinStats } from './services/join-stats.service';

  interface GeoComboBoxItem {
    id: number;
    text: string;
    columnName: string;
    isGeo: boolean;
    confidence: number;
  }

  let suggestionsExpanded = $state(true);

  const selectedDataset = $derived(datasetsStore.selectedDataset);

  let joinTabularEnabled = $state(false);
  let overlayBasemapEnabled = $state(false);

  let enrichmentFile = $state<File | null>(null);
  let isUploading = $state(false);
  let uploadError = $state<string | null>(null);
  let enrichmentDataset = $state<DatasetResult | null>(null);
  let pastedDataValue = $state('');
  let onlineUrlValue = $state('');

  let enrichLinkedVariableId = $state<number | undefined>(undefined);

  let geoFileColumnId = $state<number | undefined>(undefined);

  let basemapTabIndex = $state(0);
  let selectedBasemapId = $state<string | undefined>(undefined);

  let basemapImportError = $state<string | null>(null);
  let basemapImportUploading = $state(false);
  let importedCustomBasemap = $state<BasemapMetadata | null>(null);

  const acceptedBasemapExtensions = [
    '.geojson',
    '.json',
    '.shp',
    '.gpkg',
    '.kml',
    '.parquet'
  ];

  let joinStats = $state<JoinStats | null>(null);
  let isComputingJoin = $state(false);
  let isFinalizingJoin = $state(false);

  let joinMappings = $state(new SvelteMap<number, string>());

  const enrichGeoDetection = $derived(enrichmentDataset?.geoDetection);

  const hasOnlyCoordinates = $derived(() => {
    if (!enrichGeoDetection) return false;

    const geoColumns = enrichGeoDetection.geoColumns || [];
    if (geoColumns.length === 0) return false;

    const entityTypes = ['country_name', 'iso2', 'iso3', 'region', 'city'];
    const hasEntityColumn = geoColumns.some((gc) =>
      entityTypes.includes(gc.type)
    );

    const hasCoordinates = geoColumns.some(
      (gc) => gc.type === 'latitude' || gc.type === 'longitude'
    );

    return hasCoordinates && !hasEntityColumn;
  });

  const geoFileColumns = $derived(() => {
    if (!selectedDataset) return [];
    return selectedDataset.columns
      .filter(
        (col) =>
          col.name !== 'geometry' && col.name !== 'geom' && col.name !== '__id'
      )
      .map((col, idx) => ({ id: idx, text: col.name, columnName: col.name }));
  });

  const enrichDataFieldItems = $derived(() => {
    if (!enrichmentDataset) return [];

    return enrichmentDataset.columns
      .filter((col) => col.name !== '__id')
      .map((col, index) => {
        const geoCol = enrichGeoDetection?.geoColumns.find(
          (gc) => gc.columnName === col.name
        );

        let displayText = col.name;
        if (geoCol) {
          const description = GeoColumnDetector.getGeoColumnDescription(geoCol);
          displayText = `${col.name} (${description})`;
        }

        return {
          id: index,
          text: displayText,
          columnName: col.name,
          isGeo: !!geoCol,
          confidence: geoCol?.confidence || 0
        };
      });
  });

  const enrichSuggestedColumn = $derived(() => {
    const suggested = enrichGeoDetection?.suggestedPrimaryGeoColumn;
    if (!suggested) return undefined;

    return enrichDataFieldItems().find(
      (item) => item.columnName === suggested.columnName
    );
  });

  $effect(() => {
    const suggested = enrichSuggestedColumn();
    if (enrichLinkedVariableId === undefined && suggested) {
      enrichLinkedVariableId = suggested.id;
    }
  });

  $effect(() => {
    const hasEnrichCol = enrichLinkedVariableId !== undefined;
    const hasGeoCol = geoFileColumnId !== undefined;
    const hasDataset = enrichmentDataset !== null;
    const hasGeoDataset = selectedDataset !== null;

    if (hasEnrichCol && hasGeoCol && hasDataset && hasGeoDataset) {
      computeEnrichmentJoinStats();
    }
  });

  const basemaps = $derived(basemapCatalogService.basemaps);

  async function handleFileUpload(files: readonly File[]) {
    if (!files || files.length === 0) return;

    const file = files[0];
    const ext = file.name.toLowerCase().split('.').pop();

    if (!['csv', 'tsv', 'txt'].includes(ext || '')) {
      uploadError = 'Format non supporté. Utilisez un fichier CSV ou TSV.';
      return;
    }

    isUploading = true;
    uploadError = null;

    try {
      const result = await dataPipeline.processFile(file);
      enrichmentDataset = result;
      enrichmentFile = file;

      dataTabActions.setEnrichDataState({
        enrichmentDatasetId: result.id,
        isEnrichmentActive: true
      });

      logger.success('Enrichment file loaded', LogCategory.DATA, {
        fileName: file.name,
        rowCount: result.rowCount
      });
    } catch (error) {
      logger.error('Failed to load enrichment file', LogCategory.DATA, error);
      uploadError =
        error instanceof Error ? error.message : 'Erreur lors du chargement';
    } finally {
      isUploading = false;
    }
  }

  async function _handlePasteData() {
    if (!pastedDataValue.trim()) return;

    isUploading = true;
    uploadError = null;

    try {
      const result = await dataPipeline.processPastedData(pastedDataValue);
      enrichmentDataset = result;
      enrichmentFile = null;
      pastedDataValue = '';

      dataTabActions.setEnrichDataState({
        enrichmentDatasetId: result.id,
        isEnrichmentActive: true
      });
    } catch (error) {
      uploadError =
        error instanceof Error ? error.message : 'Erreur lors du traitement';
    } finally {
      isUploading = false;
    }
  }

  async function handleLoadOnlineFile() {
    if (!onlineUrlValue.trim()) return;

    isUploading = true;
    uploadError = null;

    try {
      const result = await dataPipeline.processRemoteFile(onlineUrlValue);
      enrichmentDataset = result;
      enrichmentFile = null;
      onlineUrlValue = '';

      dataTabActions.setEnrichDataState({
        enrichmentDatasetId: result.id,
        isEnrichmentActive: true
      });
    } catch (error) {
      uploadError =
        error instanceof Error ? error.message : 'Erreur lors du chargement';
    } finally {
      isUploading = false;
    }
  }

  function handleRemoveFile() {
    enrichmentDataset = null;
    enrichmentFile = null;
    enrichLinkedVariableId = undefined;
    geoFileColumnId = undefined;
    uploadError = null;
    joinStats = null;

    dataTabActions.setEnrichDataState({
      enrichmentDatasetId: undefined,
      enrichmentColumn: undefined,
      targetColumn: undefined,
      isEnrichmentActive: false
    });
  }

  async function computeEnrichmentJoinStats() {
    if (!enrichmentDataset || !selectedDataset) return;

    const enrichCol = enrichDataFieldItems().find(
      (item) => item.id === enrichLinkedVariableId
    );
    const geoCol = geoFileColumns().find((item) => item.id === geoFileColumnId);

    if (!enrichCol || !geoCol) {
      joinStats = null;
      return;
    }

    isComputingJoin = true;

    try {
      const geoTableName =
        (selectedDataset as { duckdbTableName?: string; tableName?: string })
          .duckdbTableName ||
        (selectedDataset as { tableName?: string }).tableName ||
        selectedDataset.id;

      const stats = await computeDatasetJoinStats({
        sourceTableName: enrichmentDataset.tableName,
        sourceColumn: enrichCol.columnName,
        targetTableName: geoTableName,
        targetColumn: geoCol.columnName
      });

      const targetValues = (await Duck.query(
        `SELECT DISTINCT CAST("${geoCol.columnName}" AS VARCHAR) as val
         FROM "${geoTableName}"
         WHERE "${geoCol.columnName}" IS NOT NULL
         ORDER BY val`,
        { format: 'array' }
      )) as Array<{ val: string }>;

      const allTargetOptions = targetValues.map((v) => v.val).filter(Boolean);

      stats.entities = stats.entities.map((entity) => {
        if (entity.status === 'to_verify') {
          return {
            ...entity,
            basemapOptions: entity.matches?.length
              ? entity.matches
              : allTargetOptions.slice(0, 20),
            selectedMapping: entity.matches?.[0] || undefined
          };
        }
        return entity;
      });

      joinStats = stats;
    } catch (error) {
      logger.error(
        'Failed to compute enrichment join stats',
        LogCategory.DATA,
        error
      );
      joinStats = null;
    } finally {
      isComputingJoin = false;
    }
  }

  function handleSelectBasemap(basemapId: string) {
    selectedBasemapId = basemapId;
    dataTabActions.setBasemapJoinState({
      selectedBasemap: basemapId,
      basemapSource: BasemapSource.CATALOG
    });
  }

  async function handleBasemapImportFile(file: File) {
    basemapImportUploading = true;
    basemapImportError = null;

    try {
      await Duck.register_files([file]);

      const tableNameResult = await Duck.read_geofile(file, {
        tablename: `custom_basemap_${Date.now()}`
      });
      const tableName =
        typeof tableNameResult === 'string'
          ? tableNameResult
          : (tableNameResult?.name ??
            `custom_basemap_${Date.now().toString(36)}`);

      const analysis = await Duck.analyse(tableName);

      const bboxQuery = (await Duck.query(
        `SELECT
          ST_XMin(ST_Extent(geom)) as minX,
          ST_YMin(ST_Extent(geom)) as minY,
          ST_XMax(ST_Extent(geom)) as maxX,
          ST_YMax(ST_Extent(geom)) as maxY
        FROM "${tableName}"`,
        { format: 'array' }
      )) as Array<{
        minX: number | null;
        minY: number | null;
        maxX: number | null;
        maxY: number | null;
      }>;
      const bounds = bboxQuery[0];

      if (
        !bounds ||
        bounds.minX === null ||
        bounds.minY === null ||
        bounds.maxX === null ||
        bounds.maxY === null
      ) {
        throw new Error(m.basemap_import_modal_error_invalid_geometry());
      }

      const geomTypeQuery = (await Duck.query(
        `SELECT DISTINCT ST_GeometryType(geom) as geom_type FROM "${tableName}" LIMIT 1`,
        { format: 'array' }
      )) as Array<{ geom_type?: string }>;
      const geomType = geomTypeQuery[0]?.geom_type?.toLowerCase() ?? 'polygon';

      const layerType: BasemapLayerType = geomType.includes('point')
        ? BasemapLayerType.POINT
        : geomType.includes('line')
          ? BasemapLayerType.LINE
          : BasemapLayerType.POLYGON;

      const customBasemap: BasemapMetadata = {
        file: tableName,
        title: file.name.replace(/\.[^/.]+$/, ''),
        description: m.basemap_custom_description(),
        source: m.basemap_custom_source(),
        date: new Date().getFullYear().toString(),
        bbox: [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY],
        projection: 'EPSG:4326',
        layers: [
          {
            name: 'geom',
            type: layerType,
            count:
              Number(analysis.find((col) => col.name === 'geom')?.count) || 0
          }
        ],
        isCustom: true
      };

      await generateCustomBasemapAttributes(tableName, customBasemap.file);
      basemapCatalogService.addCustomBasemap(customBasemap);
      osmBasemapStore.clear();
      dataTabActions.selectBasemap(customBasemap.file);
      importedCustomBasemap = customBasemap;
      selectedBasemapId = customBasemap.file;

      logger.success('Custom basemap imported', LogCategory.MAP, {
        title: customBasemap.title
      });
    } catch (error) {
      logger.error('Failed to import custom basemap', LogCategory.MAP, error);
      basemapImportError =
        error instanceof Error ? error.message : "Erreur lors de l'import";
    } finally {
      basemapImportUploading = false;
    }
  }

  async function handleBasemapUrlLoad(url: string) {
    basemapImportUploading = true;
    basemapImportError = null;

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const urlParts = url.split('/');
      const fileName = urlParts[urlParts.length - 1] || 'basemap.geojson';
      const file = new File([blob], fileName, {
        type: blob.type || 'application/geo+json'
      });
      await handleBasemapImportFile(file);
    } catch (err) {
      logger.error('Error loading basemap URL', LogCategory.MAP, err);
      basemapImportError =
        err instanceof Error ? err.message : 'Erreur lors du chargement';
    } finally {
      basemapImportUploading = false;
    }
  }

  function handleSelectOSM() {
    const osmBasemap: BasemapMetadata = {
      file: 'osm-standard',
      title: 'OpenStreetMap',
      description: m.osm_modal_description(),
      source: 'OpenStreetMap',
      date: new Date().getFullYear().toString(),
      bbox: [-180, -85, 180, 85],
      projection: 'EPSG:3857',
      layers: [{ name: 'osm', type: BasemapLayerType.POLYGON }]
    };

    osmBasemapStore.setOSMBasemap(osmBasemap);
    dataTabActions.setBasemapJoinState({
      selectedBasemap: osmBasemap.file,
      basemapSource: BasemapSource.OSM
    });
    selectedBasemapId = osmBasemap.file;
    logger.success('OSM basemap selected', LogCategory.MAP);
  }

  function handleMappingChange(index: number, value: string) {
    joinMappings.set(index, value);

    if (joinStats) {
      let toVerifyIndex = 0;
      const updatedEntities = joinStats.entities.map((entity) => {
        if (entity.status === 'to_verify') {
          if (toVerifyIndex === index) {
            toVerifyIndex++;
            return { ...entity, selectedMapping: value };
          }
          toVerifyIndex++;
        }
        return entity;
      });

      joinStats = {
        ...joinStats,
        entities: updatedEntities
      };
    }
  }

  async function handleApplyCorrections() {
    if (!enrichmentDataset || !selectedDataset || !joinStats) return;

    const enrichCol = enrichDataFieldItems().find(
      (item) => item.id === enrichLinkedVariableId
    );
    const geoCol = geoFileColumns().find((item) => item.id === geoFileColumnId);

    if (!enrichCol || !geoCol) return;

    try {
      const corrections: Record<string, string> = {};
      joinStats.entities
        .filter((e) => e.status === 'to_verify' && e.selectedMapping)
        .forEach((entity) => {
          corrections[entity.dataValue] = entity.selectedMapping!;
        });

      logger.info('Applying enrichment corrections', LogCategory.DATA, {
        corrections
      });

      const geoTableName =
        (selectedDataset as { duckdbTableName?: string; tableName?: string })
          .duckdbTableName ||
        (selectedDataset as { tableName?: string }).tableName ||
        selectedDataset.id;

      for (const [oldValue, newValue] of Object.entries(corrections)) {
        await Duck.query(
          `UPDATE "${enrichmentDataset.tableName}" SET "${enrichCol.columnName}" = '${newValue.replace(/'/g, "''")}' WHERE "${enrichCol.columnName}" = '${oldValue.replace(/'/g, "''")}'`,
          { format: 'array' }
        );
      }

      const stats = await computeDatasetJoinStats({
        sourceTableName: enrichmentDataset.tableName,
        sourceColumn: enrichCol.columnName,
        targetTableName: geoTableName,
        targetColumn: geoCol.columnName
      });

      const targetValues = (await Duck.query(
        `SELECT DISTINCT CAST("${geoCol.columnName}" AS VARCHAR) as val
         FROM "${geoTableName}"
         WHERE "${geoCol.columnName}" IS NOT NULL
         ORDER BY val`,
        { format: 'array' }
      )) as Array<{ val: string }>;

      const allTargetOptions = targetValues.map((v) => v.val).filter(Boolean);

      stats.entities = stats.entities.map((entity) => {
        if (entity.status === 'to_verify') {
          return {
            ...entity,
            basemapOptions: entity.matches?.length
              ? entity.matches
              : allTargetOptions.slice(0, 20),
            selectedMapping: entity.matches?.[0] || undefined
          };
        }
        return entity;
      });

      joinStats = stats;

      joinMappings = new SvelteMap<number, string>();

      logger.success('Corrections applied', LogCategory.DATA);

      if (
        joinStats.toVerifyCount === 0 &&
        joinStats.duplicateCount === 0 &&
        joinStats.unrecognizedCount === 0 &&
        joinStats.joinedCount > 0
      ) {
        await handleFinalizeEnrichment();
      }
    } catch (error) {
      logger.error('Failed to apply corrections', LogCategory.DATA, error);
    }
  }

  async function handleFinalizeEnrichment() {
    if (!enrichmentDataset || !selectedDataset) return;

    const enrichCol = enrichDataFieldItems().find(
      (item) => item.id === enrichLinkedVariableId
    );
    const geoCol = geoFileColumns().find((item) => item.id === geoFileColumnId);

    if (!enrichCol || !geoCol) return;

    isFinalizingJoin = true;

    try {
      const geoTableName =
        (selectedDataset as { duckdbTableName?: string; tableName?: string })
          .duckdbTableName ||
        (selectedDataset as { tableName?: string }).tableName ||
        selectedDataset.id;

      const enrichmentColumns = enrichmentDataset.columns
        .filter(
          (col) => col.name !== enrichCol.columnName && col.name !== '__id'
        )
        .map((col) => col.name);

      if (enrichmentColumns.length === 0) {
        logger.warn('No columns to enrich with', LogCategory.DATA);
        isFinalizingJoin = false;
        return;
      }

      logger.info('Finalizing enrichment join', LogCategory.DATA, {
        geoTable: geoTableName,
        enrichTable: enrichmentDataset.tableName,
        enrichColumns: enrichmentColumns
      });

      const enrichColsSelect = enrichmentColumns
        .map((col) => `e."${col}"`)
        .join(', ');

      const enrichedTableName = `${geoTableName}_enriched_${Date.now()}`;

      await Duck.query(
        `CREATE TABLE "${enrichedTableName}" AS
         SELECT g.*, ${enrichColsSelect}
         FROM "${geoTableName}" g
         LEFT JOIN "${enrichmentDataset.tableName}" e
         ON LOWER(CAST(g."${geoCol.columnName}" AS VARCHAR)) = LOWER(CAST(e."${enrichCol.columnName}" AS VARCHAR))`,
        { format: 'array' }
      );

      const newColumns = await Duck.analyse(enrichedTableName);

      const toColumnType = (type: string): ColumnType => {
        if (type === 'numeric' || type === 'number') return ColumnType.NUMBER;
        if (type === 'date') return ColumnType.DATE;
        if (type === 'boolean') return ColumnType.BOOLEAN;
        if (type === 'geometry') return ColumnType.GEOMETRY;
        return ColumnType.TEXT;
      };

      datasetsStore.updateDataset(selectedDataset.id, {
        tableName: enrichedTableName,
        columns: newColumns.map((col) => ({
          name: col.name,
          type: toColumnType(col.type_simple || 'text'),
          values: [],
          stats: {
            name: col.name,
            type: toColumnType(col.type_simple || 'text'),
            count: col.count ?? 0,
            nulls: col.nulls ?? 0,
            uniques: col.uniques ?? 0,
            min: col.min,
            max: col.max,
            mean: typeof col.mean === 'number' ? col.mean : undefined,
            median: typeof col.median === 'number' ? col.median : undefined,
            stdDev: typeof col.stddev === 'number' ? col.stddev : undefined
          }
        }))
      });

      logger.success('Enrichment finalized', LogCategory.DATA, {
        newTable: enrichedTableName,
        addedColumns: enrichmentColumns
      });

      joinTabularEnabled = false;
      enrichmentDataset = null;
      enrichmentFile = null;
      enrichLinkedVariableId = undefined;
      geoFileColumnId = undefined;
      joinStats = null;
      joinMappings = new SvelteMap<number, string>();

      dataTabActions.setEnrichDataState({
        enrichmentDatasetId: undefined,
        enrichmentColumn: undefined,
        targetColumn: undefined,
        isEnrichmentActive: false
      });
    } catch (error) {
      logger.error('Failed to finalize enrichment', LogCategory.DATA, error);
    } finally {
      isFinalizingJoin = false;
    }
  }
</script>

<section id="enrich-data-step">
  <MainToolBarHeader title={m.enrich_step_title()} />

  <p class="kh-help">
    {m.enrich_step_description()}
  </p>

  <!-- Toggle 1: Joindre des données tabulaires -->
  <div class="toggle-section">
    <div class="toggle-header">
      <Toggle
        bind:toggled={joinTabularEnabled}
        labelText=""
        hideLabel
        size="sm"
      />
      <div class="toggle-info">
        <span class="toggle-title">{m.enrich_join_tabular_title()}</span>
        <span class="toggle-description"
          >{m.enrich_join_tabular_description()}</span
        >
      </div>
      <button
        class="toggle-chevron"
        onclick={() => (joinTabularEnabled = !joinTabularEnabled)}
        aria-label="Toggle section"
      >
        {#if joinTabularEnabled}
          <ChevronUp size={20} />
        {:else}
          <ChevronDown size={20} />
        {/if}
      </button>
    </div>

    {#if joinTabularEnabled}
      <div class="toggle-content">
        <!-- Section 1: Importer des données -->
        <h4 class="section-title">{m.enrich_import_section_title()}</h4>

        {#if !enrichmentDataset}
          <div class="import-grid">
            <FileUploaderDropContainer
              labelText={m.enrich_drag_drop_csv()}
              accept={['.csv', '.tsv', '.txt']}
              disabled={isUploading}
              on:change={(e) => handleFileUpload(e.detail)}
            />

            <TextArea
              bind:value={pastedDataValue}
              placeholder={m.enrich_paste_data()}
              rows={6}
            />
          </div>

          <div class="url-section">
            <span class="url-label">{m.enrich_url_label()}</span>
            <div class="url-input-row">
              <TextInput
                bind:value={onlineUrlValue}
                placeholder="https://"
                size="sm"
              />
              <Button
                kind="secondary"
                size="small"
                icon={CloudDownload}
                on:click={handleLoadOnlineFile}
                disabled={!onlineUrlValue.trim() || isUploading}
              >
                {m.enrich_url_load()}
              </Button>
            </div>
          </div>
        {:else}
          <!-- Fichier importé -->
          <div class="file-imported">
            <span class="file-label">{m.enrich_file_imported()}</span>
            <div class="file-row">
              <span class="file-name"
                >{enrichmentFile?.name || 'Données collées'}</span
              >
              <button class="file-remove" onclick={handleRemoveFile}>
                <Close size={16} />
              </button>
            </div>
          </div>

          <!-- Aperçu du tableau -->
          <div class="table-preview">
            <span class="preview-label">{m.enrich_table_preview()}</span>
            <div class="preview-container">
              <AdvancedDataTable
                tableName={enrichmentDataset.tableName}
                showSummaryPlots={false}
                isReadOnly={true}
              />
            </div>
          </div>

          <!-- Warning for coordinate-only files -->
          {#if hasOnlyCoordinates()}
            <InlineNotification
              title="Fichier de coordonnées uniquement"
              subtitle="Ce fichier ne contient que des coordonnées GPS (latitude/longitude). Pour enrichir un fichier géographique, utilisez un fichier avec des identifiants géographiques (pays, régions, codes ISO, etc.)."
              kind="warning"
              lowContrast
              hideCloseButton={false}
            />
          {/if}

          <!-- Section 2: Géolocaliser les données -->
          <h4 class="section-title">{m.enrich_geolocate_section_title()}</h4>

          <p class="section-description">
            {m.enrich_geolocate_description()}
          </p>

          <!-- Detection notification for suggested column -->
          {#if enrichSuggestedColumn()}
            <InlineNotification
              title={m.geo_column_detected_title()}
              subtitle={m.geo_column_detected_subtitle({
                column: enrichSuggestedColumn()!.columnName,
                confidence: Math.round(
                  enrichSuggestedColumn()!.confidence * 100
                ).toString()
              })}
              kind="success"
              lowContrast
              hideCloseButton={false}
            />
          {/if}

          <!-- Column selection for join -->
          <div class="join-columns-section">
            <h5 class="subsection-title">{m.enrich_geo_reference()}</h5>
            <p class="section-description">{m.enrich_choose_multiple()}</p>

            <div class="geo-columns-row">
              <div class="geo-column-select">
                <ComboBox
                  items={geoFileColumns()}
                  selectedId={geoFileColumnId}
                  on:select={(e) => {
                    geoFileColumnId = e.detail.selectedId;
                    dataTabActions.setEnrichDataState({
                      targetColumn: (
                        e.detail.selectedItem as { columnName: string }
                      )?.columnName
                    });
                  }}
                  placeholder={m.enrich_select_column()}
                  size="sm"
                />
                <span class="column-label">{m.enrich_geo_file_label()}</span>
              </div>

              <span class="column-separator">⇄</span>

              <div class="geo-column-select">
                <ComboBox
                  items={enrichDataFieldItems()}
                  selectedId={enrichLinkedVariableId}
                  on:select={(e) => {
                    enrichLinkedVariableId = e.detail.selectedId;
                    dataTabActions.setEnrichDataState({
                      enrichmentColumn: (
                        e.detail.selectedItem as GeoComboBoxItem
                      )?.columnName
                    });
                  }}
                  placeholder={m.enrich_select_column()}
                  size="sm"
                />
                <span class="column-label">{m.enrich_tabular_data_label()}</span
                >
              </div>
            </div>
          </div>

          <!-- Section 3: Vérifier la jointure -->
          {#if joinStats || isComputingJoin}
            <div class="join-assisted-section">
              <SectionHeaderWithIcon
                title={m.section_join_assisted()}
                icon={MagicWand}
              />

              {#if isComputingJoin}
                <div class="computing-join">
                  <span>Calcul de la jointure en cours...</span>
                </div>
              {:else if joinStats}
                <JoinAccordion
                  stats={joinStats}
                  showCorrectionTable={true}
                  linkedVariableName={enrichDataFieldItems().find(
                    (i) => i.id === enrichLinkedVariableId
                  )?.columnName}
                  onMappingChange={handleMappingChange}
                  onApplyCorrections={handleApplyCorrections}
                  onFinalizeJoin={handleFinalizeEnrichment}
                />

                {#if isFinalizingJoin}
                  <div class="finalizing-join">
                    <span>Fusion des données en cours...</span>
                  </div>
                {/if}
              {/if}
            </div>
          {:else}
            <h4 class="section-title">{m.enrich_verify_section_title()}</h4>
            <p class="placeholder-text">
              Sélectionnez les colonnes à joindre pour voir la vérification.
            </p>
          {/if}
        {/if}

        {#if uploadError}
          <InlineNotification
            kind="error"
            title="Erreur"
            subtitle={uploadError}
            hideCloseButton={false}
            on:close={() => (uploadError = null)}
            lowContrast
          />
        {/if}
      </div>
    {/if}
  </div>

  <!-- Toggle 2: Superposer à un fond de carte -->
  <div class="toggle-section">
    <div class="toggle-header">
      <Toggle
        bind:toggled={overlayBasemapEnabled}
        labelText=""
        hideLabel
        size="sm"
      />
      <div class="toggle-info">
        <span class="toggle-title">{m.enrich_overlay_basemap_title()}</span>
        <span class="toggle-description"
          >{m.enrich_overlay_basemap_description()}</span
        >
      </div>
      <button
        class="toggle-chevron"
        onclick={() => (overlayBasemapEnabled = !overlayBasemapEnabled)}
        aria-label="Toggle section"
      >
        {#if overlayBasemapEnabled}
          <ChevronUp size={20} />
        {:else}
          <ChevronDown size={20} />
        {/if}
      </button>
    </div>

    {#if overlayBasemapEnabled}
      <div class="toggle-content">
        <ContentSwitcher bind:selectedIndex={basemapTabIndex}>
          <Switch>
            <Catalog size={16} />
            <span>{m.basemap_catalog()}</span>
          </Switch>
          <Switch>
            <Upload size={16} />
            <span>{m.basemap_import()}</span>
          </Switch>
          <Switch>
            <Globe size={16} />
          </Switch>
        </ContentSwitcher>

        {#if basemapTabIndex === 0}
          <!-- Catalogue -->
          <div class="basemap-section">
            <div class="expandable-section">
              <button
                class="expandable-header"
                onclick={() => (suggestionsExpanded = !suggestionsExpanded)}
              >
                <Renew size={16} />
                <span class="expandable-title">{m.basemap_suggestions()}</span>
                {#if suggestionsExpanded}
                  <ChevronUp size={16} />
                {:else}
                  <ChevronDown size={16} />
                {/if}
              </button>
              {#if suggestionsExpanded}
                <div class="expandable-content">
                  <p class="suggestions-help">{m.basemap_suggestions_desc()}</p>
                  <div class="basemap-grid">
                    {#each basemaps.slice(0, 3) as basemap (basemap.file)}
                      <BasemapCardVertical
                        basemap={basemap}
                        selected={selectedBasemapId === basemap.file}
                        onclick={() => handleSelectBasemap(basemap.file)}
                      />
                    {/each}
                  </div>
                </div>
              {/if}
            </div>
          </div>
        {:else if basemapTabIndex === 1}
          <!-- Import -->
          <div class="basemap-section">
            <BasemapImportDropzone
              acceptedExtensions={acceptedBasemapExtensions}
              isUploading={basemapImportUploading}
              error={basemapImportError}
              importedBasemap={importedCustomBasemap}
              onFileSelect={handleBasemapImportFile}
              onUrlLoad={handleBasemapUrlLoad}
              onClearError={() => (basemapImportError = null)}
            />
          </div>
        {:else}
          <!-- OSM -->
          <div class="basemap-section">
            <OSMSelector
              isActive={osmBasemapStore.isActive}
              onSelectOSM={handleSelectOSM}
            />
          </div>
        {/if}
      </div>
    {/if}
  </div>
</section>

<style>
  #enrich-data-step {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-05);
  }

  .kh-help {
    color: var(--cds-text-02);
    font-size: 0.875rem;
    margin-bottom: var(--cds-spacing-03);
  }

  .toggle-section {
    border: 1px solid var(--cds-border-subtle);
    border-radius: 4px;
    background-color: white;
  }

  .toggle-header {
    display: flex;
    align-items: flex-start;
    gap: var(--cds-spacing-03);
    padding: var(--cds-spacing-04);
    cursor: pointer;
    background-color: white;
  }

  .toggle-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-01);
  }

  .toggle-title {
    font-weight: 600;
    font-size: 0.875rem;
    color: var(--cds-text-01);
  }

  .toggle-description {
    font-size: 0.75rem;
    color: var(--cds-text-02);
  }

  .toggle-chevron {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--cds-icon-01);
    padding: 0;
  }

  .toggle-content {
    padding: 0 var(--cds-spacing-04) var(--cds-spacing-04);
    border-top: 1px solid var(--cds-border-subtle);
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-04);
    background-color: white;
  }

  .section-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--cds-text-01);
    margin-top: var(--cds-spacing-03);
  }

  .section-description {
    font-size: 0.8125rem;
    color: var(--cds-text-02);
    line-height: 1.4;
  }

  .import-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--cds-spacing-04);
  }

  .url-section {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }

  .url-label {
    font-size: 0.75rem;
    color: var(--cds-text-02);
  }

  .url-input-row {
    display: flex;
    gap: var(--cds-spacing-03);
  }

  .url-input-row :global(.bx--text-input-wrapper) {
    flex: 1;
  }

  .file-imported {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }

  .file-label {
    font-size: 0.75rem;
    color: var(--cds-text-02);
  }

  .file-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--cds-spacing-03);
    background-color: var(--cds-layer-02);
    border: 1px solid var(--cds-border-subtle);
    border-radius: 4px;
  }

  .file-name {
    font-size: 0.875rem;
    color: var(--cds-text-01);
  }

  .file-remove {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--cds-icon-01);
    padding: var(--cds-spacing-01);
  }

  .file-remove:hover {
    color: var(--cds-support-error);
  }

  .table-preview {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }

  .preview-label {
    font-size: 0.75rem;
    color: var(--cds-text-02);
  }

  .preview-container {
    border: 1px solid var(--cds-border-subtle);
    border-radius: 4px;
    overflow: hidden;
  }

  .preview-container :global(.advanced-data-table) {
    padding: 0;
  }

  .geo-columns-row {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03);
  }

  .geo-column-select {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }

  .column-label {
    font-size: 0.75rem;
    color: var(--cds-text-02);
  }

  .column-separator {
    font-size: 1.25rem;
    color: var(--cds-text-02);
    margin-top: -1rem;
  }

  .placeholder-text {
    font-size: 0.8125rem;
    color: var(--cds-text-02);
    padding: var(--cds-spacing-04);
    background-color: var(--cds-layer-02);
    border-radius: 4px;
    text-align: center;
  }

  .basemap-section {
    margin-top: var(--cds-spacing-04);
  }

  .suggestions-help {
    font-size: 0.8125rem;
    color: var(--cds-link-primary);
    margin-bottom: var(--cds-spacing-04);
  }

  .basemap-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--cds-spacing-04);
  }

  :global(#enrich-data-step .bx--content-switcher) {
    margin-bottom: 0;
  }

  :global(#enrich-data-step .bx--content-switcher-btn) {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-02);
  }

  .expandable-section {
    border: 1px solid var(--cds-border-subtle);
    border-radius: 4px;
    overflow: hidden;
  }

  .expandable-header {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03);
    width: 100%;
    padding: var(--cds-spacing-03) var(--cds-spacing-04);
    background-color: var(--cds-layer-02);
    border: none;
    cursor: pointer;
    color: var(--cds-text-01);
  }

  .expandable-header:hover {
    background-color: var(--cds-layer-hover-02);
  }

  .expandable-title {
    flex: 1;
    text-align: left;
    font-size: 0.875rem;
    font-weight: 600;
  }

  .expandable-content {
    padding: var(--cds-spacing-04);
    background-color: var(--cds-layer-01);
  }

  .join-columns-section {
    margin-top: var(--cds-spacing-04);
    padding-top: var(--cds-spacing-04);
    border-top: 1px solid var(--cds-border-subtle);
  }

  .subsection-title {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--cds-text-01);
    margin-bottom: var(--cds-spacing-02);
  }

  .join-assisted-section {
    margin-top: var(--cds-spacing-06);
    padding-top: var(--cds-spacing-06);
    border-top: 1px solid var(--cds-border-subtle);
  }

  .computing-join {
    padding: var(--cds-spacing-05);
    text-align: center;
    color: var(--cds-text-02);
    font-style: italic;
  }

  .finalizing-join {
    padding: var(--cds-spacing-05);
    text-align: center;
    color: var(--cds-support-success);
    font-weight: 500;
    background-color: var(--cds-layer-01);
    border-radius: 4px;
    margin-top: var(--cds-spacing-04);
  }
</style>
