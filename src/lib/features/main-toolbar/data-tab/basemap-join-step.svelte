<script lang="ts">
  import { onMount } from 'svelte';
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import BasemapCard from '$lib/features/commons/components/basemap-card.svelte';
  import BasemapCatalogModal from '$lib/features/commons/components/basemap-catalog-modal.svelte';
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
  import * as m from '$lib/paraglide/messages';
  import {
    Button,
    InlineNotification,
    Select,
    SelectItem,
    Tag
  } from 'carbon-components-svelte';
  import { Grid as GridIcon, Upload } from 'carbon-icons-svelte';
  import MainToolBarHeader from '../components/main-toolbar-header.svelte';
  import { normalizeToProcessedDataset } from '$lib/features/data/utils/processed-dataset.utils';

  const basemapSelected = $derived(dataTabState.basemapJoin.selectedBasemap);
  const selectedDataset = $derived(datasetsStore.selectedDataset);

  let catalogModalOpen = $state(false);
  let basemapSuggestions = $state<BasemapSuggestion[]>([]);

  const joinRows = $derived(dataTabState.basemapJoin.joinMappings);
  const duplicates = $derived(dataTabState.basemapJoin.duplicateEntities);
  const unknowns = $derived(dataTabState.basemapJoin.unrecognizedEntities);
  const joinedCount = $derived(dataTabState.basemapJoin.joinedEntities);
  const toVerifyCount = $derived(dataTabState.basemapJoin.entitiesToVerify);

  const allBasemaps = $derived(basemapCatalogService.basemaps);

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

  function handleSelectBasemap(basemap: BasemapMetadata) {
    dataTabActions.selectBasemap(basemap.file);
  }

  async function loadSuggestions() {
    if (selectedDataset) {
      const processedDataset = normalizeToProcessedDataset(selectedDataset);
      const suggestions = await basemapCatalogService.getSuggestions(
        processedDataset,
        3
      );
      basemapSuggestions = suggestions;
    }
  }

  onMount(async () => {
    await basemapCatalogService.loadCatalog();
    await loadSuggestions();
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
    <Button kind="ghost" icon={Upload} iconDescription={m.basemap_import()} />
    <Button kind="ghost" icon={GridIcon} iconDescription={m.basemap_osm()} />
  </div>

  {#if suggestedBasemaps().length > 0}
    <ExpandableSection title={m.basemap_suggestions()} defaultOpen>
      <div class="basemap-cards">
        {#each suggestedBasemaps() as { basemap, score } (basemap.file)}
          <BasemapCard
            basemap={basemap}
            matchScore={score}
            selected={basemap.file === basemapSelected}
            onclick={() => handleSelectBasemap(basemap)}
          />
        {/each}
      </div>
    </ExpandableSection>
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

  <ExpandableSection title="Jointure assistée par Khartis" defaultOpen>
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
                const event = e as CustomEvent<{ selectedValue: string }>;
                dataTabActions.updateJoinMapping(i, event.detail.selectedValue);
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
  </ExpandableSection>
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

  .basemap-cards {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-04);
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
