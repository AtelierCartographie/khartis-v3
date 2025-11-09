<script lang="ts">
  import {
    Button,
    InlineNotification,
    ProgressBar,
    Tile,
    Tag
  } from 'carbon-components-svelte';
  import { Catalog, Checkmark, Map } from 'carbon-icons-svelte';
  import BasemapCatalogModal from '$lib/features/commons/components/basemap-catalog-modal.svelte';
  import type {
    BasemapMetadata,
    BasemapMatchResult
  } from './types/basemap.types';
  import { BasemapCatalogService } from './services/basemap-catalog.service';
  import { m } from '$lib/paraglide/messages';
  import { onMount } from 'svelte';

  interface Props {
    datasetId: string;
    geoColumn?: string;
    geoCodePattern?: string;
    onBasemapSelected?: (basemap: BasemapMetadata) => void;
  }

  const { geoColumn, geoCodePattern, onBasemapSelected }: Props = $props();

  let catalogModalOpen = $state(false);
  let suggestions = $state<BasemapMatchResult[]>([]);
  let selectedBasemap = $state<BasemapMetadata | null>(null);
  let isLoadingSuggestions = $state(false);

  onMount(async () => {
    await loadSuggestions();
  });

  async function loadSuggestions() {
    if (!geoCodePattern) return;

    isLoadingSuggestions = true;

    try {
      suggestions = await BasemapCatalogService.suggestBasemaps(geoCodePattern);
    } catch (error) {
      console.error('Failed to load basemap suggestions', error);
    } finally {
      isLoadingSuggestions = false;
    }
  }

  function handleSelectBasemap(basemap: BasemapMetadata) {
    selectedBasemap = basemap;
    onBasemapSelected?.(basemap);
  }

  function handleOpenCatalog() {
    catalogModalOpen = true;
  }

  function handleCloseCatalog() {
    catalogModalOpen = false;
  }

  function getMatchScoreColor(score: number): 'green' | 'blue' | 'gray' {
    if (score >= 80) return 'green';
    if (score >= 50) return 'blue';
    return 'gray';
  }
</script>

