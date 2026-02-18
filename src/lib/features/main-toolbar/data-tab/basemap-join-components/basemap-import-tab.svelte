<script lang="ts">
  import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';
  import * as m from '$lib/paraglide/messages';
  import {
    Button,
    InlineNotification,
    TextInput
  } from 'carbon-components-svelte';
  import { CheckmarkFilled, CloudUpload, Launch } from 'carbon-icons-svelte';
  import { KEY } from '$lib/features/commons/constants/dom.constants';

  interface Props {
    importedBasemap: BasemapMetadata | null;
    importError: string | null;
    importUploading: boolean;
    onFileDrop: (event: DragEvent) => void;
    onFileInputChange: (event: Event) => void;
    onLoadUrl: (url: string) => void | Promise<void>;
  }

  let {
    importedBasemap,
    importError,
    importUploading,
    onFileDrop,
    onFileInputChange,
    onLoadUrl
  }: Props = $props();

  let isDragging = $state(false);
  let fileInputRef = $state<HTMLInputElement | null>(null);
  let importUrl = $state('');

  const acceptedExtensions = [
    '.geojson',
    '.json',
    '.shp',
    '.zip',
    '.gpkg',
    '.kml',
    '.parquet'
  ];

  async function handleLoadUrlClick() {
    if (!importUrl.trim()) return;
    await onLoadUrl(importUrl.trim());
    if (!importError) {
      importUrl = '';
    }
  }
</script>

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
    ondragover={(e: DragEvent) => {
      e.preventDefault();
      isDragging = true;
    }}
    ondragleave={() => {
      isDragging = false;
    }}
    ondrop={(e: DragEvent) => {
      e.preventDefault();
      isDragging = false;
      onFileDrop(e);
    }}
    onclick={() => fileInputRef?.click()}
    onkeydown={(e: KeyboardEvent) => {
      if (e.key === KEY.ENTER || e.key === KEY.SPACE) fileInputRef?.click();
    }}
  >
    <span class="dropzone-text">{m.basemap_import_dropzone_text()}</span>
    <input
      bind:this={fileInputRef}
      type="file"
      accept={acceptedExtensions.join(',')}
      onchange={onFileInputChange}
      hidden
    />
  </div>

  <div class="url-import-section">
    <span class="section-label">{m.basemap_import_url_label()}</span>
    <div class="url-import-row">
      <TextInput bind:value={importUrl} placeholder={m.url_placeholder()} />
      <Button
        kind="tertiary"
        size="field"
        icon={CloudUpload}
        disabled={!importUrl.trim() || importUploading}
        on:click={handleLoadUrlClick}
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

  <div class="learn-more-link">
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
  .tab-content {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-04);
  }

  .import-title {
    margin: 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--cds-text-01);
  }

  .kh-help {
    color: var(--cds-text-02);
    font-size: 0.8125rem;
    line-height: 1.25rem;
    margin: 0;
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

  .learn-more-link {
    padding-top: var(--cds-spacing-04);
  }

  .learn-more-link :global(.bx--btn--ghost) {
    color: var(--cds-text-helper, #6f6f6f);
    font-size: 0.75rem;
  }

  .learn-more-link :global(.bx--btn--ghost:hover) {
    color: var(--cds-text-02, #525252);
  }

  .learn-more-link :global(.bx--btn--ghost svg) {
    fill: var(--cds-text-helper, #6f6f6f);
  }

  :global(.icon-success) {
    color: var(--cds-support-success);
  }
</style>
