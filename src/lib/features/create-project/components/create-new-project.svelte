<script lang="ts">
  import Button from '$lib/features/commons/components/button-native.svelte';
  import { FileStatus } from '$lib/features/commons/constants/ui.constants';
  import {
    createProjectActions,
    createProjectState
  } from '$lib/features/commons/stores/create-project.store.svelte';
  import {
    DataSourceType,
    FileType,
    type UploadedFile
  } from '$lib/features/commons/types/create-project.types';
  import { debounce } from '$lib/features/commons/utils/debounce.utils';
  import { formatValue } from '$lib/features/commons/utils/format.utils';
  import { SUPPORTED_FILE_TYPES } from '$lib/features/commons/utils/file-validator.utils';
  import {
    readCarbonStringValue,
    type CarbonValueEvent
  } from '$lib/features/commons/utils/carbon-events.utils';
  import { KEY } from '$lib/features/commons/constants/dom.constants';
  import { m } from '$lib/paraglide/messages';
  import { DOC_LINK } from '$lib/features/commons/constants/doc-links.constants';
  import {
    FileUploaderDropContainer,
    FileUploaderItem,
    InlineLoading,
    InlineNotification,
    Link,
    Loading,
    ProgressBar,
    Tag,
    TextArea,
    TextInput,
    Tile
  } from 'carbon-components-svelte';
  import { CheckmarkFilled, Launch, TrashCan } from 'carbon-icons-svelte';
  import clsx from 'clsx';
  import { SvelteSet } from 'svelte/reactivity';
  import { CreateProjectValidationService } from '../services/validation.service';
  import { PIPELINE_CONST } from '$lib/features/data-pipeline';
  import type { ValidationResult } from '$lib/features/commons/types/validation.types';

  interface Props {
    isModal?: boolean;
    showTitle?: boolean;
    resetToken?: number;
  }

  const {
    isModal = false,
    showTitle = false,
    resetToken = 0
  }: Props = $props();

  let pastedDataValue = $state('');
  let onlineUrlValue = $state('');
  let internalResetKey = $state(0);
  let pasteContainer = $state<HTMLElement | undefined>(undefined);
  let urlImportBlock = $state<HTMLElement | undefined>(undefined);
  let filesSection = $state<HTMLElement | undefined>(undefined);

  const uploaderKey = $derived(resetToken + internalResetKey);

  const IMPORT_FEEDBACK_DURATION_MS = 3000;

  type ImportSource = 'file' | 'paste' | 'url';

  let isImportingPaste = $state(false);
  let confirmedSource = $state<ImportSource | null>(null);
  let pastedFile = $state<UploadedFile | null>(null);
  let highlightedFileIds = $state<string[]>([]);
  let importFeedbackTimeout: ReturnType<typeof setTimeout> | undefined;

  const hasPastedFile = $derived(
    createProjectState.newProject.uploadedFiles.some(
      (f) => f.sourceType === DataSourceType.PASTE
    )
  );

  $effect(() => () => clearTimeout(importFeedbackTimeout));

  const globalValidationErrors = $derived(
    createProjectState.newProject.validationErrors
  );

  let lastProcessedFiles = $state<SvelteSet<string>>(new SvelteSet());
  let previousUploaderKey = 0;
  let previousResetToken = 0;

  $effect(() => {
    if (uploaderKey !== previousUploaderKey) {
      lastProcessedFiles = new SvelteSet();
      previousUploaderKey = uploaderKey;
    }
  });

  $effect(() => {
    if (resetToken !== previousResetToken) {
      pastedDataValue = '';
      onlineUrlValue = '';
      urlValidation = null;
      previousResetToken = resetToken;
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
      await withImportFeedback('file', () =>
        createProjectActions.processFiles(newFiles)
      );
    }
  }

  const AUTO_IMPORT_INPUT_TYPES = new Set([
    'insertFromPaste',
    'insertFromDrop'
  ]);

  function isAutoImportInput(event: Event): boolean {
    return (
      event instanceof InputEvent &&
      !!event.inputType &&
      AUTO_IMPORT_INPUT_TYPES.has(event.inputType)
    );
  }

  function staysInside(container: HTMLElement | undefined, event: Event) {
    const next = (event as FocusEvent).relatedTarget;
    return next instanceof Node && !!container?.contains(next);
  }

  async function handlePasteData() {
    if (!pastedDataValue.trim()) return;
    if (pastedDataValidation && !pastedDataValidation.isValid) return;

    isImportingPaste = true;
    try {
      await withImportFeedback('paste', () =>
        createProjectActions.processPastedData(pastedDataValue)
      );
    } finally {
      pastedDataValue = '';
      isImportingPaste = false;
    }
  }

  async function withImportFeedback(
    source: ImportSource,
    runImport: () => Promise<void>
  ) {
    const previousStatus = new Map(
      createProjectState.newProject.uploadedFiles.map((f) => [f.id, f.status])
    );
    await runImport();

    const completedFiles = createProjectState.newProject.uploadedFiles.filter(
      (f) =>
        f.status === FileStatus.COMPLETE &&
        previousStatus.get(f.id) !== FileStatus.COMPLETE
    );
    if (completedFiles.length > 0) {
      showImportFeedback(source, completedFiles);
    }
  }

  function showImportFeedback(source: ImportSource, files: UploadedFile[]) {
    clearTimeout(importFeedbackTimeout);
    confirmedSource = source;
    pastedFile = source === 'paste' ? files[0] : null;
    highlightedFileIds = files.map((f) => f.id);
    importFeedbackTimeout = setTimeout(() => {
      confirmedSource = null;
      pastedFile = null;
      highlightedFileIds = [];
    }, IMPORT_FEEDBACK_DURATION_MS);

    const lastFileId = files[files.length - 1].id;
    requestAnimationFrame(() => {
      filesSection
        ?.querySelector(`[data-file-id="${CSS.escape(lastFileId)}"]`)
        ?.scrollIntoView({
          block: 'nearest',
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)')
            .matches
            ? 'auto'
            : 'smooth'
        });
    });
  }

  function dismissPasteFeedback() {
    pastedFile = null;
  }

  async function handleLoadOnlineFile() {
    createProjectActions.setNewProjectError();

    const trimmedUrl = onlineUrlValue.trim();
    if (!trimmedUrl) {
      return;
    }

    urlValidation = CreateProjectValidationService.validateURL(trimmedUrl);

    if (!urlValidation.isValid) {
      return;
    }

    createProjectActions.setOnlineFileUrl(trimmedUrl);
    await withImportFeedback('url', () =>
      createProjectActions.loadOnlineFile()
    );
    if (!createProjectState.newProject.error) {
      onlineUrlValue = '';
    }
  }

  function handlePastedDataInput(event: CarbonValueEvent) {
    dismissPasteFeedback();
    pastedDataValue = readCarbonStringValue(event, pastedDataValue);
    if (isAutoImportInput(event)) {
      void handlePasteData();
    }
  }

  function handlePastedDataBlur(event: CarbonValueEvent) {
    if (staysInside(pasteContainer, event)) return;
    void handlePasteData();
  }

  function handleOnlineUrlInput(event: CarbonValueEvent) {
    onlineUrlValue = readCarbonStringValue(event, onlineUrlValue);
  }

  function handleOnlineUrlPaste(event: ClipboardEvent) {
    const pastedUrl = event.clipboardData?.getData('text')?.trim();
    if (!pastedUrl) return;

    event.preventDefault();
    onlineUrlValue = pastedUrl;
    void handleLoadOnlineFile();
  }

  function handleOnlineUrlBlur(event: CarbonValueEvent) {
    if (staysInside(urlImportBlock, event)) return;
    void handleLoadOnlineFile();
  }

  function handleOnlineUrlKeydown(event: KeyboardEvent) {
    if (event.key !== KEY.ENTER) return;
    event.preventDefault();
    void handleLoadOnlineFile();
  }

  let deletingFileIds = $state<SvelteSet<string>>(new SvelteSet());
  let isDeletingAll = $state(false);

  async function handleRemoveFile(fileId: string) {
    deletingFileIds.add(fileId);
    try {
      await createProjectActions.removeUploadedFile(fileId);
      lastProcessedFiles = new SvelteSet();
      internalResetKey++;
    } finally {
      deletingFileIds.delete(fileId);
    }
  }

  async function handleClearAllFiles() {
    isDeletingAll = true;
    try {
      await createProjectActions.clearAllFiles(true);
      lastProcessedFiles = new SvelteSet();
      internalResetKey++;
    } finally {
      isDeletingAll = false;
    }
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
    [FileType.GPX]: { label: 'GPX', color: 'magenta' },
    [FileType.ZIP]: { label: 'ZIP', color: 'gray' },
    [FileType.UNKNOWN]: {
      get label() {
        return m.create_project_file_type_unknown();
      },
      color: 'gray'
    }
  };

  const SHAPEFILE_REQUIRED_EXTENSIONS =
    PIPELINE_CONST.EXTENSIONS.SHAPEFILE_REQUIRED;
  const SHAPEFILE_REQUIRED_EXTENSION_SET = new Set<string>(
    SHAPEFILE_REQUIRED_EXTENSIONS
  );
  const SHAPEFILE_OPTIONAL_EXTENSIONS =
    SUPPORTED_FILE_TYPES.shapefile.extensions.filter(
      (extension) => !SHAPEFILE_REQUIRED_EXTENSION_SET.has(extension)
    );
  const SHAPEFILE_COMPONENT_GROUPS = [
    { key: 'required', extensions: SHAPEFILE_REQUIRED_EXTENSIONS },
    { key: 'optional', extensions: SHAPEFILE_OPTIONAL_EXTENSIONS }
  ];

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

  const getFileTypeTag = (file: Pick<UploadedFile, 'fileType' | 'name'>) => {
    if (
      file.fileType === FileType.GEOPARQUET &&
      getFileExtension(file.name) === '.parquet'
    ) {
      return { label: 'Parquet', color: 'teal' as const };
    }

    return FILE_TYPE_TAGS[file.fileType] ?? FILE_TYPE_TAGS[FileType.UNKNOWN];
  };

  function getFileExtension(fileName: string): string {
    const extensionStart = fileName.lastIndexOf('.');
    return extensionStart >= 0
      ? fileName.substring(extensionStart).toLowerCase()
      : '';
  }

  function getPresentShapefileExtensions(
    relatedFiles?: readonly string[]
  ): Set<string> {
    return new Set(relatedFiles?.map(getFileExtension) ?? []);
  }
