<script lang="ts">
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import { BasemapLayerType } from '$lib/features/commons/constants/ui.constants';
  import {
    dataTabActions,
    dataTabState
  } from '$lib/features/commons/store/data-tab.store.svelte';
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import { globalActions } from '$lib/features/commons/store/global.svelte';
  import { projectStore } from '$lib/features/commons/store/project.store.svelte';
  import { ToolbarStep } from '$lib/features/commons/types/global';
  import { LogCategory, logger } from '$lib/features/commons/utils/logger';
  import { showError } from '$lib/features/commons/utils/notification.utils.svelte';
  import { normalizeToProcessedDataset } from '$lib/features/data-pipeline/utils/processed-dataset.utils';
  import { Duck, duckDBOrchestrator } from '$lib/features/duckdb';
  import { DEFAULT_OSM_STYLE } from '$lib/features/map/constants';
  import { basemapCatalogService } from '$lib/features/map/services/basemap-catalog.service.svelte';
  import { osmBasemapStore } from '$lib/features/map/stores/osm-basemap.store.svelte';
  import type {
    BasemapMetadata,
    BasemapSuggestion
  } from '$lib/features/map/types/basemap.types';
  import { generateCustomBasemapAttributes } from '$lib/features/map/utils/generate-basemap-attributes';
  import * as m from '$lib/paraglide/messages';
  import {
    Accordion,
    AccordionItem,
    Button,
    ComboBox,
    InlineNotification,
    Select,
    SelectItem,
    Tag,
    TextInput
  } from 'carbon-components-svelte';
  import {
    CheckmarkFilled,
    CloudUpload,
    ErrorFilled,
    Grid as GridIcon,
    Launch,
    List,
    MagicWand,
    Upload,
    WarningAltFilled,
    WarningFilled
  } from 'carbon-icons-svelte';
  import { onMount } from 'svelte';
  import MainToolBarHeader from '../components/main-toolbar-header.svelte';
  import BasemapCardVertical from './components/basemap-card-vertical.svelte';
  import BasemapSuggestionModal from './components/basemap-suggestion-modal.svelte';
  import SectionHeaderWithIcon from './components/section-header-with-icon.svelte';
  import { dataTabStore } from './data-tab.store.svelte';

  let activeTabIndex = $state(0);

  const tabItems = [
    { icon: List, label: m.basemap_catalog(), iconSize: 20 },
    { icon: Upload, label: m.basemap_import(), iconSize: 20 },
    { icon: GridIcon, label: m.basemap_osm(), iconSize: 20 }
  ];

  const basemapSelected = $derived(dataTabState.basemapJoin.selectedBasemap);
  const selectedDataset = $derived(datasetsStore.selectedDataset);
  let basemapSuggestions = $state<BasemapSuggestion[]>([]);

  const joinRows = $derived(dataTabState.basemapJoin.joinMappings);
  const duplicates = $derived(dataTabState.basemapJoin.duplicateEntities);
  const unknowns = $derived(dataTabState.basemapJoin.unrecognizedEntities);
  const joinedCount = $derived(dataTabState.basemapJoin.joinedEntities);
  const toVerifyCount = $derived(dataTabState.basemapJoin.entitiesToVerify);
  const duplicateCount = $derived(
    dataTabState.basemapJoin.duplicateEntities.length
  );
  const unrecognizedCount = $derived(
    dataTabState.basemapJoin.unrecognizedEntities.length
  );

  let joinedExpanded = $state(false);
  let toVerifyExpanded = $state(true);
  let duplicatesExpanded = $state(false);
  let unrecognizedExpanded = $state(false);

  const allBasemaps = $derived(basemapCatalogService.basemaps);

  let importFiles = $state<File[]>([]);
  let importUploading = $state(false);
  let importError = $state<string | null>(null);
  let importUrl = $state('');
  let importedBasemap = $state<BasemapMetadata | null>(null);
  let isDragging = $state(false);
  let fileInputRef = $state<HTMLInputElement | null>(null);
  let showSuggestionModal = $state(false);

  const acceptedExtensions = [
    '.geojson',
    '.json',
    '.shp',
    '.gpkg',
    '.kml',
    '.parquet'
  ];

  let searchQuery = $state('');
  let selectedYear = $state('all');

  let currentJoinAbortController: AbortController | null = null;

  const hasGPSCoordinates = $derived(() => {
    if (!selectedDataset) return false;

    const columns = selectedDataset.columns || [];
    const hasLat = columns.some((col) =>
      /^(lat|latitude|y_coord|y|lat_dd|latitude_dd|geo_lat)$/i.test(col.name)
    );
    const hasLon = columns.some((col) =>
      /^(lon|long|longitude|x_coord|x|lon_dd|longitude_dd|lng|geo_lon)$/i.test(
        col.name
      )
    );

    return hasLat && hasLon;
  });

  const suggestedBasemaps = $derived(() => {
    return basemapSuggestions
      .map((s: BasemapSuggestion) => ({
        basemap: allBasemaps.find((b: BasemapMetadata) => b.file === s.file),
        score: s.matchScore
      }))
      .filter((item) => item.basemap !== undefined) as {
      basemap: BasemapMetadata;
      score: number;
    }[];
  });

  const availableYears = $derived(() => {
    const years = new Set(allBasemaps.map((b: BasemapMetadata) => b.date));
    return Array.from(years).sort((a: string, b: string) => b.localeCompare(a));
  });

  const filteredBasemaps = $derived(() => {
    let results: BasemapMetadata[] = [...allBasemaps];

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      results = results.filter(
        (b) =>
          b.title.toLowerCase().includes(query) ||
          b.description.toLowerCase().includes(query) ||
          b.source.toLowerCase().includes(query)
      );
    }

    if (selectedYear !== 'all') {
      results = results.filter((b) => b.date === selectedYear);
    }

    return results;
  });

  const displayedBasemaps = $derived(() => {
    if (searchQuery.trim() || selectedYear !== 'all') {
      return filteredBasemaps();
    }

    const suggestionIds = new Set(
      suggestedBasemaps().map(
        (s: { basemap: BasemapMetadata; score: number }) => s.basemap.file
      )
    );
    return allBasemaps.filter(
      (b: BasemapMetadata) => !suggestionIds.has(b.file)
    );
  });

  const yearCounts = $derived(() => {
    const counts: Record<string, number> = {};
    allBasemaps.forEach((b: BasemapMetadata) => {
      counts[b.date] = (counts[b.date] || 0) + 1;
    });
    return counts;
  });

  interface SearchComboBoxItem {
    id: string;
    text: string;
    basemap: BasemapMetadata;
  }

  let searchSelectedId = $state<string | undefined>(undefined);

  const searchComboBoxItems = $derived((): SearchComboBoxItem[] => {
    return allBasemaps.map((b: BasemapMetadata, index: number) => ({
      id: `basemap-${index}`,
      text: `${b.title} (${b.date})`,
      basemap: b
    }));
  });

  function handleSearchSelect(
    e: CustomEvent<{ selectedId: string; selectedItem: SearchComboBoxItem }>
  ) {
    if (e.detail.selectedItem) {
      searchQuery = e.detail.selectedItem.basemap.title;
    } else {
      searchQuery = '';
    }
    searchSelectedId = e.detail.selectedId;
  }

  function handleSearchClear() {
    searchQuery = '';
    searchSelectedId = undefined;
  }

  async function handleSelectBasemap(basemap: BasemapMetadata) {
    if (currentJoinAbortController) {
      currentJoinAbortController.abort();
    }
    currentJoinAbortController = new AbortController();
    const abortSignal = currentJoinAbortController.signal;

    osmBasemapStore.clear();
    dataTabActions.selectBasemap(basemap.file);

    projectStore.updateProjectData({
      basemap: {
        id: basemap.file,
        type: basemap.isCustom ? 'custom' : 'catalog',
        data: basemap.isCustom ? { ...basemap } : undefined
      }
    });

    if (selectedDataset && dataTabState.geolocation.linkedVariableName) {
      try {
        const stats = await duckDBOrchestrator.computeJoinStats(
          selectedDataset.id,
          basemap,
          dataTabState.geolocation.linkedVariableName
        );

        if (abortSignal.aborted) {
          logger.debug(
            'Join computation cancelled (basemap changed)',
            LogCategory.MAP
          );
          return;
        }

        dataTabActions.setJoinStats(stats);

        const hasErrors =
          stats.toVerifyCount > 0 ||
          stats.entities.filter((e) => e.status === 'duplicate').length > 0 ||
          stats.entities.filter((e) => e.status === 'unrecognized').length > 0;

        if (!hasErrors && stats.joinedCount > 0) {
          logger.info(
            'Auto-finalizing join - no errors detected',
            LogCategory.MAP,
            { joinedCount: stats.joinedCount }
          );

          try {
            await duckDBOrchestrator.finalizeJoin(
              selectedDataset.id,
              basemap,
              dataTabState.geolocation.linkedVariableName
            );
            dataTabStore.markStepComplete(2);
            logger.success(
              'Join auto-finalized, map should update',
              LogCategory.MAP
            );
          } catch (finalizeError) {
            logger.error(
              'Failed to auto-finalize join',
              LogCategory.MAP,
              finalizeError
            );
            showError(m.join_error_title(), m.join_error_message());
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }
        logger.error('Failed to compute join stats', LogCategory.MAP, error);
        showError(m.join_error_title(), m.join_error_message());
      }
    }
  }

  function handleFileDrop(event: DragEvent) {
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      importFiles = [files[0]];
      handleImportFile();
    }
  }

  function handleFileInputChange(event: Event) {
    const target = event.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      importFiles = [target.files[0]];
      handleImportFile();
    }
  }

  async function handleImportFile() {
    if (importFiles.length === 0) {
      importError = m.basemap_import_modal_error_select_file();
      return;
    }

    const duck = Duck;
    if (!duck) {
      importError = m.basemap_custom_error();
      logger.error(
        'DuckDB not initialized for custom basemap import',
        LogCategory.MAP
      );
      return;
    }

    importUploading = true;
    importError = null;

    try {
      const file = importFiles[0];

      await duck.register_files([file]);

      const tableNameResult = await duck.read_geofile(file, {
        tablename: `custom_basemap_${Date.now()}`
      });
      const tableName =
        typeof tableNameResult === 'string'
          ? tableNameResult
          : (tableNameResult?.name ??
            `custom_basemap_${Date.now().toString(36)}`);

      const analysis = await duck.analyse(tableName);

      const bboxQuery = (await duck.query(
        `
        SELECT
          ST_XMin(ST_Extent(geom)) as minX,
          ST_YMin(ST_Extent(geom)) as minY,
          ST_XMax(ST_Extent(geom)) as maxX,
          ST_YMax(ST_Extent(geom)) as maxY
        FROM "${tableName}"
      `,
        { format: 'array', useProxy: false }
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

      const geomTypeQuery = (await duck.query(
        `
        SELECT DISTINCT ST_GeometryType(geom) as geom_type
        FROM "${tableName}"
        LIMIT 1
      `,
        { format: 'array', useProxy: false }
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
      importedBasemap = customBasemap;

      projectStore.updateProjectData({
        basemap: {
          id: customBasemap.file,
          type: 'custom',
          data: { ...customBasemap }
        }
      });

      if (selectedDataset && dataTabState.geolocation.linkedVariableName) {
        try {
          const stats = await duckDBOrchestrator.computeJoinStats(
            selectedDataset.id,
            customBasemap,
            dataTabState.geolocation.linkedVariableName
          );
          dataTabActions.setJoinStats(stats);
        } catch (error) {
          logger.error('Failed to compute join stats', LogCategory.MAP, error);
          showError(m.join_error_title(), m.join_error_message());
        }
      }
    } catch (err) {
      logger.error('Error importing custom basemap', LogCategory.MAP, err);
      importError =
        err instanceof Error ? err.message : m.basemap_custom_error();
    } finally {
      importUploading = false;
    }
  }

  async function handleLoadUrl() {
    if (!importUrl.trim()) {
      importError = m.basemap_url_error_empty();
      return;
    }

    importUploading = true;
    importError = null;

    try {
      const response = await fetch(importUrl);
      if (!response.ok) {
        throw new Error(
          m.basemap_url_error_load({ status: response.status.toString() })
        );
      }

      const blob = await response.blob();
      const filename = importUrl.split('/').pop() || 'basemap.geojson';
      const file = new File([blob], filename, { type: blob.type });

      importFiles = [file];
      await handleImportFile();
    } catch (err) {
      logger.error('Error loading URL', LogCategory.MAP, err);
      importError =
        err instanceof Error ? err.message : m.basemap_url_error_generic();
    } finally {
      importUploading = false;
    }
  }

  async function handleSelectOSM() {
    if (!hasGPSCoordinates()) {
      return;
    }

    if (!selectedDataset) {
      logger.warn('No dataset selected for OSM basemap', LogCategory.MAP);
      return;
    }

    const osmBasemap: BasemapMetadata = {
      file: `osm_${DEFAULT_OSM_STYLE}_${Date.now()}`,
      title: m.osm_basemap_title({ style: 'OpenStreetMap' }),
      description: m.osm_basemap_description(),
      source: m.osm_basemap_source(),
      date: new Date().getFullYear().toString(),
      bbox: [-180, -90, 180, 90],
      projection: 'EPSG:3857',
      layers: [{ name: 'base', type: BasemapLayerType.POLYGON }],
      isCustom: true
    };

    basemapCatalogService.addCustomBasemap(osmBasemap);
    osmBasemapStore.setOSMBasemap(osmBasemap);
    dataTabActions.selectBasemap(osmBasemap.file);

    projectStore.updateProjectData({
      basemap: {
        id: osmBasemap.file,
        type: 'osm',
        data: { ...osmBasemap }
      }
    });

    try {
      await duckDBOrchestrator.finalizeJoin(selectedDataset.id, osmBasemap, '');
      dataTabStore.markStepComplete(2);
      logger.success('OSM basemap activated with GPS mode', LogCategory.MAP);
    } catch (error) {
      logger.error('Failed to activate OSM GPS mode', LogCategory.MAP, error);
      showError(m.join_error_title(), m.join_error_message());
    }
  }

  function handleSuggestBasemap() {
    showSuggestionModal = true;
  }

  function handleGoToVisualize() {
    globalActions.setNavigationState(ToolbarStep.Visualizations);
  }

  async function handleApplyCorrections() {
    if (!selectedDataset || !dataTabState.geolocation.linkedVariableName)
      return;

    const corrections: Record<string, string> = {};
    dataTabState.basemapJoin.joinMappings.forEach((mapping) => {
      if (
        mapping.selectedMapping &&
        mapping.selectedMapping !== mapping.dataValue
      ) {
        corrections[mapping.dataValue] = mapping.selectedMapping;
      }
    });

    try {
      await duckDBOrchestrator.applyJoinCorrections(
        selectedDataset.id,
        dataTabState.geolocation.linkedVariableName,
        corrections
      );
      dataTabActions.applyCorrections();

      const basemap = allBasemaps.find((b) => b.file === basemapSelected);
      if (basemap) {
        const stats = await duckDBOrchestrator.computeJoinStats(
          selectedDataset.id,
          basemap,
          dataTabState.geolocation.linkedVariableName
        );
        dataTabActions.setJoinStats(stats);
        await handleFinalizeJoin();
      }
    } catch (error) {
      logger.error('Failed to apply corrections', LogCategory.MAP, error);
    }
  }

  async function handleFinalizeJoin() {
    if (!selectedDataset || !dataTabState.geolocation.linkedVariableName)
      return;

    const basemap = allBasemaps.find((b) => b.file === basemapSelected);
    if (!basemap) {
      logger.warn('No basemap selected for join finalization', LogCategory.MAP);
      return;
    }

    try {
      logger.info('Finalizing join to enable map rendering', LogCategory.MAP, {
        datasetId: selectedDataset.id,
        basemap: basemap.file
      });

      await duckDBOrchestrator.finalizeJoin(
        selectedDataset.id,
        basemap,
        dataTabState.geolocation.linkedVariableName
      );

      dataTabStore.markStepComplete(2);

      logger.success('Join finalized, map should update', LogCategory.MAP);
    } catch (error) {
      logger.error('Failed to finalize join', LogCategory.MAP, error);
      showError(m.join_error_title(), m.join_error_message());
    }
  }

  async function loadSuggestions() {
    if (!selectedDataset) return;

    try {
      if (!basemapCatalogService.isLoaded) {
        await basemapCatalogService.loadCatalog();
      }

      const processedDataset = normalizeToProcessedDataset(selectedDataset);
      const suggestions = await basemapCatalogService.getSuggestions(
        processedDataset,
        3,
        dataTabState.geolocation.linkedVariableName
      );
      basemapSuggestions = suggestions;
    } catch (error) {
      logger.error(
        'Failed to load basemap suggestions',
        LogCategory.MAP,
        error
      );
      basemapSuggestions = [];
    }
  }

  onMount(async () => {
    try {
      await basemapCatalogService.loadCatalog();
      await loadSuggestions();

      const savedBasemap = projectStore.currentProject?.data?.basemap;
      if (savedBasemap?.id) {
        dataTabActions.selectBasemap(savedBasemap.id);

        if (
          (savedBasemap.type === 'custom' || savedBasemap.type === 'osm') &&
          savedBasemap.data
        ) {
          const customBasemapData =
            savedBasemap.data as unknown as BasemapMetadata;
          basemapCatalogService.addCustomBasemap(customBasemapData);

          if (savedBasemap.type === 'osm') {
            osmBasemapStore.setOSMBasemap(customBasemapData);
          }
        }

        if (selectedDataset && dataTabState.geolocation.linkedVariableName) {
          const basemap = allBasemaps.find((b) => b.file === savedBasemap.id);
          if (basemap) {
            try {
              const stats = await duckDBOrchestrator.computeJoinStats(
                selectedDataset.id,
                basemap,
                dataTabState.geolocation.linkedVariableName
              );
              dataTabActions.setJoinStats(stats);
            } catch (error) {
              logger.error(
                'Failed to restore join stats',
                LogCategory.MAP,
                error
              );
            }
          }
        }
      }
    } catch (error) {
      logger.error(
        'Failed to initialize basemap catalog',
        LogCategory.MAP,
        error
      );
    }
  });

  $effect(() => {
    void dataTabState.geolocation.linkedVariableName;
    if (selectedDataset) {
      loadSuggestions();
    }
  });

  let previousDatasetId: string | null = null;
  $effect(() => {
    const currentDatasetId = selectedDataset?.id ?? null;

    if (previousDatasetId !== null && currentDatasetId !== previousDatasetId) {
      if (osmBasemapStore.isActive) {
        logger.info(
          'Clearing OSM basemap due to dataset change',
          LogCategory.MAP,
          {
            previousDatasetId,
            newDatasetId: currentDatasetId
          }
        );
        osmBasemapStore.clear();
        dataTabActions.selectBasemap('');
      }
    }

    previousDatasetId = currentDatasetId;
  });
</script>

{#snippet joinAssistedSection()}
  {#if basemapSelected}
    <div class="join-assisted-section">
      <SectionHeaderWithIcon
        title={m.section_join_assisted()}
        icon={MagicWand}
      />

      <div class="join-stats-accordion">
        <Accordion>
          <!-- Joined Entities -->
          <AccordionItem
            open={joinedExpanded}
            on:click={() => (joinedExpanded = !joinedExpanded)}
          >
            <svelte:fragment slot="title">
              <div class="accordion-title">
                <CheckmarkFilled size={20} class="icon-success" />
                <span>{m.join_entities_joined({ count: joinedCount })}</span>
              </div>
            </svelte:fragment>
            <p class="helper-text">
              {m.join_entities_joined_desc()}
            </p>
          </AccordionItem>

          <!-- To Verify Entities -->
          <AccordionItem
            open={toVerifyExpanded}
            on:click={() => (toVerifyExpanded = !toVerifyExpanded)}
          >
            <svelte:fragment slot="title">
              <div class="accordion-title">
                <WarningFilled size={20} class="icon-warning" />
                <span>{m.join_entities_to_verify({ count: toVerifyCount })}</span>
              </div>
            </svelte:fragment>
            <div class="join-table">
              <div class="head">
                <div class="col a">
                  {m.join_data_column()}
                  {#if dataTabState.geolocation.linkedVariableName}
                    <Tag type="cyan" size="sm"
                      >{dataTabState.geolocation.linkedVariableName}</Tag
                    >
                  {/if}
                </div>
                <div class="col b">{m.join_basemap_column()}</div>
              </div>
              {#each joinRows as row, i (i)}
                <div class="join-row">
                  <div class="col a">{row.dataValue}</div>
                  <div class="col eq">=</div>
                  <div class="col b">
                    <Select
                      id={`join-${i}`}
                      labelText=""
                      selected={row.selectedMapping}
                      on:change={(e) => {
                        const target = e.target as HTMLSelectElement;
                        const selectedValue =
                          target?.value || row.selectedMapping;
                        dataTabActions.updateJoinMapping(i, selectedValue);
                      }}
                      size="xl"
                    >
                      {#each row.basemapOptions as opt (opt)}
                        <SelectItem value={opt} text={opt} />
                      {/each}
                    </Select>
                  </div>
                </div>
              {/each}
            </div>
          </AccordionItem>

          <!-- Duplicate Entities -->
          <AccordionItem
            open={duplicatesExpanded}
            on:click={() => (duplicatesExpanded = !duplicatesExpanded)}
          >
            <svelte:fragment slot="title">
              <div class="accordion-title">
                <WarningAltFilled size={20} class="icon-error" />
                <span>{m.join_entities_duplicate({ count: duplicateCount })}</span>
              </div>
            </svelte:fragment>
            {#if duplicateCount > 0}
              <ul class="issues-list">
                {#each duplicates as d, idx (idx)}
                  <li>{d}</li>
                {/each}
              </ul>
            {/if}
          </AccordionItem>

          <!-- Unrecognized Entities -->
          <AccordionItem
            open={unrecognizedExpanded}
            on:click={() => (unrecognizedExpanded = !unrecognizedExpanded)}
          >
            <svelte:fragment slot="title">
              <div class="accordion-title">
                <ErrorFilled size={20} class="icon-error" />
                <span>{m.join_entities_unrecognized({ count: unrecognizedCount })}</span>
              </div>
            </svelte:fragment>
            {#if unrecognizedCount > 0}
              <ul class="issues-list">
                {#each unknowns as u, idx (idx)}
                  <li>{u}</li>
                {/each}
              </ul>
            {/if}
          </AccordionItem>
        </Accordion>
      </div>

      {#if toVerifyCount > 0 || duplicateCount > 0 || unrecognizedCount > 0}
        <InlineNotification
          title={m.join_error_detected_title()}
          subtitle={m.join_error_detected_subtitle()}
          kind="warning"
          lowContrast
          hideCloseButton={false}
        />
      {/if}

      {#if toVerifyCount > 0}
        <div class="correction">
          <div class="title">{m.join_correction_title()}</div>
          <p>
            {m.join_correction_desc()}
          </p>
          <Button
            kind="secondary"
            size="small"
            on:click={handleApplyCorrections}
            >{m.join_correction_button()}</Button
          >
        </div>
      {:else if joinedCount > 0 && basemapSelected}
        <div class="validation">
          <div class="title">{m.join_validation_title()}</div>
          <p>
            {m.join_validation_desc()}
          </p>
          <Button kind="primary" size="small" on:click={handleFinalizeJoin}
            >{m.join_validation_button()}</Button
          >
        </div>
      {/if}
    </div>
  {/if}
{/snippet}

<section id="basemap-join-step">
  <MainToolBarHeader title={m.basemap_step_title()} />

  <p class="kh-help">
    {m.basemap_step_description()}
  </p>

  <div class="basemap-tabs-wrapper">
    <ToggleTabs
      activeIndex={activeTabIndex}
      items={tabItems}
      onChange={(index) => (activeTabIndex = index)}
    />
  </div>

  <!-- Tab 0: Catalogue -->
  {#if activeTabIndex === 0}
    <div class="tab-content">
      <ExpandableSection title={m.section_suggestions()} defaultOpen={true}>
        {#snippet icon()}
          <MagicWand size={16} />
        {/snippet}
        {#if suggestedBasemaps().length > 0}
          <p class="kh-help section-subtitle">
            {m.basemap_suggestions_desc()}
          </p>
          <div class="suggestions-scroll-container">
            <div class="suggestions-scroll">
              {#each suggestedBasemaps() as { basemap, score } (basemap.file)}
                <BasemapCardVertical
                  basemap={basemap}
                  matchScore={score}
                  selected={basemap.file === basemapSelected}
                  onclick={() => handleSelectBasemap(basemap)}
                />
              {/each}
            </div>
          </div>
        {:else}
          <InlineNotification
            kind="info"
            title={m.basemap_no_suggestions_title()}
            subtitle={m.basemap_no_suggestions_subtitle()}
            hideCloseButton={true}
            lowContrast
          />
        {/if}
      </ExpandableSection>

      <ExpandableSection
        title={m.basemap_other()}
        defaultOpen={suggestedBasemaps().length === 0}
      >
        {#snippet icon()}
          <List size={16} />
        {/snippet}
        <div class="catalogue-filters">
          <ComboBox
            items={searchComboBoxItems()}
            selectedId={searchSelectedId}
            placeholder={m.basemap_search_placeholder()}
            shouldFilterItem={(item, value) => {
              if (!value) return true;
              const query = value.toLowerCase();
              const basemap = (item as SearchComboBoxItem).basemap;
              return (
                basemap.title.toLowerCase().includes(query) ||
                basemap.description.toLowerCase().includes(query) ||
                basemap.source.toLowerCase().includes(query)
              );
            }}
            on:select={handleSearchSelect}
            on:clear={handleSearchClear}
          />

          <div class="year-filters">
            <span class="filter-label">{m.basemap_filter_year()}</span>
            <Tag
              type={selectedYear === 'all' ? 'blue' : 'gray'}
              interactive
              on:click={() => (selectedYear = 'all')}
            >
              {m.basemap_all_years()}
            </Tag>
            {#each availableYears() as year (year)}
              <Tag
                type={selectedYear === year ? 'blue' : 'gray'}
                interactive
                on:click={() => (selectedYear = year as string)}
              >
                {year} ({yearCounts()[year as string] || 0})
              </Tag>
            {/each}
          </div>
        </div>

        {#if displayedBasemaps().length === 0}
          <p class="no-results">{m.basemap_no_results()}</p>
        {:else}
          <div class="basemap-cards-grid">
            {#each displayedBasemaps() as basemap (basemap.file)}
              <BasemapCardVertical
                basemap={basemap}
                selected={basemap.file === basemapSelected}
                onclick={() => handleSelectBasemap(basemap)}
                showMatchScore={false}
                variant="gray"
              />
            {/each}
          </div>
        {/if}

        <div class="footer-section">
          <div class="footer-row">
            <span class="footer-label">{m.basemap_missing_question()}</span>
            <Button
              kind="ghost"
              icon={Launch}
              iconDescription={m.basemap_suggest_addition()}
              on:click={handleSuggestBasemap}
            >
              {m.basemap_suggest_button()}
            </Button>
            <Button
              kind="primary"
              icon={Upload}
              on:click={() => (activeTabIndex = 1)}
            >
              {m.basemap_import_button()}
            </Button>
          </div>
          <Button
            kind="ghost"
            icon={Launch}
            iconDescription={m.basemap_learn_more()}
            href="https://www.sciencespo.fr/cartographie/khartis/docs/basemaps"
            target="_blank"
            size="small"
          >
            {m.basemap_learn_more()}
          </Button>
        </div>
      </ExpandableSection>
    </div>
  {/if}

  <!-- Tab 1: Import -->
  {#if activeTabIndex === 1}
    <div class="tab-content">
      <h4 class="import-title">{m.basemap_import_modal_title()}</h4>
      <p class="kh-help">
        {m.basemap_import_modal_description()}
      </p>

      <div
        class="dropzone"
        class:dropzone-active={isDragging}
        role="button"
        tabindex={0}
        ondragover={(e: { preventDefault: () => void }) => {
          e.preventDefault();
          isDragging = true;
        }}
        ondragleave={() => {
          isDragging = false;
        }}
        ondrop={(e: DragEvent) => {
          e.preventDefault();
          isDragging = false;
          handleFileDrop(e);
        }}
        onclick={() => fileInputRef?.click()}
        onkeydown={(e: { key: string }) => {
          if (e.key === 'Enter' || e.key === ' ') fileInputRef?.click();
        }}
      >
        <span class="dropzone-text">{m.basemap_import_dropzone_text()}</span>
        <input
          bind:this={fileInputRef}
          type="file"
          accept={acceptedExtensions.join(',')}
          onchange={handleFileInputChange}
          hidden
        />
      </div>

      <div class="url-import-section">
        <span class="section-label">{m.basemap_import_url_label()}</span>
        <div class="url-import-row">
          <TextInput bind:value={importUrl} placeholder="https://" />
          <Button
            kind="tertiary"
            icon={CloudUpload}
            disabled={!importUrl.trim() || importUploading}
            on:click={handleLoadUrl}
          >
            {m.basemap_import_url_button()}
          </Button>
        </div>
      </div>

      {#if importedBasemap}
        <div class="imported-file">
          <span class="file-label">{m.basemap_import_file_imported()}</span>
          <div class="file-row">
            <span class="file-name">{importedBasemap.title}</span>
            <CheckmarkFilled size={20} class="icon-success" />
          </div>
        </div>
      {/if}

      {#if importError}
        <InlineNotification
          kind="error"
          title={m.basemap_custom_error()}
          subtitle={importError}
          hideCloseButton={false}
          lowContrast
        />
      {/if}

      <div class="footer-link">
        <Button
          kind="ghost"
          icon={Launch}
          iconDescription="En savoir plus"
          href="https://www.sciencespo.fr/cartographie/khartis/docs"
          target="_blank"
          size="small"
        >
          {m.basemap_import_learn_more()}
        </Button>
      </div>
    </div>
  {/if}

  <!-- Tab 2: OSM -->
  {#if activeTabIndex === 2}
    <div class="tab-content">
      <h4 class="osm-title">{m.osm_modal_title()}</h4>

      <p class="kh-help osm-description">
        {m.osm_modal_description()}
      </p>

      {#if !hasGPSCoordinates()}
        <InlineNotification
          kind="warning"
          title={m.osm_modal_gps_required_title()}
          subtitle={m.osm_modal_gps_required_subtitle()}
          hideCloseButton={true}
          lowContrast
        />
      {:else if osmBasemapStore.isActive}
        <InlineNotification
          kind="success"
          title={m.osm_basemap_title({ style: 'OpenStreetMap' })}
          subtitle={m.osm_modal_description()}
          hideCloseButton={true}
          lowContrast
        />
        <p class="kh-note">
          {m.osm_customization_note()}
          <button type="button" class="link-text" onclick={handleGoToVisualize}
            >{m.step_visualize()}</button
          >.
        </p>
      {:else}
        <div class="osm-action">
          <Button kind="primary" on:click={handleSelectOSM}>
            {m.osm_modal_button_add()}
          </Button>
        </div>
        <p class="kh-note osm-note">
          {m.osm_customization_note()}
          <button type="button" class="link-text" onclick={handleGoToVisualize}
            >{m.step_visualize()}</button
          >.
        </p>
      {/if}

      <Button
        kind="ghost"
        icon={Launch}
        iconDescription="En savoir plus"
        href="https://www.sciencespo.fr/cartographie/khartis/docs/data"
        target="_blank"
        size="small"
      >
        {m.osm_learn_more()}
      </Button>
    </div>
  {/if}

  <!-- Join Assisted Section - always visible when basemap selected -->
  {@render joinAssistedSection()}
</section>

<BasemapSuggestionModal
  bind:open={showSuggestionModal}
  onClose={() => (showSuggestionModal = false)}
/>

<style>
  #basemap-join-step {
    background-color: var(--cds-ui-02);
    padding: var(--cds-spacing-05);
  }

  .kh-help {
    color: var(--cds-text-02);
    margin-bottom: var(--cds-spacing-05);
  }

  .section-subtitle {
    margin-top: 0;
    font-style: italic;
  }

  .basemap-tabs-wrapper {
    margin-bottom: var(--cds-spacing-05);
  }

  .tab-content {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-05);
  }

  .suggestions-scroll-container {
    margin-top: var(--cds-spacing-04);
    margin-left: calc(-1 * var(--cds-spacing-05));
    margin-right: calc(-1 * var(--cds-spacing-05));
    padding-left: var(--cds-spacing-05);
    padding-right: var(--cds-spacing-05);
    overflow-x: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--cds-border-subtle) transparent;
  }

  .suggestions-scroll-container::-webkit-scrollbar {
    height: 6px;
  }

  .suggestions-scroll-container::-webkit-scrollbar-track {
    background: transparent;
  }

  .suggestions-scroll-container::-webkit-scrollbar-thumb {
    background-color: var(--cds-border-subtle);
    border-radius: 3px;
  }

  .suggestions-scroll {
    display: flex;
    gap: var(--cds-spacing-04);
    padding-bottom: var(--cds-spacing-03);
  }

  .basemap-cards-grid {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--cds-spacing-03);
    margin-top: var(--cds-spacing-04);
  }

  .catalogue-filters {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-04);
    margin-bottom: var(--cds-spacing-04);
  }

  .year-filters {
    display: flex;
    flex-wrap: wrap;
    gap: var(--cds-spacing-02);
    align-items: center;
  }

  .filter-label {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--cds-text-01);
    margin-right: var(--cds-spacing-03);
  }

  .no-results {
    margin: 2rem 0;
    text-align: center;
    color: var(--cds-text-02);
    font-size: 0.875rem;
  }

  .footer-section {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-04);
    padding-top: var(--cds-spacing-05);
    margin-top: var(--cds-spacing-05);
    border-top: 1px solid var(--cds-ui-03);
  }

  .footer-row {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-04);
    flex-wrap: wrap;
  }

  .footer-label {
    font-size: 0.875rem;
    color: var(--cds-text-02);
  }

  .import-title,
  .osm-title {
    margin: 0 0 var(--cds-spacing-03) 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--cds-text-01);
  }

  .osm-note {
    margin-top: var(--cds-spacing-04);
  }

  .dropzone {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 180px;
    padding: var(--cds-spacing-05);
    border: 2px dashed var(--cds-border-subtle);
    border-radius: var(--cds-spacing-02);
    background-color: var(--cds-ui-01);
    cursor: pointer;
    transition: all 0.2s ease-out;
  }

  .dropzone:hover,
  .dropzone-active {
    border-color: var(--cds-interactive-01);
    background-color: var(--cds-highlight);
  }

  .dropzone-text {
    font-size: 0.875rem;
    color: var(--cds-text-02);
    text-align: center;
  }

  .url-import-section {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
  }

  .section-label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--cds-text-02);
  }

  .url-import-row {
    display: flex;
    gap: var(--cds-spacing-03);
    align-items: flex-end;
  }

  .url-import-row :global(.bx--text-input-wrapper) {
    flex: 1;
  }

  .imported-file {
    background-color: var(--cds-ui-01);
    padding: var(--cds-spacing-04);
    border-radius: var(--cds-spacing-02);
    border: 1px solid var(--cds-border-subtle);
  }

  .file-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--cds-text-02);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .file-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: var(--cds-spacing-02);
  }

  .file-name {
    font-weight: 500;
    color: var(--cds-text-01);
  }

  .footer-link {
    padding-top: var(--cds-spacing-04);
  }

  .osm-description {
    margin-bottom: var(--cds-spacing-04);
  }

  .kh-note {
    color: var(--cds-text-02);
    font-size: 0.875rem;
    margin-bottom: var(--cds-spacing-05);
  }

  .link-text {
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    color: var(--cds-text-01);
    text-decoration: underline;
    cursor: pointer;
  }

  .link-text:hover {
    color: var(--cds-link-primary-hover);
  }

  .osm-action {
    display: flex;
    justify-content: flex-start;
    margin-bottom: var(--cds-spacing-05);
  }

  .join-assisted-section {
    margin-top: var(--cds-spacing-06);
    padding-top: var(--cds-spacing-06);
    border-top: 1px solid var(--cds-border-subtle);
  }

  .join-table {
    border: 1px solid var(--cds-border-subtle);
    border-radius: var(--cds-spacing-02);
    overflow: hidden;
    margin-bottom: var(--cds-spacing-05);
  }

  .join-table .head {
    display: grid;
    grid-template-columns: 1fr 1fr;
    background: var(--cds-layer-accent-01);
    padding: var(--cds-spacing-03) var(--cds-spacing-04);
    font-weight: 600;
  }

  .join-row {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    gap: var(--cds-spacing-03);
    padding: var(--cds-spacing-03) var(--cds-spacing-04);
    border-top: 1px solid var(--cds-border-subtle);
    align-items: center;
  }

  .issues-list {
    margin: 0;
    padding-left: 1.2rem;
  }

  .correction {
    border-left: 4px solid var(--cds-focus);
    background: var(--cds-layer);
    padding: var(--cds-spacing-04);
    margin-top: var(--cds-spacing-05);
    border-radius: var(--cds-spacing-02);
  }

  .correction .title {
    font-weight: 700;
    margin-bottom: var(--cds-spacing-03);
  }

  .validation {
    border-left: 4px solid var(--cds-support-success);
    background: var(--cds-layer);
    padding: var(--cds-spacing-04);
    margin-top: var(--cds-spacing-05);
    border-radius: var(--cds-spacing-02);
  }

  .validation .title {
    font-weight: 700;
    margin-bottom: var(--cds-spacing-03);
    color: var(--cds-support-success);
  }

  .validation p {
    margin-bottom: var(--cds-spacing-04);
  }

  .join-stats-accordion {
    margin-bottom: var(--cds-spacing-05);
  }

  .join-stats-accordion :global(.bx--accordion) {
    border: 1px solid var(--cds-border-subtle);
    border-radius: var(--cds-spacing-02);
    overflow: hidden;
  }

  .join-stats-accordion :global(.bx--accordion__item) {
    border-top: 1px solid var(--cds-border-subtle);
  }

  .join-stats-accordion :global(.bx--accordion__item:first-child) {
    border-top: none;
  }

  .accordion-title {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03);
  }

  .accordion-title :global(.icon-success) {
    color: var(--cds-support-success);
  }

  .accordion-title :global(.icon-warning) {
    color: var(--cds-support-warning);
  }

  .accordion-title :global(.icon-error) {
    color: var(--cds-support-error);
  }

  :global(.icon-success) {
    color: var(--cds-support-success);
  }
  :global(.icon-warning) {
    color: var(--cds-support-warning);
  }
  :global(.icon-error) {
    color: var(--cds-support-error);
  }

  .join-stats-accordion .join-table {
    border: none;
    border-radius: 0;
    margin-bottom: 0;
  }

  .join-stats-accordion .join-table .head {
    background-color: var(--cds-highlight);
    color: var(--cds-text-01);
    border-bottom: 1px solid var(--cds-border-subtle);
  }

  .join-stats-accordion .join-row {
    background-color: var(--cds-layer-01);
    border-bottom: 1px solid var(--cds-border-subtle);
  }

  .join-stats-accordion .join-row:last-child {
    border-bottom: none;
  }

  .helper-text {
    color: var(--cds-text-secondary);
    font-size: 0.875rem;
    margin: 0;
  }
</style>
