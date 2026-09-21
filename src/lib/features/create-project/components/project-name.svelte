<script lang="ts">
  import {
    createProjectActions,
    createProjectState
  } from '$lib/features/commons/stores/create-project.store.svelte';
  import { LogCategory, logger } from '$lib/features/commons/utils/logger';
  import { showError } from '$lib/features/commons/utils/notification.utils.svelte';
  import { sanitizeProjectName } from '$lib/features/commons/utils/sanitize.utils';
  import {
    canSubmitImport,
    getValidImportFiles,
    hasBlockingImportFiles,
    hasImportValidationErrors,
    hasPendingImportFiles
  } from '$lib/features/create-project/services/import-readiness.service';
  import { m } from '$lib/paraglide/messages';
  import { Button, Loading, TextInput } from 'carbon-components-svelte';
  import { Add } from 'carbon-icons-svelte';
  import { KEY } from '$lib/features/commons/constants/dom.constants';
  import { useProjectNavigation } from '../hooks/use-project-navigation.svelte';
  import { CreateProjectValidationService } from '../services/validation.service';
  import { projectStore } from '$lib/features/commons/stores/project.store.svelte';
  import { analyticsService } from '$lib/features/commons/services/analytics.service';
  import { projectsStore } from '$lib/features/commons/stores/projects.store.svelte';
  import {
    readCarbonStringValue,
    type CarbonValueEvent
  } from '$lib/features/commons/utils/carbon-events.utils';

  interface Props {
    onClose?: () => void;
  }

  const { onClose }: Props = $props();

  const { navigateAfterAction } = useProjectNavigation({
    onClose: () => onClose?.()
  });

  function getNextProjectName(): string {
    const existingNames = new Set(projectsStore.projects.map((p) => p.name));
    let number = 1;
    let candidate = m.project_default_name({ number });
    while (existingNames.has(candidate)) {
      number++;
      candidate = m.project_default_name({ number });
    }
    return candidate;
  }

  let isCreating = $state(false);
  let hasTriedSubmit = $state(false);
  let creationStep = $state('');
  let localProjectName = $state.raw(createProjectState.newProject.projectName);

  $effect(() => {
    if (localProjectName !== createProjectState.newProject.projectName) {
      const sanitized = sanitizeProjectName(localProjectName);
      createProjectActions.setProjectName(sanitized);
      if (sanitized !== localProjectName) {
        localProjectName = sanitized;
      }
    }
  });

  const projectName = $derived(createProjectState.newProject.projectName);
  const uploadedFiles = $derived(createProjectState.newProject.uploadedFiles);
  const nameValidation = $derived(
    CreateProjectValidationService.validateProjectName(projectName)
  );
  const hasValidName = $derived(nameValidation.isValid);
  const validFiles = $derived(getValidImportFiles(uploadedFiles));
  const hasValidFiles = $derived(validFiles.length > 0);
  const hasValidationErrors = $derived(
    hasImportValidationErrors(uploadedFiles)
  );
  const hasBlockingFileStatuses = $derived(
    hasBlockingImportFiles(uploadedFiles)
  );
  const hasPendingFiles = $derived(
    hasPendingImportFiles(
      uploadedFiles,
      createProjectState.newProject.isProcessingFiles
    )
  );
  const canCreateProject = $derived(
    (hasValidName || !projectName.trim()) &&
      canSubmitImport(
        uploadedFiles,
        createProjectState.newProject.isProcessingFiles
      ) &&
      !isCreating
  );
  const nameErrors = $derived(
    hasTriedSubmit && !hasValidName ? nameValidation.errors : []
  );

  async function handleCreate() {
    const startTime = performance.now();

    hasTriedSubmit = true;

    let effectiveName = projectName.trim();
    if (!effectiveName) {
      effectiveName = getNextProjectName();
      createProjectActions.setProjectName(effectiveName);
      localProjectName = effectiveName;
    }

    const nameIsValid =
      CreateProjectValidationService.validateProjectName(effectiveName).isValid;
    if (!nameIsValid) {
      return;
    }

    if (!hasValidFiles) {
      showError(m.validation_no_files_title(), m.validation_no_files_message());
      return;
    }

    if (hasPendingFiles || hasValidationErrors || hasBlockingFileStatuses) {
      return;
    }

    isCreating = true;
    creationStep = m.create_project_processing_status();

    try {
      const safeName = sanitizeProjectName(effectiveName);

      await projectStore.createProject(safeName, validFiles);

      await projectsStore.refresh();

      await navigateAfterAction();
    } catch (error) {
      const duration = performance.now() - startTime;
      analyticsService.trackFailure('project_create', error);
      logger.error('Failed to create project', LogCategory.PROJECT, {
        duration: `${duration.toFixed(2)}ms`,
        error
      });

      const errorMessage =
        error instanceof Error
          ? error.message
          : m.error_project_creation_failed();
      showError(m.error_project_creation_failed(), errorMessage);
    } finally {
      isCreating = false;
      creationStep = '';
    }
  }

  $effect(() => {
    if (hasTriedSubmit && localProjectName.trim()) {
      hasTriedSubmit = false;
    }
  });

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === KEY.ENTER && canCreateProject) {
      event.preventDefault();
      handleCreate();
    }
  }

  function handleProjectNameInput(event: CarbonValueEvent) {
    localProjectName = readCarbonStringValue(event, localProjectName);
  }
</script>

<div class="project-name-footer">
  <div class="project-name-row">
    <div class="flex items-center gap-2">
      <span class="text-grey whitespace-nowrap">
        {m.project_name_label()}
      </span>
    </div>

    <div class="flex-1 relative project-name-input-wrapper">
      <TextInput
        size="sm"
        data-testid="project-name-input"
        placeholder={m.project_name_placeholder()}
        value={localProjectName}
        on:input={handleProjectNameInput}
        on:keydown={handleKeyDown}
        disabled={isCreating}
        invalid={nameErrors.length > 0}
        invalidText={nameErrors[0] || ''}
        maxlength={100}
      />
      {#if hasValidName && !hasTriedSubmit && projectName.trim().length > 0}
        <div class="character-count">
          {m.project_name_character_count({
            count: projectName.trim().length
          })}
        </div>
      {/if}
    </div>

    <Button
      size="field"
      icon={isCreating ? undefined : Add}
      disabled={!canCreateProject}
      on:click={handleCreate}
      kind="primary"
      class="create-project-btn"
    >
      {#if isCreating}
        <div class="button-with-loader">
          <Loading small withOverlay={false} />
          <span>{creationStep || m.create_project_creating_status()}</span>
        </div>
      {:else}
        {m.project_name_create()}
      {/if}
    </Button>
  </div>
</div>

<style>
  .project-name-footer {
    width: 100%;
    margin-top: var(--cds-spacing-05);
    border-radius: 0 0 var(--cds-border-radius) var(--cds-border-radius);
  }

  .project-name-row {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-05);
    padding: var(--cds-spacing-04);
    background: var(--cds-background);
    border-top: 1px solid var(--cds-border-subtle);
  }

  @media (max-width: 672px) {
    .project-name-row {
      flex-direction: column;
      align-items: stretch;
      gap: var(--cds-spacing-03);
    }

    .project-name-row :global(.create-project-btn) {
      width: 100%;
      justify-content: center;
    }
  }

  .character-count {
    position: absolute;
    right: 0;
    top: 100%;
    margin-top: 2px;
    font-size: 0.75rem;
    color: var(--cds-text-secondary);
  }

  .relative {
    position: relative;
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
</style>
