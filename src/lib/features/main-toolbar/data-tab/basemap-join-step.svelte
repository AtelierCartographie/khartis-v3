<script lang="ts">
  import BasemapCatalogModal from '$lib/features/commons/components/basemap-catalog-modal.svelte';
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import {
    dataTabActions,
    dataTabState
  } from '$lib/features/commons/store/data-tab.store.svelte';
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import { LogCategory, logger } from '$lib/features/commons/utils/logger';
  import { normalizeToProcessedDataset } from '$lib/features/data-pipeline/utils/processed-dataset.utils';
  import { duckDBOrchestrator } from '$lib/features/duckdb/services/duckdb-orchestrator.service.svelte';
  import { basemapCatalogService } from '$lib/features/map/services/basemap-catalog.service.svelte';
  import { osmBasemapStore } from '$lib/features/map/stores/osm-basemap.store.svelte';
  import type {
    BasemapMetadata,
    BasemapSuggestion
  } from '$lib/features/map/types/basemap.types';
  import * as m from '$lib/paraglide/messages';
  import {
    Button,
    InlineNotification,
    Select,
    SelectItem,
    Tag
  } from 'carbon-components-svelte';
  import {
    CheckmarkFilled,
    ChevronDown,
    ChevronUp,
    ErrorFilled,
    Grid as GridIcon,
    MagicWand,
    Upload,
    WarningAltFilled,
    WarningFilled
  } from 'carbon-icons-svelte';
  import { onMount } from 'svelte';
  import MainToolBarHeader from '../components/main-toolbar-header.svelte';
  import BasemapCardVertical from './components/basemap-card-vertical.svelte';
  import CustomBasemapImportModal from './components/custom-basemap-import-modal.svelte';
  import OsmBasemapModal from './components/osm-basemap-modal.svelte';
  import SectionHeaderWithIcon from './components/section-header-with-icon.svelte';

  const basemapSelected = $derived(dataTabState.basemapJoin.selectedBasemap);
  const selectedDataset = $derived(datasetsStore.selectedDataset);

  let catalogModalOpen = $state(false);
  let importModalOpen = $state(false);
  let osmModalOpen = $state(false);
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

  function handleOpenCatalog() {
    catalogModalOpen = true;
  }

  function handleOpenImport() {
    importModalOpen = true;
  }

  function handleOpenOSM() {
    osmModalOpen = true;
  }

  async function handleSelectBasemap(basemap: BasemapMetadata) {
    osmBasemapStore.clear();
    dataTabActions.selectBasemap(basemap.file);

    if (selectedDataset && dataTabState.geolocation.linkedVariableName) {
      try {
        const stats = await duckDBOrchestrator.computeJoinStats(
          selectedDataset.id,
          basemap,
          dataTabState.geolocation.linkedVariableName
        );
        dataTabActions.setJoinStats(stats);
      } catch (error) {
        logger.error('Failed to compute join stats', LogCategory.MAP, error);
      }
    }
  }

  async function handleImportBasemap(basemap: BasemapMetadata) {
    basemapCatalogService.addCustomBasemap(basemap);
    osmBasemapStore.clear();
    dataTabActions.selectBasemap(basemap.file);

    if (selectedDataset && dataTabState.geolocation.linkedVariableName) {
      try {
        const stats = await duckDBOrchestrator.computeJoinStats(
          selectedDataset.id,
          basemap,
          dataTabState.geolocation.linkedVariableName
        );
        dataTabActions.setJoinStats(stats);
      } catch (error) {
        logger.error('Failed to compute join stats', LogCategory.MAP, error);
      }
    }
  }

  function handleSelectOSM(basemap: BasemapMetadata) {
    basemapCatalogService.addCustomBasemap(basemap);
    osmBasemapStore.setOSMBasemap(basemap);
    dataTabActions.selectBasemap(basemap.file);
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
      dataTabActions.applyCorrections(); // Update UI state

      // Refresh stats
      const basemap = allBasemaps.find((b) => b.file === basemapSelected);
      if (basemap) {
        const stats = await duckDBOrchestrator.computeJoinStats(
          selectedDataset.id,
          basemap,
          dataTabState.geolocation.linkedVariableName
        );
        dataTabActions.setJoinStats(stats);
      }
    } catch (error) {
      logger.error('Failed to apply corrections', LogCategory.MAP, error);
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
    } catch (error) {
      logger.error(
        'Failed to initialize basemap catalog',
        LogCategory.MAP,
        error
      );
    }
  });

  $effect(() => {
    if (selectedDataset) {
      loadSuggestions();
    }
  });

  $effect(() => {
    if (dataTabState.geolocation.linkedVariableName) {
      loadSuggestions();
    }
  });
