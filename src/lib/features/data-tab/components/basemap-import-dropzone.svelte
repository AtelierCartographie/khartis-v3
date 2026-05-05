<script lang="ts">
  import Button from '$lib/features/commons/components/carbon/button.svelte';
  import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';
  import * as m from '$lib/paraglide/messages';
  import { getLocale } from '$lib/paraglide/runtime';
  import { InlineNotification, TextInput } from 'carbon-components-svelte';
  import {
    CheckmarkFilled,
    CloudUpload,
    Launch,
    Upload
  } from 'carbon-icons-svelte';
  import { KEY } from '$lib/features/commons/constants/dom.constants';

  interface Props {
    acceptedExtensions?: string[];
    isUploading?: boolean;
    error?: string | null;
    importedBasemap?: BasemapMetadata | null;
    onFileSelect: (file: File) => void;
    onUrlLoad: (url: string) => void;
    onClearError?: () => void;
  }

  const {
    acceptedExtensions = [
      '.geojson',
      '.json',
      '.shp',
      '.gpkg',
      '.kml',
      '.parquet'
    ],
    isUploading = false,
    error = null,
    importedBasemap = null,
    onFileSelect,
    onUrlLoad,
    onClearError
  }: Props = $props();

  const lang = getLocale();

  let isDragging = $state(false);
  let urlInput = $state('');
  let fileInputRef = $state<HTMLInputElement | null>(null);

  function handleFileDrop(event: DragEvent) {
    event.preventDefault();
    isDragging = false;
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      onFileSelect(files[0]);
    }
  }

  function handleFileInputChange(event: Event) {
    const target = event.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      onFileSelect(target.files[0]);
    }
  }

  function handleLoadUrl() {
    if (urlInput.trim()) {
      onUrlLoad(urlInput.trim());
      urlInput = '';
    }
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    isDragging = true;
  }

  function handleDragLeave() {
    isDragging = false;
  }

  function handleClick() {
    fileInputRef?.click();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === KEY.ENTER || event.key === KEY.SPACE) {
      fileInputRef?.click();
    }
  }
</script>

<div class="basemap-import">
  <h4 class="import-title">{m.basemap_import_modal_title()}</h4>
  <p class="section-description">{m.basemap_import_modal_description()}</p>

  <div
    class="dropzone"
    class:dropzone-active={isDragging}
    role="button"
    tabindex={0}
    ondragover={handleDragOver}
    ondragleave={handleDragLeave}
    ondrop={handleFileDrop}
    onclick={handleClick}
    onkeydown={handleKeydown}
  >
    <Upload size={24} />
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
    <span class="url-label">{m.basemap_import_url_label()}</span>
    <div class="url-import-row">
      <TextInput
        bind:value={urlInput}
        placeholder={m.url_placeholder()}
        size="sm"
      />
      <Button
        kind="tertiary"
        icon={CloudUpload}
        size="small"
        disabled={!urlInput.trim() || isUploading}
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
        <span class="file-name"
          >{lang === 'fr'
            ? importedBasemap.title_fr
            : importedBasemap.title_en}</span
        >
        <CheckmarkFilled size={20} class="icon-success" />
      </div>
    </div>
  {/if}

  {#if error}
    <InlineNotification
      kind="error"
      title={m.basemap_custom_error()}
      subtitle={error}
      hideCloseButton={false}
      lowContrast
      on:close={() => onClearError?.()}
    />
  {/if}

  <div class="footer-link">
    <Button
      kind="ghost"
      icon={Launch}
      iconDescription={m.learn_more()}
      href="https://www.sciencespo.fr/cartographie/khartis/docs"
      target="_blank"
      size="small"
    >
      {m.basemap_import_learn_more()}
    </Button>
  </div>
</div>

<style>
  .basemap-import {
    padding-top: var(--cds-spacing-04);
  }

  .import-title {
    margin: 0 0 var(--cds-spacing-03) 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--cds-text-01);
  }

  .section-description {
    font-size: 0.8125rem;
    color: var(--cds-text-02);
    margin-bottom: var(--cds-spacing-04);
  }

  .dropzone {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--cds-spacing-03);
    padding: var(--cds-spacing-06);
    border: 2px dashed var(--cds-border-subtle);
    border-radius: var(--cds-spacing-02);
    background-color: var(--cds-layer-02);
    cursor: pointer;
    transition: all 0.2s ease-out;
    margin-bottom: var(--cds-spacing-04);
  }

  .dropzone:hover,
  .dropzone:focus {
    border-color: var(--cds-interactive-01);
    background-color: var(--cds-layer-hover-02);
  }

  .dropzone.dropzone-active {
    border-color: var(--cds-interactive-01);
    background-color: var(--cds-layer-selected-02);
  }

  .dropzone-text {
    font-size: 0.875rem;
    color: var(--cds-text-02);
    text-align: center;
  }

  .url-import-section {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
    margin-bottom: var(--cds-spacing-04);
  }

  .url-label {
    font-size: 0.75rem;
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
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
    margin-bottom: var(--cds-spacing-04);
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
    border: 1px solid var(--cds-support-success);
    border-radius: var(--cds-spacing-02);
  }

  .file-name {
    font-size: 0.875rem;
    color: var(--cds-text-01);
  }

  .file-row :global(.icon-success) {
    color: var(--cds-support-success);
  }

  .footer-link {
    margin-top: var(--cds-spacing-04);
  }
</style>
