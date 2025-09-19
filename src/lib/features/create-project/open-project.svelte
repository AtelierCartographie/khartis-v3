<script lang="ts">
  import ProjectCard from '$lib/features/commons/components/project-card.svelte';
  import { m } from '$lib/paraglide/messages';
  import {
    FileUploaderDropContainer,
    Tooltip,
    InlineNotification,
    SkeletonPlaceholder
  } from 'carbon-components-svelte';
  import { Calendar, Link } from 'carbon-icons-svelte';
  import { projectStore } from '$lib/features/commons/store/project.store.svelte';
  import {
    createProjectActions,
    createProjectState
  } from '$lib/features/commons/store/create-project.store.svelte';
  import { globalState } from '$lib/features/commons/store/global.svelte';
  import type { SavedProjectMetadata } from '$lib/features/commons/store/project.types';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { formatDate, formatFileSize } from '$lib/features/commons/utils/format.utils';

  interface Props {
    onClose?: () => void;
  }

  const { onClose }: Props = $props();

  let savedProjects = $state<SavedProjectMetadata[]>([]);
  let selectedProjectId = $state<string | null>(null);
  let isLoading = $state(true);
  let error = $state('');
  let isImporting = $state(false);

  onMount(async () => {
    await loadProjects();
  });

  async function loadProjects() {
    isLoading = true;
    error = '';

    try {
      savedProjects = await projectStore.listProjects();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load projects';
    } finally {
      isLoading = false;
    }
  }

  async function handleProjectClick(projectId: string) {
    if (selectedProjectId === projectId) {
      selectedProjectId = null;
      return;
    }

    selectedProjectId = projectId;

    try {
      await projectStore.loadProject(projectId);
      globalState.isCreateProjectModalOpen = false;
      createProjectActions.resetAllTabs();
      onClose?.();
      goto('/');
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load project';
      selectedProjectId = null;
    }
  }

  async function handleFileImport(event: CustomEvent<readonly File[]>) {
    const files = Array.from(event.detail);
    const khFile = files.find(
      (f) => f.name.endsWith('.kh') || f.name.endsWith('.khartis')
    );

    if (!khFile) {
      error = 'Please select a valid .kh or .khartis file';
      return;
    }

    isImporting = true;
    error = '';

    try {
      await projectStore.importProject(khFile);
      globalState.isCreateProjectModalOpen = false;
      createProjectActions.resetAllTabs();
      onClose?.();
      goto('/');
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to import project';
    } finally {
      isImporting = false;
    }
  }

</script>

<section id="khartis-open-project" class="grid grid-cols-1 gap-3">
  <header class="mb-4 flex justify-between items-end">
    <div>
      <h6 class="mb-3">{m.open_project_select_backup()}</h6>

      <span class="text-grey">
        {m.open_project_backup_description()}
      </span>
    </div>

    <Tooltip align="end">
      <p>
        {m.open_project_backup_warning()}
      </p>
    </Tooltip>
  </header>

  {#if error}
    <InlineNotification
      lowContrast
      kind="error"
      title="Error:"
      subtitle={error}
      on:close={() => (error = '')}
    />
  {/if}

  <div class="flex gap-5 overflow-x-auto pb-3">
    {#if isLoading}
      {#each Array(3) as _}
        <div class="project-card-skeleton">
          <SkeletonPlaceholder style="width: 200px; height: 150px;" />
        </div>
      {/each}
    {:else if savedProjects.length === 0}
      <div class="no-projects">
        <p class="text-grey">No saved projects yet</p>
      </div>
    {:else}
      {#each savedProjects as project}
        <ProjectCard
          title={project.name}
          subtitle={project.description || formatFileSize(project.size)}
          variant="blue"
          selected={selectedProjectId === project.id}
          onclick={() => handleProjectClick(project.id)}
        >
          {#snippet footer()}
            <div class="flex items-center">
              <Calendar
                size={16}
                style="color: var(--calendar-color); fill: var(--calendar-color);"
              />
              <span class="ml-2 text-sm">{formatDate(project.updatedAt)}</span>
            </div>
          {/snippet}
        </ProjectCard>
      {/each}
    {/if}
  </div>

  <div class="mt-5">
    <header>
      <h6 class="mb-3">{m.open_project_import_project()}</h6>

      <span class="text-grey">
        {m.open_project_import_description()}
      </span>
    </header>

    <div class="flex items-end gap-3 mt-5 mb-3">
      <FileUploaderDropContainer
        labelText={m.open_project_drag_drop_kh()}
        accept={['.kh', '.khartis']}
        validateFiles={(files) => files}
        disabled={isImporting}
        on:change={handleFileImport}
      />
    </div>

    <div class="flex items-center gap-3 text-grey">
      <span>{m.open_project_learn_more_data()}</span>

      <Link size={24} />
    </div>
  </div>
</section>

<style>
  #khartis-open-project :global(.bx--file-browse-btn) {
    min-width: 100%;
  }

  .project-card-skeleton {
    min-width: 200px;
  }

  .no-projects {
    width: 100%;
    padding: 2rem;
    text-align: center;
    border: 1px dashed var(--cds-border-subtle);
    border-radius: 4px;
  }
</style>