</script>

<section
  id="khartis-create-new-project"
  data-testid="create-new-project-section"
  class={clsx('grid grid-cols-1 gap-3', isModal && 'is-modal-create-project')}
>
  <header class="mb-4">
    {#if showTitle}
      <h6 class="mb-3">{m.create_project_import_data()}</h6>
    {/if}

    <ul class="import-formats text-grey">
      <li>{m.create_project_import_data_tabular()}</li>
      <li>{m.create_project_import_data_geographic()}</li>
    </ul>
  </header>

  <div class="import-grid">
    <div class:is-confirmed={confirmedSource === 'file'}>
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

    <div class="paste-container" bind:this={pasteContainer}>
      <TextArea
        value={pastedDataValue}
        placeholder={hasPastedFile
          ? m.create_project_paste_another()
          : m.create_project_paste_data()}
        rows={4}
        on:input={handlePastedDataInput}
        on:blur={handlePastedDataBlur}
        invalid={!!(pastedDataValidation && !pastedDataValidation.isValid)}
        invalidText={pastedDataValidation?.errors[0] || ''}
        warn={!isImportingPaste &&
          !!pastedDataValidation &&
          pastedDataValidation.warnings.length > 0}
        warnText={pastedDataValidation?.warnings[0] || ''}
      />
      {#if pastedFile}
        <div class="paste-feedback" role="status" data-testid="paste-feedback">
          <CheckmarkFilled size={20} class="paste-feedback-icon" />
          <span class="paste-feedback-title">
            {m.create_project_paste_added()}
          </span>
          <span class="paste-feedback-metrics">
            {formatValue(pastedFile.rowCount ?? 0)}
            {m.rows()}
            {m.separator_middle_dot_space()}
            {formatValue(pastedFile.columnCount ?? 0)}
            {m.columns()}
          </span>
        </div>
      {/if}
      {#if pastedDataValue.trim() && !isImportingPaste}
        <div class="paste-actions">
          <Button
            size="field"
            kind="ghost"
            onclick={() => (pastedDataValue = '')}
          >
            {m.create_project_clear_button()}
          </Button>
        </div>
      {/if}
    </div>
  </div>

  <div class="grid grid-cols-1 gap-7">
    <div
      class="url-import-block"
      class:is-confirmed={confirmedSource === 'url'}
      bind:this={urlImportBlock}
    >
      <TextInput
        size="sm"
        value={onlineUrlValue}
        labelText={m.create_project_online_file_link()}
        placeholder={m.url_placeholder_example()}
        disabled={createProjectState.newProject.isLoading}
        on:input={handleOnlineUrlInput}
        on:paste={handleOnlineUrlPaste}
        on:blur={handleOnlineUrlBlur}
        on:keydown={handleOnlineUrlKeydown}
        invalid={!!(urlValidation && !urlValidation.isValid)}
        invalidText={urlValidation?.errors[0] || ''}
        warn={!!(urlValidation && urlValidation.warnings.length > 0)}
        warnText={urlValidation?.warnings[0] || ''}
      />

      {#if createProjectState.newProject.isLoading}
        <InlineLoading
          status="active"
          description={m.create_project_loading_status()}
        />
      {:else}
        <div class="learn-more">
          <span>{m.create_project_learn_more_title()}</span>
          <ul>
            <li>
              <Link
                href={DOC_LINK.IMPORT_DATA}
                target="_blank"
                size="sm"
                icon={Launch}
              >
                {m.create_project_learn_more_data()}
              </Link>
            </li>
            <li>
              <Link
                href={DOC_LINK.JOIN_BASEMAP}
                target="_blank"
                size="sm"
                icon={Launch}
              >
                {m.create_project_learn_more_basemaps()}
              </Link>
            </li>
          </ul>
        </div>
      {/if}
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

    <div class="files-section" bind:this={filesSection}>
      {#if globalValidationErrors.length > 0}
        <InlineNotification
          kind="error"
          title={m.create_project_validation_errors()}
          subtitle={globalValidationErrors.join(m.separator_comma_space())}
          lowContrast
          hideCloseButton
        />
      {/if}

      {#if createProjectState.newProject.uploadedFiles.length > 0}
        <div class="files-header">
          <span class="files-imported-label">
            {m.create_project_file_imported()}
          </span>
          {#if createProjectState.newProject.uploadedFiles.length > 1}
            <Button
              size="field"
              kind="ghost"
              icon={isDeletingAll ? undefined : TrashCan}
              disabled={isDeletingAll}
              onclick={handleClearAllFiles}
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
        <div
          class="file-item-wrapper"
          class:is-just-added={highlightedFileIds.includes(file.id)}
          data-file-id={file.id}
        >
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
                onclick={() => handleRemoveFile(file.id)}
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
                onclick={() => handleRemoveFile(file.id)}
              >
                {#if deletingFileIds.has(file.id)}
                  <Loading small withOverlay={false} />
                {/if}
              </Button>
            </div>
          {:else if file.status === FileStatus.INCOMPLETE}
            {@const fileTag = getFileTypeTag(file)}
            <div data-testid="file-incomplete">
              <Tile class="file-incomplete-tile">
                <div class="file-header">
                  <div class="file-identity">
                    <Tag size="sm" type={fileTag.color}>
                      {fileTag.label}
                    </Tag>
                    <Tag size="sm" type="warm-gray">
                      {m.shapefile_incomplete_title()}
                    </Tag>
                    <span class="file-name" title={file.name}>{file.name}</span>
                  </div>
                  <Button
                    size="small"
                    kind="ghost"
                    iconDescription={m.remove_file_action()}
                    icon={deletingFileIds.has(file.id) ? undefined : TrashCan}
                    disabled={deletingFileIds.has(file.id)}
                    onclick={() => handleRemoveFile(file.id)}
                  >
                    {#if deletingFileIds.has(file.id)}
                      <Loading small withOverlay={false} />
                    {/if}
                  </Button>
                </div>

                {@render shapefileComponents(file.relatedFiles)}
              </Tile>
            </div>
          {:else if file.status === FileStatus.COMPLETE}
            {@const fileTag = getFileTypeTag(file)}
            {@const rowCount = file.rowCount ?? 0}
            {@const columnCount = file.columnCount ?? 0}
            <div data-testid="file-complete">
              <Tile class="file-complete-tile">
                <div class="file-header">
                  <div class="file-details">
                    <div class="file-identity">
                      <Tag size="sm" type={fileTag.color}>
                        {fileTag.label}
                      </Tag>
                      <span class="file-name" title={file.name}
                        >{file.name}</span
                      >
                    </div>
                    {#if rowCount > 0}
                      <div class="file-metrics">
                        <span data-testid="file-row-count"
                          >{formatValue(rowCount)}</span
                        >
                        {m.rows()}
                        {m.separator_middle_dot_space()}
                        <span data-testid="file-column-count"
                          >{formatValue(columnCount)}</span
                        >
                        {m.columns()}
                      </div>
                    {/if}
                  </div>
                  <Button
                    size="small"
                    kind="ghost"
                    iconDescription={m.remove_file_action()}
                    icon={deletingFileIds.has(file.id) ? undefined : TrashCan}
                    disabled={deletingFileIds.has(file.id)}
                    onclick={() => handleRemoveFile(file.id)}
                  >
                    {#if deletingFileIds.has(file.id)}
                      <Loading small withOverlay={false} />
                    {/if}
                  </Button>
                </div>

                {#if file.fileType === FileType.SHAPEFILE && file.relatedFiles && file.relatedFiles.length > 0}
                  {@render shapefileComponents(file.relatedFiles)}
                {/if}

                {#if file.validation?.errors && file.validation.errors.length > 0}
                  <InlineNotification
                    lowContrast
                    kind="error"
                    title={m.create_project_error_status()}
                    subtitle={file.validation.errors.join(
                      m.separator_comma_space()
                    )}
                    hideCloseButton
                  />
                {/if}

                {#if file.validation?.warnings && file.validation.warnings.length > 0}
                  <InlineNotification
                    lowContrast
                    kind="warning"
                    title={m.create_project_validation_errors()}
                    subtitle={file.validation.warnings.join(
                      m.separator_comma_space()
                    )}
                    hideCloseButton
                  />
                {/if}
              </Tile>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  </div>
</section>

{#snippet shapefileComponents(relatedFiles?: readonly string[])}
  {@const presentExtensions = getPresentShapefileExtensions(relatedFiles)}
  <div class="shapefile-components">
    {#each SHAPEFILE_COMPONENT_GROUPS as group (group.key)}
      {#each group.extensions as extension (extension)}
        {@const isPresent = presentExtensions.has(extension)}
        <Tag size="sm" type={isPresent ? 'purple' : 'gray'}>
          {extension}{isPresent ? m.separator_check_mark() : ''}
        </Tag>
      {/each}
    {/each}
  </div>
{/snippet}

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

  .import-formats,
  .learn-more ul {
    list-style: disc;
    padding-left: var(--cds-spacing-06);
  }

  .learn-more {
    font-size: var(--kh-font-label);
    line-height: var(--kh-line-label);
    color: var(--cds-text-secondary);
  }

  .paste-feedback {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--kh-gap-label);
    padding: var(--cds-spacing-04);
    background: var(--cds-layer-01);
    border: 2px solid var(--cds-support-success);
    pointer-events: none;
    text-align: center;
    animation: kh-fade-in 150ms ease-out;
  }

  .paste-feedback :global(.paste-feedback-icon) {
    fill: var(--cds-support-success);
  }

  .paste-feedback-title {
    font-weight: 600;
    font-size: var(--kh-font-body);
    line-height: var(--kh-line-body);
    color: var(--cds-text-primary);
  }

  .paste-feedback-metrics {
    font-size: var(--kh-font-label);
    line-height: var(--kh-line-label);
    color: var(--cds-text-secondary);
  }

  .file-item-wrapper.is-just-added :global(.bx--tile),
  .is-confirmed :global(.bx--file__drop-container),
  .is-confirmed :global(.bx--text-input) {
    animation: kh-just-added 3s ease-out;
  }

  @keyframes kh-fade-in {
    from {
      opacity: 0;
    }
  }

  @keyframes kh-just-added {
    0%,
    40% {
      box-shadow: inset 0 0 0 2px var(--cds-support-success);
    }
    100% {
      box-shadow: inset 0 0 0 2px transparent;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .paste-feedback {
      animation: none;
    }

    .file-item-wrapper.is-just-added :global(.bx--tile),
    .is-confirmed :global(.bx--file__drop-container),
    .is-confirmed :global(.bx--text-input) {
      animation: none;
      box-shadow: inset 0 0 0 2px var(--cds-support-success);
    }
  }

  .paste-actions {
    display: flex;
    gap: var(--cds-spacing-03);
    margin-top: var(--cds-spacing-03);
    justify-content: flex-end;
  }

  .is-modal-create-project .files-section {
    min-height: 7.125rem;
  }

  .files-section {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-04);
  }

  .files-imported-label {
    font-size: var(--kh-font-label);
    line-height: var(--kh-line-label);
    color: var(--cds-text-secondary);
    letter-spacing: 0.32px;
  }

  .files-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    min-height: var(--kh-size-sm);
    border-bottom: 1px solid var(--cds-border-subtle);
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

  .file-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--kh-gap-inline);
  }

  .file-details {
    display: flex;
    flex-direction: column;
    gap: var(--kh-gap-label);
    flex: 1;
    min-width: 0;
  }

  .file-identity {
    display: flex;
    align-items: center;
    gap: var(--kh-gap-inline);
    min-width: 0;
  }

  .file-identity :global(.bx--tag) {
    margin: 0;
    flex-shrink: 0;
  }

  .file-name {
    font-weight: 600;
    font-size: var(--kh-font-body);
    line-height: var(--kh-line-body);
    color: var(--cds-text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-metrics {
    font-size: var(--kh-font-label);
    line-height: var(--kh-line-label);
    color: var(--cds-text-secondary);
  }

  .shapefile-components {
    margin-top: var(--kh-gap-label);
    display: flex;
    flex-wrap: wrap;
    gap: var(--cds-spacing-02);
  }

  .shapefile-components :global(.bx--tag) {
    margin: 0;
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

  .import-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--cds-spacing-05);
  }

  @media (max-width: 672px) {
    .import-grid {
      grid-template-columns: 1fr;
      gap: var(--cds-spacing-04);
    }
  }

  .url-import-block {
    display: flex;
    flex-direction: column;
    gap: var(--kh-gap-inline);
    align-items: flex-start;
  }

  .url-import-block :global(.bx--text-input-wrapper) {
    width: 100%;
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
