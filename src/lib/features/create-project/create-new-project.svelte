<script lang="ts">
  import {
    createProjectActions,
    createProjectState
  } from '$lib/features/commons/store/create-project.store.svelte';
  import { FileType } from '$lib/features/commons/store/create-project.types';
  import { formatFileSize } from '$lib/features/commons/utils/file-import.utils';
  import { SUPPORTED_FILE_TYPES } from '$lib/features/commons/utils/file-validator.utils';
  import { LogCategory, logger } from '$lib/features/commons/utils/logger';
  import { m } from '$lib/paraglide/messages';
  import {
    Button,
    FileUploaderDropContainer,
    FileUploaderItem,
    InlineNotification,
    ProgressBar,
    TextArea,
    TextInput,
    Tile,
    Tag,
    Loading
  } from 'carbon-components-svelte';
  import {
    CloudDownload,
    Link,
    TrashCan,
    DocumentBlank
  } from 'carbon-icons-svelte';
  import clsx from 'clsx';
  import ProjectName from './project-name.svelte';
  import { CreateProjectValidationService } from './services/validation.service';

  interface Props {
    onClose?: () => void;
    isModal?: boolean;
    resetToken?: number;
  }

  const { onClose, isModal = false, resetToken = 0 }: Props = $props();

  let pastedDataValue = $state('');
  let onlineUrlValue = $state('');

  const globalValidationErrors = $derived(
    createProjectState.newProject.validationErrors
  );

  async function handleFileDrop(event: CustomEvent<readonly File[]>) {
    const files = Array.from(event.detail);
    logger.info('Files dropped', LogCategory.FILE, {
      count: files.length,
      names: files.map((f) => f.name)
    });

    await createProjectActions.processFiles(files);
  }

  async function handlePasteData() {
    if (pastedDataValue.trim()) {
      logger.info('Processing pasted data', LogCategory.FILE, {
        length: pastedDataValue.length
      });
      await createProjectActions.processPastedData(pastedDataValue);
      pastedDataValue = '';
    }
  }

  async function handleLoadOnlineFile() {
    if (onlineUrlValue.trim()) {
      logger.info('Loading online file', LogCategory.FILE, {
        url: onlineUrlValue
      });
      const urlValidation =
        CreateProjectValidationService.validateURL(onlineUrlValue);

      if (!urlValidation.isValid) {
        return;
      }

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
    logger.info('Clearing all files', LogCategory.FILE);
    isDeletingAll = true;
    await createProjectActions.clearAllFiles(true);
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
    [FileType.KML]: { label: 'KML', color: 'magenta' },
    [FileType.KMZ]: { label: 'KMZ', color: 'magenta' },
    [FileType.UNKNOWN]: { label: 'Type inconnu', color: 'gray' }
  };

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
      <h6 class="mb-3">Importer des données</h6>
    {/if}

    <span class="text-grey">
      Il peut s’agir d’un tableau de données au format CSV ou d’un fichier
      d’informations géographiques (Shapefile, GeoJSON, GeoPackage, GeoParquet,
      KML/KMZ).
    </span>
  </header>

  <div class="grid grid-cols-2 gap-5">
    <div>
      {#key resetToken}
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
            ...SUPPORTED_FILE_TYPES.kml.extensions
          ]}
          validateFiles={(files) => {
            const validationResult =
              CreateProjectValidationService.validateFiles(Array.from(files));
            return validationResult.isValid ? files : [];
          }}
          on:change={handleFileDrop}
        />
      {/key}
    </div>

    <div class="paste-container">
      <TextArea
        bind:value={pastedDataValue}
        placeholder={m.create_project_paste_data()}
        rows={4}
      />
      {#if pastedDataValue.trim()}
        <div class="paste-actions">
          <Button
            size="field"
            kind="secondary"
            on:click={() => (pastedDataValue = '')}
          >
            Clear
          </Button>
          <Button size="field" on:click={handlePasteData}>Process</Button>
        </div>
      {/if}
    </div>
  </div>

  <div class="grid grid-cols-1 gap-7">
    <div class="flex items-end gap-3">
      <TextInput
        bind:value={onlineUrlValue}
        labelText={m.create_project_online_file_link()}
        placeholder="https://example.com/data.csv"
        disabled={createProjectState.newProject.isLoading}
      />

      <div class:button-loading={createProjectState.newProject.isLoading}>
        <Button
          size="field"
          icon={createProjectState.newProject.isLoading
            ? undefined
            : CloudDownload}
          disabled={!onlineUrlValue.trim() ||
            createProjectState.newProject.isLoading}
          on:click={handleLoadOnlineFile}
        >
          <div class="button-with-loader">
            {#if createProjectState.newProject.isLoading}
              <Loading small withOverlay={false} />
            {/if}
            <span>
              {createProjectState.newProject.isLoading
                ? 'Loading...'
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
        title="Error:"
        subtitle={createProjectState.newProject.error}
        on:close={() => createProjectActions.setNewProjectError()}
      />
    {/if}

    <div class="files-section">
      {#if globalValidationErrors.length > 0}
        <InlineNotification
          kind="error"
          title="Validation errors"
          subtitle={globalValidationErrors.join(', ')}
          lowContrast
          hideCloseButton
        />
      {/if}

      {#if createProjectState.newProject.uploadedFiles.length > 0}
        <div class="files-header">
          <span class="files-count">
            {createProjectState.newProject.uploadedFiles.length} file(s) -
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
                  <span>Deleting...</span>
                </div>
              {:else}
                Clear all
              {/if}
            </Button>
          {/if}
        </div>
      {/if}

      {#each createProjectState.newProject.uploadedFiles as file (file.id)}
        <div class="file-item-wrapper">
          {#if file.status === 'uploading' || file.status === 'processing'}
            <div class="file-processing-row">
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
                  helperText={file.status === 'processing'
                    ? 'Processing...'
                    : 'Uploading...'}
                />
              </div>
              <Button
                size="field"
                kind="ghost"
                iconDescription="Cancel"
                icon={deletingFileIds.has(file.id) ? undefined : TrashCan}
                disabled={deletingFileIds.has(file.id)}
                on:click={() => handleRemoveFile(file.id)}
              >
                {#if deletingFileIds.has(file.id)}
                  <Loading small withOverlay={false} />
                {/if}
              </Button>
            </div>
          {:else if file.status === 'error'}
            <div class="file-error-row">
              <FileUploaderItem
                invalid
                class="w-full"
                name={file.name}
                errorSubject="Error"
                errorBody={file.errorMessage || 'File processing failed'}
                status="edit"
              />
              <Button
                size="field"
                kind="ghost"
                iconDescription="Remove file"
                icon={deletingFileIds.has(file.id) ? undefined : TrashCan}
                disabled={deletingFileIds.has(file.id)}
                on:click={() => handleRemoveFile(file.id)}
              >
                {#if deletingFileIds.has(file.id)}
                  <Loading small withOverlay={false} />
                {/if}
              </Button>
            </div>
          {:else if file.status === 'complete'}
            {@const fileTag = getFileTypeTag(file.fileType)}
            <Tile class="file-complete-tile">
              <div class="file-header">
                <div class="file-info">
                  <DocumentBlank size={20} class="file-icon" />
                  <div class="file-details">
                    <div class="file-name">{file.name}</div>
                    <div class="file-size">{formatFileSize(file.size)}</div>
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
                  iconDescription="Remove file"
                  icon={deletingFileIds.has(file.id) ? undefined : TrashCan}
                  disabled={deletingFileIds.has(file.id)}
                  on:click={() => handleRemoveFile(file.id)}
                >
                  {#if deletingFileIds.has(file.id)}
                    <Loading small withOverlay={false} />
                  {/if}
                </Button>
              </div>

              {#if file.relatedFiles && file.relatedFiles.length > 0}
                <div class="related-files-tags">
                  <span class="related-files-label">Related files:</span>
                  <div class="tags-container">
                    {#each file.relatedFiles as relatedFile, idx (idx)}
                      <Tag size="sm" type="gray">{relatedFile}</Tag>
                    {/each}
                  </div>
                </div>
              {/if}

              {#if file.validation?.errors && file.validation.errors.length > 0}
                <InlineNotification
                  lowContrast
                  kind="error"
                  title="Errors"
                  subtitle={file.validation.errors.join(', ')}
                  hideCloseButton
                />
              {/if}

              {#if file.validation?.warnings && file.validation.warnings.length > 0}
                <InlineNotification
                  lowContrast
                  kind="warning"
                  title="Warnings"
                  subtitle={file.validation.warnings.join(', ')}
                  hideCloseButton
                />
              {/if}
            </Tile>
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

  .related-files-tags {
    margin-top: var(--cds-spacing-04);
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }

  .related-files-label {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--cds-text-secondary);
  }

  .tags-container {
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
</style>
