<script lang="ts">
  import { PIPELINE_CONST } from '$lib/features/data-pipeline/constants';
  import * as m from '$lib/paraglide/messages';
  import {
    Button,
    FileUploaderDropContainer,
    TextArea,
    TextInput
  } from 'carbon-components-svelte';
  import { CloudDownload } from 'carbon-icons-svelte';

  interface Props {
    isUploading: boolean;
    pastedDataValue: string;
    onlineUrlValue: string;
    onFileUpload: (files: readonly File[]) => void;
    onPasteData: () => void;
    onLoadOnlineFile: () => void;
    onPastedDataChange: (value: string) => void;
    onUrlChange: (value: string) => void;
  }

  let {
    isUploading,
    pastedDataValue,
    onlineUrlValue,
    onFileUpload,
    onPasteData,
    onLoadOnlineFile,
    onPastedDataChange,
    onUrlChange
  }: Props = $props();
</script>

<div class="import-section">
  <h4 class="section-title">{m.enrich_import_section_title()}</h4>

  <div class="import-grid">
    <FileUploaderDropContainer
      labelText={m.enrich_drag_drop_csv()}
      accept={[...PIPELINE_CONST.EXTENSIONS.TABULAR]}
      disabled={isUploading}
      on:change={(e) => onFileUpload(e.detail)}
    />

    <div class="paste-section">
      <TextArea
        value={pastedDataValue}
        on:input={(e) => {
          const value = (e as CustomEvent<string | number | null>).detail;
          onPastedDataChange(value == null ? '' : String(value));
        }}
        placeholder={m.enrich_paste_data()}
        rows={5}
      />
      <Button
        kind="secondary"
        size="small"
        on:click={onPasteData}
        disabled={!pastedDataValue.trim() || isUploading}
      >
        {m.create_project_process_button()}
      </Button>
    </div>
  </div>

  <div class="url-section">
    <span class="url-label">{m.enrich_url_label()}</span>
    <div class="url-input-row">
      <TextInput
        value={onlineUrlValue}
        on:input={(e) => {
          const value = (e as CustomEvent<string | number | null>).detail;
          onUrlChange(value == null ? '' : String(value));
        }}
        placeholder={m.url_placeholder()}
        size="sm"
      />
      <Button
        kind="secondary"
        size="small"
        icon={CloudDownload}
        on:click={onLoadOnlineFile}
        disabled={!onlineUrlValue.trim() || isUploading}
      >
        {m.enrich_url_load()}
      </Button>
    </div>
  </div>
</div>

<style>
  .import-section {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-04);
  }

  .section-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--cds-text-01);
    margin-top: var(--cds-spacing-03);
  }

  .import-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--cds-spacing-04);
  }

  .paste-section {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
  }

  .paste-section :global(.bx--btn) {
    align-self: flex-end;
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
</style>
