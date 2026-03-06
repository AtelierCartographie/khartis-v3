<script lang="ts">
  import Button from '$lib/features/commons/components/carbon/button.svelte';
  import { FileStatus } from '$lib/features/commons/constants/ui.constants';
  import {
    createProjectActions,
    createProjectState
  } from '$lib/features/commons/store/create-project.store.svelte';
  import { FileType } from '$lib/features/commons/store/create-project.types';
  import { debounce } from '$lib/features/commons/utils/debounce.utils';
  import { formatFileSize } from '$lib/features/commons/utils/file-import.utils';
  import { SUPPORTED_FILE_TYPES } from '$lib/features/commons/utils/file-validator.utils';
  import { m } from '$lib/paraglide/messages';
  import {
    FileUploaderDropContainer,
    FileUploaderItem,
    InlineLoading,
    InlineNotification,
    Loading,
    ProgressBar,
    Tag,
    TextArea,
    TextInput,
    Tile
  } from 'carbon-components-svelte';
  import {
    CloudDownload,
    DocumentBlank,
    Link,
    TrashCan
  } from 'carbon-icons-svelte';
  import clsx from 'clsx';
  import { SvelteSet } from 'svelte/reactivity';
  import ProjectName from './project-name.svelte';
  import {
    CreateProjectValidationService,
    type ValidationResult
  } from './services/validation.service';

  interface Props {
    onClose?: () => void;
    isModal?: boolean;
    resetToken?: number;
  }

  const { onClose, isModal = false, resetToken = 0 }: Props = $props();

  let pastedDataValue = $state('');
  let onlineUrlValue = $state('');
  let internalResetKey = $state(0);

  const uploaderKey = $derived(resetToken + internalResetKey);

  const globalValidationErrors = $derived(
    createProjectState.newProject.validationErrors
  );

  let lastProcessedFiles = $state<SvelteSet<string>>(new SvelteSet());
  let previousUploaderKey = $state(0);

  $effect(() => {
    if (uploaderKey !== previousUploaderKey) {
      lastProcessedFiles = new SvelteSet();
      previousUploaderKey = uploaderKey;
    }
  });

  async function handleFileDrop(event: CustomEvent<readonly File[]>) {
    const files = Array.from(event.detail);

    const newFiles = files.filter(
      (f) => !lastProcessedFiles.has(`${f.name}-${f.size}-${f.lastModified}`)
    );

    if (newFiles.length > 0) {
      newFiles.forEach((f) =>
        lastProcessedFiles.add(`${f.name}-${f.size}-${f.lastModified}`)
      );
      await createProjectActions.processFiles(newFiles);
    }
  }

  async function handlePasteData() {
    if (pastedDataValue.trim()) {
      await createProjectActions.processPastedData(pastedDataValue);
      pastedDataValue = '';
    }
  }

  async function handleLoadOnlineFile() {
    createProjectActions.setNewProjectError();

    if (onlineUrlValue.trim() && urlValidation && urlValidation.isValid) {
      createProjectActions.setOnlineFileUrl(onlineUrlValue);
      await createProjectActions.loadOnlineFile();
      if (!createProjectState.newProject.error) {
        onlineUrlValue = '';
      }
    }
  }

  let deletingFileIds = $state(new Set<string>());
  let isDeletingAll = $state(false);

  async function handleRemoveFile(fileId: string) {
    deletingFileIds.add(fileId);
    await createProjectActions.removeUploadedFile(fileId);
    deletingFileIds.delete(fileId);
  }

  async function handleClearAllFiles() {
    isDeletingAll = true;
    await createProjectActions.clearAllFiles(true);
    lastProcessedFiles = new SvelteSet();
    internalResetKey++;
    isDeletingAll = false;
  }

  type TagColor = 'blue' | 'green' | 'purple' | 'teal' | 'magenta' | 'gray';

  const FILE_TYPE_TAGS: Record<FileType, { label: string; color: TagColor }> = {
    [FileType.CSV]: { label: 'CSV', color: 'blue' },
    [FileType.TSV]: { label: 'TSV', color: 'blue' },
    [FileType.GEOJSON]: { label: 'GeoJSON', color: 'green' },
    [FileType.SHAPEFILE]: { label: 'Shapefile', color: 'purple' },
    [FileType.GEOPACKAGE]: { label: 'GeoPackage', color: 'purple' },
    [FileType.GEOPARQUET]: { label: 'GeoParquet', color: 'teal' },
    [FileType.ARROW]: { label: 'Arrow', color: 'teal' },
    [FileType.KML]: { label: 'KML', color: 'magenta' },
    [FileType.KMZ]: { label: 'KMZ', color: 'magenta' },
    [FileType.GPX]: { label: 'GPX', color: 'magenta' },
    [FileType.ZIP]: { label: 'ZIP', color: 'gray' },
    [FileType.UNKNOWN]: {
      label: m.create_project_file_type_unknown(),
      color: 'gray'
    }
  };

  let urlValidation = $state<ValidationResult | null>(null);

  const debouncedUrlValidation = debounce((url: string) => {
    urlValidation = url.trim()
      ? CreateProjectValidationService.validateURL(url)
      : null;
  }, 300);

  $effect(() => {
    debouncedUrlValidation(onlineUrlValue);
  });

  const pastedDataValidation = $derived(
    pastedDataValue.trim()
      ? CreateProjectValidationService.validatePastedData(pastedDataValue)
      : null
  );

  const getFileTypeTag = (fileType: FileType) =>
    FILE_TYPE_TAGS[fileType] ?? FILE_TYPE_TAGS[FileType.UNKNOWN];
