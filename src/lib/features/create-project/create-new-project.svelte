<script lang="ts">
  import {
    createProjectActions,
    createProjectState
  } from '$lib/features/commons/store/create-project.store.svelte';
  import { formatFileSize } from '$lib/features/commons/utils/file-import.utils';
  import {
    FileValidator,
    SUPPORTED_FILE_TYPES
  } from '$lib/features/commons/utils/file-validator.utils';
  import {
    showError,
    showWarning
  } from '$lib/features/commons/utils/notification.utils.svelte';
  import { logger, LogCategory } from '$lib/features/commons/utils/logger';
  import { m } from '$lib/paraglide/messages';
  import {
    Button,
    FileUploaderDropContainer,
    FileUploaderItem,
    InlineNotification,
    ProgressBar,
    TextArea,
    TextInput
  } from 'carbon-components-svelte';
  import { CloudDownload, Link, TrashCan } from 'carbon-icons-svelte';
  import clsx from 'clsx';
  import ProjectName from './project-name.svelte';

  interface Props {
    onClose?: () => void;
    isModal?: boolean;
  }

  const { onClose, isModal = false }: Props = $props();

  let pastedDataValue = $state('');
  let onlineUrlValue = $state('');

  async function handleFileDrop(event: CustomEvent<readonly File[]>) {
    const files = Array.from(event.detail);
    logger.info('Files dropped', LogCategory.FILE, { count: files.length, names: files.map(f => f.name) });

    const validationResult = FileValidator.validateMultiple(files);

    if (validationResult.globalErrors.length > 0) {
      logger.error('Global validation errors', LogCategory.FILE, validationResult.globalErrors);
      showError(
        'Erreur de validation',
        validationResult.globalErrors.join(', ')
      );
      return;
    }

    const validFiles: File[] = [];
    const warnings: string[] = [];

    for (const [filename, result] of validationResult.results) {
      const file = files.find((f) => f.name === filename);
      if (!file) continue;

      if (result.isValid) {
        validFiles.push(file);
        if (result.warnings.length > 0) {
          logger.warn('File validation warnings', LogCategory.FILE, { filename, warnings: result.warnings });
          warnings.push(...result.warnings);
        }
      } else {
        logger.error('File validation failed', LogCategory.FILE, { filename, errors: result.errors });
        showError(`Erreur avec ${filename}`, result.errors.join(', '));
      }
    }

    if (warnings.length > 0) {
      showWarning('Avertissements', warnings.join(', '));
    }

    if (validFiles.length > 0) {
      logger.info('Processing valid files', LogCategory.FILE, { count: validFiles.length });
      await createProjectActions.processFiles(validFiles);
    }
  }

  async function handlePasteData() {
    if (pastedDataValue.trim()) {
      logger.info('Processing pasted data', LogCategory.FILE, { length: pastedDataValue.length });
      await createProjectActions.processPastedData(pastedDataValue);
      pastedDataValue = '';
    }
  }

  async function handleLoadOnlineFile() {
    if (onlineUrlValue.trim()) {
      logger.info('Loading online file', LogCategory.FILE, { url: onlineUrlValue });
      const urlValidation = FileValidator.validateURL(onlineUrlValue);

      if (!urlValidation.isValid) {
        logger.error('Invalid URL', LogCategory.FILE, { url: onlineUrlValue, errors: urlValidation.errors });
        showError('URL invalide', urlValidation.errors.join(', '));
        return;
      }

      if (urlValidation.warnings.length > 0) {
        showWarning('Avertissement', urlValidation.warnings.join(', '));
      }

      createProjectActions.setOnlineFileUrl(onlineUrlValue);
      await createProjectActions.loadOnlineFile();
      if (!createProjectState.newProject.error) {
        onlineUrlValue = '';
      }
    }
  }

  function handleRemoveFile(fileId: string) {
    createProjectActions.removeUploadedFile(fileId);
  }

  function handleClearAllFiles() {
    logger.info('Clearing all files', LogCategory.FILE);
    createProjectActions.clearAllFiles();
  }
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
      Il peut s’agir d’un tableau de données au format csv ou d’un fichier
      d’informations géographiques (shp, geojson, geopackage).
    </span>
  </header>

  <div class="grid grid-cols-2 gap-5">
    <div>
      <FileUploaderDropContainer
        data-testid="file-upload-container"
        labelText={m.create_project_drag_drop_file()}
        multiple
        accept={[
          ...SUPPORTED_FILE_TYPES.tabular.extensions,
          ...SUPPORTED_FILE_TYPES.geojson.extensions,
          ...SUPPORTED_FILE_TYPES.shapefile.extensions,
          ...SUPPORTED_FILE_TYPES.geopackage.extensions
        ]}
        validateFiles={(files) => {
          const validationResult = FileValidator.validateMultiple(
            Array.from(files)
          );

          if (!validationResult.isValid) {
            const allErrors = [
              ...validationResult.globalErrors,
              ...Array.from(validationResult.results.values()).flatMap(
                (r) => r.errors
              )
            ];

            if (allErrors.length > 0) {
              showError('Validation échouée', allErrors[0]);
              return [];
            }
          }

          return files;
        }}
        on:change={handleFileDrop}
      />
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

      <div>
        <Button
          size="field"
          icon={CloudDownload}
          disabled={!onlineUrlValue.trim() ||
            createProjectState.newProject.isLoading}
          on:click={handleLoadOnlineFile}
        >
          {createProjectState.newProject.isLoading
            ? 'Loading...'
            : m.create_project_load()}
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
              icon={TrashCan}
              on:click={handleClearAllFiles}
            >
              Clear all
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
                icon={TrashCan}
                on:click={() => handleRemoveFile(file.id)}
              />
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
                icon={TrashCan}
                on:click={() => handleRemoveFile(file.id)}
              />
            </div>
          {:else if file.status === 'complete'}
            <div class="file-complete-row">
              <FileUploaderItem
                class="w-full"
                name={`${file.name} (${formatFileSize(file.size)})`}
                status="complete"
              />
              <Button
                size="field"
                kind="ghost"
                iconDescription="Remove file"
                icon={TrashCan}
                on:click={() => handleRemoveFile(file.id)}
              />
            </div>
            {#if file.validation?.warnings && file.validation.warnings.length > 0}
              <InlineNotification
                lowContrast
                kind="warning"
                title="Warnings:"
                subtitle={file.validation.warnings.join(', ')}
                hideCloseButton
              />
            {/if}
          {/if}

          {#if file.relatedFiles && file.relatedFiles.length > 0}
            <div class="related-files">
              <span class="related-files-label">Related files:</span>
              <span class="related-files-list"
                >{file.relatedFiles.join(', ')}</span
              >
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

  .related-files {
    padding-left: var(--cds-spacing-05);
    font-size: 0.75rem;
    color: var(--cds-text-secondary);
    display: flex;
    gap: var(--cds-spacing-02);
  }

  .related-files-label {
    font-weight: 500;
  }

  .related-files-list {
    font-style: italic;
  }

  .file-processing-row,
  .file-error-row,
  .file-complete-row {
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
  .file-error-row :global(.bx--file__selected-file),
  .file-complete-row :global(.bx--file__selected-file) {
    max-width: none;
    width: 100%;
  }

  .file-processing-row :global(.bx--btn),
  .file-error-row :global(.bx--btn),
  .file-complete-row :global(.bx--btn) {
    flex-shrink: 0;
    min-width: auto;
  }
</style>
