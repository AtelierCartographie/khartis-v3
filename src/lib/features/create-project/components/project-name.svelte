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
    getValidImportFiles
  } from '$lib/features/create-project/services/import-readiness.service';
  import { m } from '$lib/paraglide/messages';
  import { Button, Loading } from 'carbon-components-svelte';
  import { Add } from 'carbon-icons-svelte';
  import { useProjectNavigation } from '../hooks/use-project-navigation.svelte';
  import { projectStore } from '$lib/features/commons/stores/project.store.svelte';
  import { analyticsService } from '$lib/features/commons/services/analytics.service';
  import { projectsStore } from '$lib/features/commons/stores/projects.store.svelte';

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
  let creationStep = $state('');

  const uploadedFiles = $derived(createProjectState.newProject.uploadedFiles);
  const validFiles = $derived(getValidImportFiles(uploadedFiles));
  const canCreateProject = $derived(
    canSubmitImport(
      uploadedFiles,
      createProjectState.newProject.isProcessingFiles
    ) && !isCreating
  );

  async function handleCreate() {
    const startTime = performance.now();
    const safeName = sanitizeProjectName(
      createProjectState.newProject.projectName.trim() || getNextProjectName()
    );

    isCreating = true;
    creationStep = m.create_project_processing_status();

    try {
      createProjectActions.setProjectName(safeName);

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
</script>

<div class="project-create-footer">
  <Button
    expressive
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

<style>
  .project-create-footer {
    display: flex;
    justify-content: flex-end;
    width: 100%;
    padding-top: var(--kh-gap-param);
    border-top: 1px solid var(--cds-border-subtle);
  }

  @media (max-width: 672px) {
    .project-create-footer :global(.create-project-btn) {
      width: 100%;
      justify-content: center;
    }
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
