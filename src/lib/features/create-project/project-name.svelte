<script lang="ts">
  import { goto } from '$app/navigation';
  import {
    createProjectActions,
    createProjectState
  } from '$lib/features/commons/store/create-project.store.svelte';
  import { globalState } from '$lib/features/commons/store/global.svelte';
  import { projectStore } from '$lib/features/commons/store/project.store.svelte';
  import { showError } from '$lib/features/commons/utils/notification.utils.svelte';
  import { sanitizeProjectName } from '$lib/features/commons/utils/sanitize.utils';
  import { m } from '$lib/paraglide/messages';
  import { Button, TextInput } from 'carbon-components-svelte';
  import { Add } from 'carbon-icons-svelte';

  interface Props {
    onClose?: () => void;
  }

  const { onClose }: Props = $props();

  let isCreating = $state(false);
  let hasTriedSubmit = $state(false);
  // Local state for the input that syncs with the store
  let localProjectName = $state(createProjectState.newProject.projectName);

  // Sync local state with store changes
  $effect(() => {
    localProjectName = createProjectState.newProject.projectName;
  });

  // Update store when local state changes with sanitization
  $effect(() => {
    if (localProjectName !== createProjectState.newProject.projectName) {
      const sanitized = sanitizeProjectName(localProjectName);
      createProjectActions.setProjectName(sanitized);
      // Update local if sanitization changed the value
      if (sanitized !== localProjectName) {
        localProjectName = sanitized;
      }
    }
  });

  // Use reactive getters to ensure reactivity
  const projectName = $derived(createProjectState.newProject.projectName);
  const uploadedFiles = $derived(createProjectState.newProject.uploadedFiles);
  const hasValidName = $derived(projectName.trim().length > 0);
  const validFiles = $derived(uploadedFiles.filter(f => f.status === 'complete'));
  const hasValidFiles = $derived(validFiles.length > 0);
  const canCreateProject = $derived(hasValidName && hasValidFiles && !isCreating);


  async function handleCreate() {
    hasTriedSubmit = true;

    if (!hasValidName) {
      return; // Error is shown in the input field
    }

    if (!hasValidFiles) {
      showError('No files', 'Please add at least one valid file');
      return;
    }

    isCreating = true;

    try {
      // Sanitize project name before creating
      const safeName = sanitizeProjectName(projectName.trim());
      await projectStore.createProject(safeName, validFiles);

      globalState.isCreateProjectModalOpen = false;
      createProjectActions.resetAllTabs();
      onClose?.();
      goto('/');
    } catch (error) {
      console.error('Failed to create project:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to create project';
      showError('Failed to create project', errorMessage);
    } finally {
      isCreating = false;
    }
  }

  // Clear error when user types
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
          placeholder={m.project_name_placeholder()}
          bind:value={localProjectName}
          on:keydown={handleKeyDown}
          disabled={isCreating}
          invalid={hasTriedSubmit && !hasValidName}
          invalidText="Project name is required"
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
        {isCreating ? 'Creating...' : m.project_name_create()}
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
