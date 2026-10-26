<script lang="ts">
  import { PIPELINE_CONST } from '$lib/features/data-pipeline';
  import * as m from '$lib/paraglide/messages';
  import {
    Button,
    FileUploaderDropContainer,
    TextArea,
    TextInput
  } from 'carbon-components-svelte';
  import { CloudDownload, DataTable } from 'carbon-icons-svelte';
  import {
    isSingularCount,
    resolveLocale
  } from '$lib/features/commons/utils/format.utils';

  interface ProjectTable {
    id: string;
    name: string;
    rowCount: number;
  }

  interface Props {
    projectTables: ProjectTable[];
    onSelectProjectTable: (datasetId: string) => void;
    isUploading: boolean;
    pastedDataValue: string;
    onlineUrlValue: string;
    onFileUpload: (files: readonly File[]) => void;
    onPasteData: () => void;
    onLoadOnlineFile: () => void;
    onPastedDataChange: (value: string) => void;
    onUrlChange: (value: string) => void;
  }

  type ValueInputEvent = Event & {
    detail?: string | number | null;
    target: EventTarget | null;
  };

  let {
    projectTables,
    onSelectProjectTable,
    isUploading,
    pastedDataValue,
    onlineUrlValue,
    onFileUpload,
    onPasteData,
    onLoadOnlineFile,
    onPastedDataChange,
    onUrlChange
  }: Props = $props();

  function resolveInputValue(
    event: ValueInputEvent,
    target: HTMLInputElement | HTMLTextAreaElement | null
  ): string {
    return typeof event.detail === 'string'
      ? event.detail
      : (target?.value ?? '');
  }

  function formatRowCount(rowCount: number): string {
    const count = new Intl.NumberFormat(resolveLocale()).format(rowCount);
    return isSingularCount(rowCount)
      ? m.enrich_project_table_row({ count })
      : m.enrich_project_table_rows({ count });
  }
</script>

<div class="import-section">
  {#if projectTables.length > 0}
    <h4 class="section-title">{m.enrich_project_tables_title()}</h4>
    <p class="section-help">{m.enrich_project_tables_description()}</p>
    <div class="project-tables">
      {#each projectTables as table (table.id)}
        <Button
          kind="tertiary"
          size="field"
          icon={DataTable}
          disabled={isUploading}
          on:click={() => onSelectProjectTable(table.id)}
        >
          {table.name}
          <span class="project-table-rows"
            >{formatRowCount(table.rowCount)}</span
          >
        </Button>
      {/each}
    </div>
  {/if}

  <h4 class="section-title">{m.enrich_import_section_title()}</h4>

  <div class="import-grid">
    <FileUploaderDropContainer
      labelText={m.enrich_drag_drop_file()}
      accept={[...PIPELINE_CONST.EXTENSIONS.ALL]}
      disabled={isUploading}
      on:change={(e) => onFileUpload(e.detail)}
    />

    <div class="paste-section">
      <TextArea
        value={pastedDataValue}
        on:input={(e) => {
          const target = e.target as HTMLTextAreaElement | null;
          onPastedDataChange(resolveInputValue(e, target));
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
          const target = e.target as HTMLInputElement | null;
          onUrlChange(resolveInputValue(e, target));
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

  .section-help {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--cds-text-02);
  }

  .project-tables {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
  }

  .project-tables :global(.bx--btn) {
    max-width: none;
    width: 100%;
  }

  .project-table-rows {
    margin-left: var(--cds-spacing-03);
    color: var(--cds-text-02);
    font-weight: 400;
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