</script>

<section id="basemap-join-step">
  <MainToolBarHeader title={m.basemap_step_title()} />

  <p class="kh-help">
    {m.basemap_step_description()}
  </p>

  <div class="basemap-toolbar">
    <Button kind="primary" on:click={handleOpenCatalog}>
      {m.basemap_catalog()}
    </Button>
    <Button
      kind="ghost"
      icon={Upload}
      iconDescription={m.basemap_import()}
      on:click={handleOpenImport}
    />
    <Button
      kind="ghost"
      icon={GridIcon}
      iconDescription={m.basemap_osm()}
      on:click={handleOpenOSM}
    />
  </div>

  {#if suggestedBasemaps().length > 0}
    <div class="suggestions-section">
      <SectionHeaderWithIcon
        title={m.section_suggestions()}
        subtitle="Elles s'appuient sur les dimensions géographiques détectées dans les données chargées."
        icon={MagicWand}
      />
      <div class="basemap-cards-grid">
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
  {/if}

  <ExpandableSection title={m.basemap_other()} defaultOpen={false}>
    <p class="kh-help">{m.basemap_browse_other()}</p>
    <Button kind="tertiary" on:click={handleOpenCatalog}>
      {m.basemap_catalog()}
    </Button>
  </ExpandableSection>

  <BasemapCatalogModal
    bind:open={catalogModalOpen}
    selectedBasemapId={basemapSelected}
    suggestions={basemapSuggestions}
    onClose={() => (catalogModalOpen = false)}
    onSelect={handleSelectBasemap}
  />

  <CustomBasemapImportModal
    bind:open={importModalOpen}
    onClose={() => (importModalOpen = false)}
    onImport={handleImportBasemap}
  />

  <OsmBasemapModal
    bind:open={osmModalOpen}
    hasGPSCoordinates={hasGPSCoordinates()}
    onClose={() => (osmModalOpen = false)}
    onSelect={handleSelectOSM}
  />

  <div class="join-assisted-section">
    <SectionHeaderWithIcon title={m.section_join_assisted()} icon={MagicWand} />

    <div class="join-stats-accordion">
      <!-- Joined Entities -->
      <div class="accordion-item joined">
        <button
          class="accordion-header"
          onclick={() => (joinedExpanded = !joinedExpanded)}
        >
          <div class="status-icon">
            <CheckmarkFilled size={20} class="icon-success" />
          </div>
          <span class="status-text">{joinedCount} entités jointes</span>
          <div class="expand-icon">
            {#if joinedExpanded}<ChevronUp />{:else}<ChevronDown />{/if}
          </div>
        </button>
        {#if joinedExpanded}
          <div class="accordion-content">
            <p class="helper-text">
              Ces entités ont été automatiquement associées avec succès.
            </p>
          </div>
        {/if}
      </div>

      <!-- To Verify Entities -->
      <div class="accordion-item to-verify">
        <button
          class="accordion-header"
          onclick={() => (toVerifyExpanded = !toVerifyExpanded)}
        >
          <div class="status-icon">
            <WarningFilled size={20} class="icon-warning" />
          </div>
          <span class="status-text">{toVerifyCount} entités à vérifier</span>
          <div class="expand-icon">
            {#if toVerifyExpanded}<ChevronUp />{:else}<ChevronDown />{/if}
          </div>
        </button>
        {#if toVerifyExpanded}
          <div class="accordion-content">
            <div class="join-table">
              <div class="head">
                <div class="col a">
                  Données tabulaires
                  {#if dataTabState.geolocation.linkedVariableName}
                    <Tag type="cyan" size="sm"
                      >{dataTabState.geolocation.linkedVariableName}</Tag
                    >
                  {/if}
                </div>
                <div class="col b">Fond de carte</div>
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
          </div>
        {/if}
      </div>

      <!-- Duplicate Entities -->
      <div class="accordion-item duplicates">
        <button
          class="accordion-header"
          onclick={() => (duplicatesExpanded = !duplicatesExpanded)}
        >
          <div class="status-icon">
            <WarningAltFilled size={20} class="icon-error" />
          </div>
          <span class="status-text">{duplicateCount} entités en double</span>
          <div class="expand-icon">
            {#if duplicatesExpanded}<ChevronUp />{:else}<ChevronDown />{/if}
          </div>
        </button>
        {#if duplicatesExpanded}
          <div class="accordion-content">
            <ul class="issues-list">
              {#each duplicates as d, idx (idx)}
                <li>{d}</li>
              {/each}
            </ul>
          </div>
        {/if}
      </div>

      <!-- Unrecognized Entities -->
      <div class="accordion-item unrecognized">
        <button
          class="accordion-header"
          onclick={() => (unrecognizedExpanded = !unrecognizedExpanded)}
        >
          <div class="status-icon">
            <ErrorFilled size={20} class="icon-error" />
          </div>
          <span class="status-text"
            >{unrecognizedCount} entités non reconnues</span
          >
          <div class="expand-icon">
            {#if unrecognizedExpanded}<ChevronUp />{:else}<ChevronDown />{/if}
          </div>
        </button>
        {#if unrecognizedExpanded}
          <div class="accordion-content">
            <ul class="issues-list">
              {#each unknowns as u, idx (idx)}
                <li>{u}</li>
              {/each}
            </ul>
          </div>
        {/if}
      </div>
    </div>

    <InlineNotification
      title="Attention"
      subtitle="Khartis a détecté des erreurs lors de la jointure. Vérifier les entités jointes ci‑dessus."
      kind="warning"
      lowContrast
      hideCloseButton={false}
    />

    <div class="correction">
      <div class="title">Correction</div>
      <p>
        Remplacer les entités incorrectes du tableau de données par celles du
        fond de carte ?
      </p>
      <Button kind="secondary" size="small" on:click={handleApplyCorrections}
        >Remplacer</Button
      >
    </div>
  </div>
</section>

<style>
  #basemap-join-step {
    background-color: var(--cds-ui-02);
    padding: var(--cds-spacing-05);
  }

  .kh-help {
    color: var(--cds-text-02);
    margin-bottom: var(--cds-spacing-05);
  }

  .basemap-toolbar {
    display: flex;
    gap: var(--cds-spacing-03);
    margin-bottom: var(--cds-spacing-05);
  }

  .suggestions-section {
    margin-bottom: var(--cds-spacing-06);
  }

  .basemap-cards-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: var(--cds-spacing-05);
    margin-top: var(--cds-spacing-04);
  }

  @media (max-width: 768px) {
    .basemap-cards-grid {
      grid-template-columns: 1fr;
    }
  }

  .join-assisted-section {
    margin-top: var(--cds-spacing-06);
    padding-top: var(--cds-spacing-06);
    border-top: 1px solid var(--cds-border-subtle);
  }

  .join-table {
    border: 1px solid var(--cds-border-subtle);
    border-radius: 6px;
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
    border-radius: 4px;
  }

  .correction .title {
    font-weight: 700;
    margin-bottom: var(--cds-spacing-03);
  }

  /* Accordion Styling */
  .join-stats-accordion {
    display: flex;
    flex-direction: column;
    gap: 1px;
    background-color: var(--cds-border-subtle);
    border: 1px solid var(--cds-border-subtle);
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: var(--cds-spacing-05);
  }

  .accordion-item {
    background-color: var(--cds-layer-01);
  }

  .accordion-header {
    display: flex;
    align-items: center;
    width: 100%;
    padding: var(--cds-spacing-04);
    border: none;
    background: none;
    cursor: pointer;
    text-align: left;
    transition: background-color 0.2s;
  }

  .accordion-header:hover {
    background-color: var(--cds-layer-hover-01);
  }

  .status-icon {
    margin-right: var(--cds-spacing-03);
    display: flex;
    align-items: center;
  }

  .status-text {
    flex: 1;
    font-weight: 600;
    font-size: 0.875rem;
  }

  .expand-icon {
    margin-left: var(--cds-spacing-03);
    color: var(--cds-icon-secondary);
  }

  .accordion-content {
    padding: var(--cds-spacing-04);
    border-top: 1px solid var(--cds-border-subtle);
    background-color: var(--cds-layer-01);
  }

  /* Icon Colors */
  :global(.icon-success) {
    color: var(--cds-support-success);
  }
  :global(.icon-warning) {
    color: var(--cds-support-warning);
  }
  :global(.icon-error) {
    color: var(--cds-support-error);
  }

  /* Table Styling Override */
  .join-table {
    border: none;
    border-radius: 0;
    margin-bottom: 0;
  }

  .join-table .head {
    background-color: #e5f6ff; /* Light blue from design */
    color: var(--cds-text-01);
    border-bottom: 1px solid var(--cds-border-subtle);
  }

  .join-row {
    background-color: #f0f9ff; /* Lighter blue */
    border-bottom: 1px solid #cceeff;
  }

  .join-row:last-child {
    border-bottom: none;
  }

  .helper-text {
    color: var(--cds-text-secondary);
    font-size: 0.875rem;
    margin: 0;
  }
</style>
