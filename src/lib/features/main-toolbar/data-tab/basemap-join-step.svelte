<script lang="ts">
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import ProjectionCard from '$lib/features/commons/components/projection-card.svelte';
  import Separator from '$lib/features/commons/components/separator.svelte';
  import * as m from '$lib/paraglide/messages';
  import {
    Button,
    InlineNotification,
    Select,
    SelectItem,
    Tag
  } from 'carbon-components-svelte';
  import { Grid as GridIcon, Upload } from 'carbon-icons-svelte';
  import { dataTabActions, dataTabState } from './data-tab.store.svelte';

  type Basemap = {
    id: string;
    title: string;
    subtitle?: string;
    ratio?: string;
    matchScore?: number;
  };

  const basemapSelected = $derived(dataTabState.basemapJoin.selectedBasemap);
  let basemapSuggestions: Basemap[] = [
    {
      id: 'world-admin',
      title: 'Monde',
      subtitle: 'par pays',
      ratio: '16:9',
      matchScore: 75
    },
    {
      id: 'europe-admin',
      title: 'Europe',
      subtitle: 'par pays',
      ratio: '1:1',
      matchScore: 65
    }
  ];

  const joinRows = $derived(dataTabState.basemapJoin.joinMappings);
  const duplicates = $derived(dataTabState.basemapJoin.duplicateEntities);
  const unknowns = $derived(dataTabState.basemapJoin.unrecognizedEntities);
  const joinedCount = $derived(dataTabState.basemapJoin.joinedEntities);
  const toVerifyCount = $derived(dataTabState.basemapJoin.entitiesToVerify);
</script>

<section>
  <header class="join-header">
    <div class="join-title">
      <GridIcon size={24} />
      <h5>{m.basemap_step_title()}</h5>
    </div>
    <Separator orientation="horizontal" />
  </header>

  <p class="kh-help">
    {m.basemap_step_description()}
  </p>

  <div class="basemap-toolbar">
    <Button kind="primary">{m.basemap_catalog()}</Button>
    <Button kind="ghost" icon={Upload} iconDescription={m.basemap_import()} />
    <Button kind="ghost" icon={GridIcon} iconDescription={m.basemap_osm()} />
  </div>

  <ExpandableSection title={m.basemap_suggestions()} defaultOpen>
    {#snippet children()}
      <div class="basemap-cards">
        {#each basemapSuggestions as b}
          <ProjectionCard
            title={b.title}
            subtitle={b.subtitle}
            ratio={b.ratio}
            selected={basemapSelected === b.id}
            onclick={() => dataTabActions.selectBasemap(b.id)}
            showInfo={true}
          />
        {/each}
      </div>
    {/snippet}
  </ExpandableSection>

  <ExpandableSection title={m.basemap_other()} defaultOpen={false}>
    {#snippet children()}
      <p class="kh-help">{m.basemap_browse_other()}</p>
    {/snippet}
  </ExpandableSection>

  <ExpandableSection title="Jointure assistée par Khartis" defaultOpen>
    {#snippet children()}
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
        {#each joinRows as row, i}
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
                  dataTabActions.updateJoinMapping(
                    i,
                    event.detail.selectedValue
                  );
                }}
                size="xl"
              >
                {#each row.basemapOptions as opt}
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
        {#snippet children()}
          <ul class="issues-list">
            {#each duplicates as d}
              <li>{d}</li>
            {/each}
          </ul>
        {/snippet}
      </ExpandableSection>

      <ExpandableSection
        title="{unknowns.length} entités non reconnues"
        defaultOpen={false}
      >
        {#snippet children()}
          <ul class="issues-list">
            {#each unknowns as u}
              <li>{u}</li>
            {/each}
          </ul>
        {/snippet}
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
    {/snippet}
  </ExpandableSection>
</section>

<style>
  .join-header .join-title {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-04);
    margin-bottom: var(--cds-spacing-03);
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
