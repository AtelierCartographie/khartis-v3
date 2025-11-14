<script lang="ts">
  import { onMount } from 'svelte';
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import BasemapCard from '$lib/features/commons/components/basemap-card.svelte';
  import BasemapCatalogModal from '$lib/features/commons/components/basemap-catalog-modal.svelte';
  import CustomBasemapImportModal from './components/custom-basemap-import-modal.svelte';
  import OsmBasemapModal from './components/osm-basemap-modal.svelte';
  import SectionHeaderWithIcon from './components/section-header-with-icon.svelte';
  import BasemapCardVertical from './components/basemap-card-vertical.svelte';
  import {
    dataTabActions,
    dataTabState
  } from '$lib/features/commons/store/data-tab.store.svelte';
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import { basemapCatalogService } from '$lib/features/map/services/basemap-catalog.service.svelte';
  import type {
    BasemapMetadata,
    BasemapSuggestion
  } from '$lib/features/map/types/basemap.types';
  import { osmBasemapStore } from '$lib/features/map/stores/osm-basemap.store.svelte';
  import { logger, LogCategory } from '$lib/features/commons/utils/logger';
  import * as m from '$lib/paraglide/messages';
  import {
    Button,
    InlineNotification,
    Select,
    SelectItem,
    Tag
  } from 'carbon-components-svelte';
  import { Grid as GridIcon, Upload, MagicWand } from 'carbon-icons-svelte';
  import MainToolBarHeader from '../components/main-toolbar-header.svelte';
  import { normalizeToProcessedDataset } from '$lib/features/data/utils/processed-dataset.utils';

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

  const allBasemaps = $derived(basemapCatalogService.basemaps);

  // Check if dataset has GPS coordinates (latitude/longitude columns)
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

  function handleSelectBasemap(basemap: BasemapMetadata) {
    // Clear OSM store when selecting regular basemap
    osmBasemapStore.clear();
    dataTabActions.selectBasemap(basemap.file);
  }

  function handleImportBasemap(basemap: BasemapMetadata) {
    // Add custom basemap to catalog service
    basemapCatalogService.addCustomBasemap(basemap);
    // Clear OSM store when selecting custom basemap
    osmBasemapStore.clear();
    // Select it
    dataTabActions.selectBasemap(basemap.file);
  }

  function handleSelectOSM(basemap: BasemapMetadata) {
    // Add OSM basemap to catalog service
    basemapCatalogService.addCustomBasemap(basemap);
    // Activate OSM raster layer
    osmBasemapStore.setOSMBasemap(basemap);
    // Select it
    dataTabActions.selectBasemap(basemap.file);
  }

  async function loadSuggestions() {
    if (!selectedDataset) return;

    try {
      const processedDataset = normalizeToProcessedDataset(selectedDataset);
      const suggestions = await basemapCatalogService.getSuggestions(
        processedDataset,
        3
      );
      basemapSuggestions = suggestions;
    } catch (error) {
      logger.error('Failed to load basemap suggestions', LogCategory.MAP, error);
      basemapSuggestions = [];
    }
  }

  onMount(async () => {
    try {
      await basemapCatalogService.loadCatalog();
      await loadSuggestions();
    } catch (error) {
      logger.error('Failed to initialize basemap catalog', LogCategory.MAP, error);
    }
  });

  $effect(() => {
    if (selectedDataset) {
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

    <div class="join-stats">
      <Tag type="green">{joinedCount} entités jointes</Tag>
      <Tag type="magenta">{toVerifyCount} entités à vérifier</Tag>
    </div>

    <div class="join-table">
      <div class="head">
        <div class="col a">
          Données tabulaires <Tag type="teal">Nom pays</Tag>
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
                const selectedValue = target?.value || row.selectedMapping;
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

    <ExpandableSection
      title="{duplicates.length} entités en double"
      defaultOpen={false}
    >
      <ul class="issues-list">
        {#each duplicates as d, idx (idx)}
          <li>{d}</li>
        {/each}
      </ul>
    </ExpandableSection>

    <ExpandableSection
      title="{unknowns.length} entités non reconnues"
      defaultOpen={false}
    >
      <ul class="issues-list">
        {#each unknowns as u, idx (idx)}
          <li>{u}</li>
        {/each}
      </ul>
    </ExpandableSection>

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
      <Button
        kind="secondary"
        size="small"
        on:click={dataTabActions.applyCorrections}>Remplacer</Button
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

  .join-stats {
    display: flex;
    gap: var(--cds-spacing-03);
    margin: var(--cds-spacing-05) 0 var(--cds-spacing-04);
    align-items: center;
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
</style>
