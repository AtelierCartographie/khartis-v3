<script lang="ts">
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
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
  import { Button, Loading, TextInput } from 'carbon-components-svelte';
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

    hasTriedSubmit = true;

    if (!hasValidName) {
      return;
    }

    if (!hasValidFiles) {
      showError(m.validation_no_files_title(), m.validation_no_files_message());
      return;
    }

    isCreating = true;
    creationStep = m.create_project_processing_status();

    try {
      const safeName = sanitizeProjectName(projectName.trim());

      creationStep = m.create_project_processing_status();
      await projectStore.createProject(safeName, validFiles);

      creationStep = m.create_project_processing_status();

      await projectsStore.refresh();

      createProjectActions.resetAllTabs();

      await goto(base || '/', { replaceState: true });
    } catch (error) {
      const duration = performance.now() - startTime;
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
      icon={isCreating ? undefined : Add}
      disabled={!canCreateProject}
      on:click={handleCreate}
      kind="primary"
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