<section class="basemap-join-step">
  <div class="step-header">
    <h3>{m.basemap_join_step_title()}</h3>
    <p class="step-description">
      {m.basemap_join_step_description()}
    </p>
  </div>

  {#if geoColumn}
    <InlineNotification
      kind="info"
      title={m.geo_column_detected()}
      subtitle={m.geo_column_detected_subtitle({ column: geoColumn })}
      hideCloseButton
      lowContrast
    />
  {:else}
    <InlineNotification
      kind="warning"
      title={m.no_geo_column_selected()}
      subtitle={m.no_geo_column_selected_help()}
      hideCloseButton
    />
  {/if}

  {#if isLoadingSuggestions}
    <div class="loading-suggestions">
      <ProgressBar helperText={m.loading_basemap_suggestions()} />
    </div>
  {:else if suggestions.length > 0}
    <div class="suggestions-section">
      <h4 class="section-title">{m.suggested_basemaps()}</h4>
      <p class="section-description">
        {m.suggested_basemaps_description()}
      </p>

      <div class="suggestions-grid">
        {#each suggestions as suggestion (suggestion.basemap.file)}
          <Tile
            class={`basemap-suggestion-card ${selectedBasemap?.file === suggestion.basemap.file ? 'selected' : ''}`}
            on:click={() => handleSelectBasemap(suggestion.basemap)}
          >
            <div class="card-header">
              <div class="card-title">
                <Map size={20} />
                <h5>{suggestion.basemap.title}</h5>
              </div>
              <Tag type={getMatchScoreColor(suggestion.matchScore)} size="sm">
                {Math.round(suggestion.matchScore)}% {m.match()}
              </Tag>
            </div>

            <p class="card-description">
              {suggestion.basemap.description}
            </p>

            <div class="card-metadata">
              <span class="metadata-item">
                {suggestion.basemap.source}
              </span>
              <span class="metadata-separator">•</span>
              <span class="metadata-item">
                {suggestion.basemap.date}
              </span>
            </div>

            {#if selectedBasemap?.file === suggestion.basemap.file}
              <div class="selected-indicator">
                <Checkmark size={20} />
                {m.selected()}
              </div>
            {/if}
          </Tile>
        {/each}
      </div>
    </div>
  {/if}

  <div class="catalog-section">
    <h4 class="section-title">
      {suggestions.length > 0 ? m.other_basemaps() : m.browse_catalog()}
    </h4>

    <Button kind="tertiary" icon={Catalog} on:click={handleOpenCatalog}>
      {m.open_basemap_catalog()}
    </Button>
  </div>

  {#if selectedBasemap}
    <Tile class="selected-basemap-preview">
      <div class="preview-header">
        <Checkmark size={24} class="success-icon" />
        <div>
          <h4>{m.selected_basemap()}</h4>
          <h5>{selectedBasemap.title}</h5>
        </div>
      </div>

      <p class="preview-description">
        {selectedBasemap.description}
      </p>

      <div class="preview-metadata">
        <div class="metadata-row">
          <span class="metadata-label">{m.source()}:</span>
          <span class="metadata-value">{selectedBasemap.source}</span>
        </div>
        <div class="metadata-row">
          <span class="metadata-label">{m.date()}:</span>
          <span class="metadata-value">{selectedBasemap.date}</span>
        </div>
        <div class="metadata-row">
          <span class="metadata-label">{m.projection()}:</span>
          <span class="metadata-value">{selectedBasemap.projection}</span>
        </div>
      </div>
    </Tile>
  {/if}
</section>

<BasemapCatalogModal
  bind:open={catalogModalOpen}
  selectedBasemapId={selectedBasemap?.file}
  suggestions={suggestions as any}
  onClose={handleCloseCatalog}
  onSelect={handleSelectBasemap}
/>

<style>
  .basemap-join-step {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-05);
  }

  .step-header h3 {
    font-size: 1.125rem;
    font-weight: 600;
    margin-bottom: var(--cds-spacing-02);
  }

  .step-description {
    font-size: 0.875rem;
    color: var(--cds-text-secondary);
  }

  .loading-suggestions {
    padding: var(--cds-spacing-05);
  }

  .section-title {
    font-size: 1rem;
    font-weight: 600;
    margin-bottom: var(--cds-spacing-02);
  }

  .section-description {
    font-size: 0.875rem;
    color: var(--cds-text-secondary);
    margin-bottom: var(--cds-spacing-04);
  }

  .suggestions-section {
    margin-top: var(--cds-spacing-04);
  }

  .suggestions-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: var(--cds-spacing-04);
  }

  .basemap-suggestion-card {
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .basemap-suggestion-card:hover {
    background: var(--cds-layer-hover);
  }

  .basemap-suggestion-card.selected {
    border: 2px solid var(--cds-interactive);
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: var(--cds-spacing-03);
  }

  .card-title {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03);
  }

  .card-title h5 {
    font-size: 0.875rem;
    font-weight: 600;
  }

  .card-description {
    font-size: 0.75rem;
    color: var(--cds-text-secondary);
    margin-bottom: var(--cds-spacing-03);
    line-height: 1.4;
  }

  .card-metadata {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-02);
    font-size: 0.75rem;
    color: var(--cds-text-secondary);
  }

  .metadata-separator {
    opacity: 0.5;
  }

  .selected-indicator {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-02);
    margin-top: var(--cds-spacing-04);
    padding-top: var(--cds-spacing-04);
    border-top: 1px solid var(--cds-border-subtle);
    color: var(--cds-support-success);
    font-weight: 600;
    font-size: 0.875rem;
  }

  .catalog-section {
    margin-top: var(--cds-spacing-04);
  }

  .selected-basemap-preview {
    background: var(--cds-layer-accent);
  }

  .preview-header {
    display: flex;
    align-items: flex-start;
    gap: var(--cds-spacing-04);
    margin-bottom: var(--cds-spacing-04);
  }

  .preview-header :global(.success-icon) {
    color: var(--cds-support-success);
    flex-shrink: 0;
  }

  .preview-header h4 {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--cds-text-secondary);
    margin-bottom: var(--cds-spacing-02);
  }

  .preview-header h5 {
    font-size: 1rem;
    font-weight: 600;
  }

  .preview-description {
    font-size: 0.875rem;
    color: var(--cds-text-secondary);
    margin-bottom: var(--cds-spacing-04);
  }

  .preview-metadata {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
  }

  .metadata-row {
    display: flex;
    gap: var(--cds-spacing-03);
    font-size: 0.875rem;
  }

  .metadata-label {
    font-weight: 600;
    min-width: 100px;
  }

  .metadata-value {
    color: var(--cds-text-secondary);
  }
</style>
