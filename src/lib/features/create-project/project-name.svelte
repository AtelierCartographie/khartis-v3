<script lang="ts">
  import { goto } from '$app/navigation';
  import {
    createProjectActions,
    createProjectState
  } from '$lib/features/commons/store/create-project.store.svelte';
  import { globalState } from '$lib/features/commons/store/global.svelte';
  import { projectStore } from '$lib/features/commons/store/project.store.svelte';
  import { projectsStore } from '$lib/features/commons/store/projects.store.svelte';
  import { LogCategory, logger } from '$lib/features/commons/utils/logger';
  import { showError } from '$lib/features/commons/utils/notification.utils.svelte';
  import { sanitizeProjectName } from '$lib/features/commons/utils/sanitize.utils';
  import { m } from '$lib/paraglide/messages';
  import { Button, TextInput } from 'carbon-components-svelte';
  import { Add } from 'carbon-icons-svelte';
  import { CreateProjectValidationService } from './services/validation.service';

  interface Props {
    onClose?: () => void;
  }

  const { onClose }: Props = $props();

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
  const validFiles = $derived(
    uploadedFiles.filter((f) => f.status === 'complete')
  );
  const hasValidFiles = $derived(validFiles.length > 0);
  const canCreateProject = $derived(
    hasValidName && hasValidFiles && !isCreating
  );
  const nameErrors = $derived(
    hasTriedSubmit && !hasValidName ? nameValidation.errors : []
  );

  async function handleCreate() {
    const startTime = performance.now();
    console.log(
      `[${new Date().toISOString()}] [project-name:handleCreate] START`
    );

    hasTriedSubmit = true;

    if (!hasValidName) {
      console.log(
        `[${new Date().toISOString()}] [project-name:handleCreate] Aborted - invalid project name`
      );
      logger.warn(
        'Project creation attempted without name',
        LogCategory.PROJECT
      );
      return;
    }

    if (!hasValidFiles) {
      console.log(
        `[${new Date().toISOString()}] [project-name:handleCreate] Aborted - no valid files`
      );
      logger.warn(
        'Project creation attempted without valid files',
        LogCategory.PROJECT
      );
      showError('No files', 'Please add at least one valid file');
      return;
    }

    isCreating = true;
    creationStep = 'Processing files...';
    console.log(
      `[${new Date().toISOString()}] [project-name:handleCreate] Creating project...`,
      {
        projectName: projectName.trim(),
        validFilesCount: validFiles.length
      }
    );

    logger.info('Creating new project', LogCategory.PROJECT, {
      name: projectName.trim(),
      filesCount: validFiles.length
    });

    try {
      console.log(
        `[${new Date().toISOString()}] [project-name:handleCreate] Sanitizing project name...`
      );
      const safeName = sanitizeProjectName(projectName.trim());

      console.log(
        `[${new Date().toISOString()}] [project-name:handleCreate] Calling projectStore.createProject...`
      );
      creationStep = 'Analyzing data...';
      const createStart = performance.now();
      await projectStore.createProject(safeName, validFiles);
      console.log(
        `[${new Date().toISOString()}] [project-name:handleCreate] Project created`,
        {
          duration: `${(performance.now() - createStart).toFixed(2)}ms`
        }
      );

      creationStep = 'Finalizing...';

      console.log(
        `[${new Date().toISOString()}] [project-name:handleCreate] Refreshing projects store...`
      );
      await projectsStore.refresh();

      logger.success('Project created successfully', LogCategory.PROJECT, {
        name: safeName
      });

      console.log(
        `[${new Date().toISOString()}] [project-name:handleCreate] Resetting tabs and navigating...`
      );
      createProjectActions.resetAllTabs();
      await goto('/', { replaceState: true });

      const totalDuration = performance.now() - startTime;
      console.log(
        `[${new Date().toISOString()}] [project-name:handleCreate] END`,
        {
          totalDuration: `${totalDuration.toFixed(2)}ms`
        }
      );
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(
        `[${new Date().toISOString()}] [project-name:handleCreate] ERROR`,
        {
          duration: `${duration.toFixed(2)}ms`,
          error
        }
      );

      logger.error('Failed to create project', LogCategory.PROJECT, error);
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to create project';
      showError('Failed to create project', errorMessage);
    } finally {
      console.log(
        `[${new Date().toISOString()}] [project-name:handleCreate] FINALLY - closing modal`
      );
      // Always close modal and reset state, even on error
      isCreating = false;
      creationStep = '';
      globalState.isCreateProjectModalOpen = false;
      onClose?.();
    }
  }

  $effect(() => {
    if (hasTriedSubmit && localProjectName.trim()) {
      hasTriedSubmit = false;
    }
  });

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter' && canCreateProject) {
      event.preventDefault();
      handleCreate();
    }
  }
</script>

<div class="project-name-footer">
  <div class="flex items-center gap-5 p-4 border-t bg-white">
    <div class="flex items-center gap-2">
      <span class="text-grey whitespace-nowrap">
        {m.project_name_label()}
      </span>
      <span class="text-red-600">*</span>
    </div>

    <div class="flex-1 relative">
      <TextInput
        data-testid="project-name-input"
        placeholder={m.project_name_placeholder()}
        bind:value={localProjectName}
        on:keydown={handleKeyDown}
        disabled={isCreating}
        invalid={nameErrors.length > 0}
        invalidText={nameErrors[0] || ''}
        maxlength={100}
      />
      {#if hasValidName && !hasTriedSubmit}
        <div class="character-count">
          {projectName.trim().length} / 100
        </div>
      {/if}
    </div>

    <Button
      size="field"
      icon={Add}
      disabled={!canCreateProject}
      on:click={handleCreate}
      kind="primary"
    >
      {isCreating ? creationStep || 'Creating...' : m.project_name_create()}
    </Button>
  </div>
</div>

<style>
  .project-name-footer {
    width: 100%;
    margin-top: var(--cds-spacing-05);
    border-radius: 0 0 var(--cds-border-radius) var(--cds-border-radius);
  }

  .text-red-600 {
    color: var(--cds-text-error);
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
</style>