</script>

<section
  id="khartis-create-new-project"
  data-testid="create-new-project-section"
  class={clsx('grid grid-cols-1 gap-3', isModal && 'is-modal-create-project')}
>
  <header class="mb-4">
    {#if !isModal}
      <h6 class="mb-3">{m.create_project_import_data()}</h6>
    {/if}

    <span class="text-grey">
      {m.create_project_import_data_description()}
    </span>
  </header>

  <div class="grid grid-cols-2 gap-5">
    <div>
      {#key uploaderKey}
        <FileUploaderDropContainer
          data-testid="file-upload-container"
          labelText={m.create_project_drag_drop_file()}
          multiple
          accept={[
            ...SUPPORTED_FILE_TYPES.tabular.extensions,
            ...SUPPORTED_FILE_TYPES.geojson.extensions,
            ...SUPPORTED_FILE_TYPES.shapefile.extensions,
            ...SUPPORTED_FILE_TYPES.geopackage.extensions,
            ...SUPPORTED_FILE_TYPES.geoparquet.extensions,
            ...SUPPORTED_FILE_TYPES.kml.extensions,
            ...SUPPORTED_FILE_TYPES.gpx.extensions,
            ...SUPPORTED_FILE_TYPES.zip.extensions
          ]}
          on:change={handleFileDrop}
        />
      {/key}
    </div>

    <div class="paste-container">
      <TextArea
        bind:value={pastedDataValue}
        placeholder={m.create_project_paste_data()}
        rows={4}
        invalid={!!(pastedDataValidation && !pastedDataValidation.isValid)}
        invalidText={pastedDataValidation?.errors[0] || ''}
        warn={!!(
          pastedDataValidation && pastedDataValidation.warnings.length > 0
        )}
        warnText={pastedDataValidation?.warnings[0] || ''}
      />
      {#if pastedDataValue.trim()}
        <div class="paste-actions">
          <Button
            size="field"
            kind="secondary"
            on:click={() => (pastedDataValue = '')}
          >
            {m.create_project_clear_button()}
          </Button>
          <Button
            size="field"
            disabled={!!(pastedDataValidation && !pastedDataValidation.isValid)}
            on:click={handlePasteData}
          >
            {m.create_project_process_button()}
          </Button>
        </div>
      {/if}
    </div>
  </div>

  <div class="grid grid-cols-1 gap-7">
    <div class="flex items-end gap-3">
      <TextInput
        bind:value={onlineUrlValue}
        labelText={m.create_project_online_file_link()}
        placeholder={m.url_placeholder_example()}
        disabled={createProjectState.newProject.isLoading}
        invalid={!!(urlValidation && !urlValidation.isValid)}
        invalidText={urlValidation?.errors[0] || ''}
        warn={!!(urlValidation && urlValidation.warnings.length > 0)}
        warnText={urlValidation?.warnings[0] || ''}
      />

      <div class:button-loading={createProjectState.newProject.isLoading}>
        <Button
          size="field"
          icon={createProjectState.newProject.isLoading
            ? undefined
            : CloudDownload}
          disabled={!onlineUrlValue.trim() ||
            (urlValidation && !urlValidation.isValid) ||
            createProjectState.newProject.isLoading}
          on:click={handleLoadOnlineFile}
        >
          <div class="button-with-loader">
            {#if createProjectState.newProject.isLoading}
              <Loading small withOverlay={false} />
            {/if}
            <span>
              {createProjectState.newProject.isLoading
                ? m.create_project_loading_status()
                : m.create_project_load()}
            </span>
          </div>
        </Button>
      </div>
    </div>

    {#if createProjectState.newProject.error}
      <InlineNotification
        lowContrast
        kind="error"
        title={m.create_project_error_label()}
        subtitle={createProjectState.newProject.error}
        on:close={() => createProjectActions.setNewProjectError()}
      />
    {/if}

    {#if createProjectState.newProject.warning}
      <InlineNotification
        lowContrast
        kind="warning"
        title={m.warning_files_duplicate_title()}
        subtitle={createProjectState.newProject.warning}
        on:close={() => createProjectActions.setNewProjectWarning()}
      />
    {/if}

    <div aria-live="polite" aria-atomic="true" class="sr-only">
      {#each createProjectState.newProject.uploadedFiles as file (file.id)}
        {#if file.status === FileStatus.PROCESSING}
          {m.create_project_processing_file({ name: file.name })}
        {/if}
      {/each}
    </div>

    <div class="files-section">
      {#if createProjectState.newProject.uploadedFiles.length > 0}
        <span class="files-imported-label"
          >{m.create_project_file_imported()}</span
        >
      {/if}

      {#if globalValidationErrors.length > 0}
        <InlineNotification
          kind="error"
          title={m.create_project_validation_errors()}
          subtitle={globalValidationErrors.join(', ')}
          lowContrast
          hideCloseButton
        />
      {/if}

      {#if createProjectState.newProject.uploadedFiles.length > 0}
        <div class="files-header">
          <span class="files-count">
            {createProjectState.newProject.uploadedFiles.length}
            {m.create_project_files_label()} -
            {formatFileSize(createProjectActions.getTotalFileSize())}
          </span>
          {#if createProjectState.newProject.uploadedFiles.length > 1}
            <Button
              size="field"
              kind="ghost"
              icon={isDeletingAll ? undefined : TrashCan}
              disabled={isDeletingAll}
              on:click={handleClearAllFiles}
            >
              {#if isDeletingAll}
                <div class="button-with-loader">
                  <Loading small withOverlay={false} />
                  <span>{m.create_project_processing_status()}</span>
                </div>
              {:else}
                {m.create_project_clear_all_button()}
              {/if}
            </Button>
          {/if}
        </div>
      {/if}

      {#if createProjectState.newProject.isProcessingFiles}
        <div class="processing-overlay">
          <InlineLoading
            status="active"
            description={m.create_project_processing_files({
              count: createProjectState.newProject.processingFileCount
            })}
          />
        </div>
      {/if}

      {#each createProjectState.newProject.uploadedFiles as file (file.id)}
        <div class="file-item-wrapper">
          {#if file.status === FileStatus.UPLOADING || file.status === FileStatus.PROCESSING}
            <div class="file-processing-row" data-testid="file-processing">
              <div class="file-processing-content">
                <FileUploaderItem
                  class="w-full"
                  name={file.name}
                  status="uploading"
                />
                <ProgressBar
                  size="sm"
                  value={file.uploadProgress || 0}
                  max={100}
                  helperText={file.status === FileStatus.PROCESSING
                    ? m.create_project_processing_status()
                    : m.create_project_uploading_status()}
                />
              </div>
              <Button
                size="field"
                kind="ghost"
                iconDescription={m.cancel()}
                icon={deletingFileIds.has(file.id) ? undefined : TrashCan}
                disabled={deletingFileIds.has(file.id)}
                on:click={() => handleRemoveFile(file.id)}
              >
                {#if deletingFileIds.has(file.id)}
                  <Loading small withOverlay={false} />
                {/if}
              </Button>
            </div>
          {:else if file.status === FileStatus.ERROR}
            <div class="file-error-row" data-testid="file-error">
              <FileUploaderItem
                invalid
                class="w-full"
                name={file.name}
                errorSubject={m.create_project_error_status()}
                errorBody={file.errorMessage || m.create_project_error_label()}
                status="edit"
              />
              <Button
                size="field"
                kind="ghost"
                iconDescription={m.remove_file_action()}
                icon={deletingFileIds.has(file.id) ? undefined : TrashCan}
                disabled={deletingFileIds.has(file.id)}
                on:click={() => handleRemoveFile(file.id)}
              >
                {#if deletingFileIds.has(file.id)}
                  <Loading small withOverlay={false} />
                {/if}
              </Button>
            </div>
          {:else if file.status === FileStatus.INCOMPLETE}
            {@const fileTag = getFileTypeTag(file.fileType)}
            <div data-testid="file-incomplete">
              <Tile class="file-incomplete-tile">
                <div class="file-header">
                  <div class="file-info">
                    <DocumentBlank
                      size={20}
                      class="file-icon file-icon-warning"
                    />
                    <div class="file-details">
                      <div class="file-name">{file.name}</div>
                      <div class="file-size">{formatFileSize(file.size)}</div>
                      <div class="file-tags">
                        <Tag size="sm" type={fileTag.color}>
                          {fileTag.label}
                        </Tag>
                        <Tag size="sm" type="warm-gray">
                          {m.shapefile_incomplete_title()}
                        </Tag>
                      </div>
                    </div>
                  </div>
                  <Button
                    size="small"
                    kind="ghost"
                    iconDescription={m.remove_file_action()}
                    icon={deletingFileIds.has(file.id) ? undefined : TrashCan}
                    disabled={deletingFileIds.has(file.id)}
                    on:click={() => handleRemoveFile(file.id)}
                  >
                    {#if deletingFileIds.has(file.id)}
                      <Loading small withOverlay={false} />
                    {/if}
                  </Button>
                </div>

                {#if true}
                  {@const requiredExts = ['.shp', '.shx', '.dbf']}
                  {@const optionalExts = ['.prj', '.cpg']}
                  {@const presentExts =
                    file.relatedFiles?.map((f) =>
                      f.substring(f.lastIndexOf('.')).toLowerCase()
                    ) || []}
                  <div class="shapefile-components">
                    {#each requiredExts as ext (ext)}
                      {@const isPresent = presentExts.includes(ext)}
                      <Tag size="sm" type={isPresent ? 'teal' : 'gray'}
                        >{ext}{isPresent ? ' ✓' : ''}</Tag
                      >
                    {/each}
                    {#each optionalExts as ext (ext)}
                      {@const isPresent = presentExts.includes(ext)}
                      <Tag size="sm" type={isPresent ? 'teal' : 'gray'}
                        >{ext}{isPresent ? ' ✓' : ''}</Tag
                      >
                    {/each}
                  </div>
                {/if}
              </Tile>
            </div>
          {:else if file.status === FileStatus.COMPLETE}
            {@const fileTag = getFileTypeTag(file.fileType)}
            {@const rowCount = file.deepAnalysis?.rowCount ?? 0}
            {@const columnCount = file.deepAnalysis?.columnCount ?? 0}
            <div data-testid="file-complete">
              <Tile class="file-complete-tile">
                <div class="file-header">
                  <div class="file-info">
                    <DocumentBlank size={20} class="file-icon" />
                    <div class="file-details">
                      <div class="file-name">{file.name}</div>
                      <div class="file-size">
                        {formatFileSize(file.size)}
                        {#if rowCount > 0}
                          <span class="file-stats">
                            · <span data-testid="file-row-count"
                              >{rowCount}</span
                            >
                            {m.rows()} ·
                            <span data-testid="file-column-count"
                              >{columnCount}</span
                            >
                            {m.columns()}
                          </span>
                        {/if}
                      </div>
                      <div class="file-tags">
                        <Tag size="sm" type={fileTag.color}>
                          {fileTag.label}
                        </Tag>
                      </div>
                    </div>
                  </div>
                  <Button
                    size="small"
                    kind="ghost"
                    iconDescription={m.remove_file_action()}
                    icon={deletingFileIds.has(file.id) ? undefined : TrashCan}
                    disabled={deletingFileIds.has(file.id)}
                    on:click={() => handleRemoveFile(file.id)}
                  >
                    {#if deletingFileIds.has(file.id)}
                      <Loading small withOverlay={false} />
                    {/if}
                  </Button>
                </div>

                {#if file.fileType === FileType.SHAPEFILE && file.relatedFiles && file.relatedFiles.length > 0}
                  {@const requiredExts = ['.shp', '.shx', '.dbf']}
                  {@const optionalExts = ['.prj', '.cpg']}
                  {@const presentExts =
                    file.relatedFiles?.map((f) =>
                      f.substring(f.lastIndexOf('.')).toLowerCase()
                    ) || []}
                  <div class="shapefile-components">
                    {#each requiredExts as ext (ext)}
                      {@const isPresent = presentExts.includes(ext)}
                      <Tag size="sm" type={isPresent ? 'teal' : 'gray'}
                        >{ext}{isPresent ? ' ✓' : ''}</Tag
                      >
                    {/each}
                    {#each optionalExts as ext (ext)}
                      {@const isPresent = presentExts.includes(ext)}
                      <Tag size="sm" type={isPresent ? 'teal' : 'gray'}
                        >{ext}{isPresent ? ' ✓' : ''}</Tag
                      >
                    {/each}
                  </div>
                {/if}

                {#if file.validation?.errors && file.validation.errors.length > 0}
                  <InlineNotification
                    lowContrast
                    kind="error"
                    title={m.create_project_error_status()}
                    subtitle={file.validation.errors.join(', ')}
                    hideCloseButton
                  />
                {/if}

                {#if file.validation?.warnings && file.validation.warnings.length > 0}
                  <InlineNotification
                    lowContrast
                    kind="warning"
                    title={m.create_project_validation_errors()}
                    subtitle={file.validation.warnings.join(', ')}
                    hideCloseButton
                  />
                {/if}
              </Tile>
            </div>
          {/if}
        </div>
      {/each}
    </div>

    <div class="flex items-center gap-3 text-grey">
      <span>{m.create_project_learn_more_data()}</span>

      <Link size={24} />
    </div>
  </div>

  {#if !isModal}
    <ProjectName onClose={onClose} />
  {/if}
</section>

<style>
  #khartis-create-new-project {
    margin-bottom: 42px;
  }

  .is-modal-create-project {
    margin-bottom: 0 !important;
  }

  #khartis-create-new-project :global(.bx--file__selected-file) {
    max-width: 100%;
  }

  #khartis-create-new-project :global(.bx--text-area) {
    background-color: var(--cds-field-01);
  }

  .paste-container {
    position: relative;
  }

  .paste-actions {
    display: flex;
    gap: var(--cds-spacing-03);
    margin-top: var(--cds-spacing-03);
    justify-content: flex-end;
  }

  .files-section {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-04);
  }

  .files-imported-label {
    font-size: 0.75rem;
    color: var(--cds-text-secondary);
    letter-spacing: 0.32px;
  }

  .files-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--cds-spacing-03) 0;
    border-bottom: 1px solid var(--cds-border-subtle);
  }

  .files-count {
    font-size: 0.875rem;
    color: var(--cds-text-secondary);
  }

  .file-item-wrapper {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }

  .file-complete-tile :global(.bx--tile) {
    padding: var(--cds-spacing-04);
    border: 1px solid var(--cds-border-subtle);
    background: var(--cds-layer-01);
  }

  .file-incomplete-tile :global(.bx--tile) {
    padding: var(--cds-spacing-04);
    border: 1px solid var(--cds-support-warning);
    background: var(--cds-layer-01);
  }

  .file-icon-warning {
    color: var(--cds-support-warning) !important;
  }

  .file-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--cds-spacing-03);
  }

  .file-info {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03);
    flex: 1;
    min-width: 0;
  }

  .file-info :global(.file-icon) {
    flex-shrink: 0;
    color: var(--cds-icon-secondary);
  }

  .file-details {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-01);
    min-width: 0;
  }

  .file-tags {
    display: flex;
    gap: var(--cds-spacing-02);
    flex-wrap: wrap;
    margin-top: var(--cds-spacing-02);
  }

  .file-name {
    font-weight: 600;
    font-size: 0.875rem;
    color: var(--cds-text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-size {
    font-size: 0.75rem;
    color: var(--cds-text-secondary);
  }

  .file-stats {
    color: var(--cds-text-helper);
  }

  .shapefile-components {
    margin-top: var(--cds-spacing-04);
    display: flex;
    flex-wrap: wrap;
    gap: var(--cds-spacing-02);
  }

  .file-processing-row,
  .file-error-row {
    display: flex;
    align-items: flex-start;
    gap: var(--cds-spacing-03);
    width: 100%;
  }

  .file-processing-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }

  .file-processing-row :global(.bx--file__selected-file),
  .file-error-row :global(.bx--file__selected-file) {
    max-width: none;
    width: 100%;
  }

  .file-processing-row :global(.bx--btn),
  .file-error-row :global(.bx--btn) {
    flex-shrink: 0;
    min-width: auto;
  }

  .button-with-loader {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03);
  }

  .button-with-loader :global(.bx--loading) {
    width: 1rem;
    height: 1rem;
  }

  .button-with-loader :global(.bx--loading__svg) {
    width: 1rem;
    height: 1rem;
  }

  .button-loading :global(.bx--btn) {
    pointer-events: none;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .processing-overlay {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--cds-spacing-04);
    background: var(--cds-layer-01);
    border: 1px solid var(--cds-border-subtle);
    border-radius: var(--cds-spacing-02);
  }
</style>
