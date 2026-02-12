<script lang="ts">
  import ProjectCard from '$lib/features/commons/components/project-card.svelte';
  import { projectStore } from '$lib/features/commons/store/project.store.svelte';
  import {
    formatDate,
    formatFileSize
  } from '$lib/features/commons/utils/format.utils';
  import { LogCategory, logger } from '$lib/features/commons/utils/logger';
  import type { SavedProjectMetadata } from '$lib/features/project-management';
  import { m } from '$lib/paraglide/messages';
  import {
    FileUploaderDropContainer,
    InlineNotification,
    Modal,
    OverflowMenu,
    OverflowMenuItem,
    SkeletonPlaceholder,
    Tooltip
  } from 'carbon-components-svelte';
  import { Calendar, Copy, Link, TrashCan } from 'carbon-icons-svelte';
  import { onMount } from 'svelte';
  import { useProjectNavigation } from './hooks';
  import { CreateProjectValidationService } from './services/validation.service';

  interface Props {
    onClose?: () => void;
  }

  const { onClose }: Props = $props();

  const { navigateAfterAction } = useProjectNavigation({
    getOnClose: () => onClose
  });

  const KHARTIS_FILE_EXTENSIONS = ['.kh', '.khartis'];

  let savedProjects = $state<SavedProjectMetadata[]>([]);
  let selectedProjectId = $state<string | null>(null);
  let isLoading = $state(true);
  let error = $state('');
  let isImporting = $state(false);
  let isDuplicating = $state(false);
  let projectToDelete = $state<string | null>(null);
  let showDeleteConfirm = $state(false);

  onMount(async () => {
    await loadProjects();
  });

  async function loadProjects() {
    isLoading = true;
    error = '';

    try {
      savedProjects = await projectStore.listProjects();
    } catch (err) {
      logger.error('Failed to load projects', LogCategory.PROJECT, err);
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
      await navigateAfterAction();
    } catch (err) {
      logger.error('Failed to load project', LogCategory.PROJECT, err);
      error = err instanceof Error ? err.message : 'Failed to load project';
      selectedProjectId = null;
    }
  }

  async function handleFileImport(event: CustomEvent<readonly File[]>) {
    const files = Array.from(event.detail);

    const khFile = files.find((f) => {
      const normalizedName = f.name.toLowerCase();
      return (
        normalizedName.endsWith(KHARTIS_FILE_EXTENSIONS[0]) ||
        normalizedName.endsWith(KHARTIS_FILE_EXTENSIONS[1])
      );
    });

    if (!khFile) {
      logger.error('No valid Khartis file found', LogCategory.PROJECT, {
        fileNames: files.map((f) => f.name)
      });
      error = m.validation_invalid_khartis_file();
      return;
    }

    isImporting = true;
    error = '';

    try {
      await projectStore.importProject(khFile);
      await navigateAfterAction();
    } catch (err) {
      logger.error('Failed to import project', LogCategory.PROJECT, err);
      error = err instanceof Error ? err.message : 'Failed to import project';
    } finally {
      isImporting = false;
    }
  }

  async function handleDuplicateProject(projectId: string) {
    isDuplicating = true;
    error = '';

    try {
      const newProjectId = await projectStore.duplicateProject(projectId);
      await loadProjects();
      selectedProjectId = newProjectId;
    } catch (err) {
      logger.error('Failed to duplicate project', LogCategory.PROJECT, err);
      error =
        err instanceof Error ? err.message : 'Failed to duplicate project';
    } finally {
      isDuplicating = false;
    }
  }

  function confirmDeleteProject(projectId: string) {
    projectToDelete = projectId;
    showDeleteConfirm = true;
  }

  async function handleDeleteProject() {
    if (!projectToDelete) return;

    error = '';
    const deletingId = projectToDelete;
    projectToDelete = null;
    showDeleteConfirm = false;

    try {
      await projectStore.deleteProject(deletingId);

      if (selectedProjectId === deletingId) {
        selectedProjectId = null;
      }

      await loadProjects();
    } catch (err) {
      logger.error('Failed to delete project', LogCategory.PROJECT, err);
      error = err instanceof Error ? err.message : 'Failed to delete project';
    }
  }

  function cancelDelete() {
    projectToDelete = null;
    showDeleteConfirm = false;
  }

  function validateKhartisFiles(files: readonly File[]): readonly File[] {
    return CreateProjectValidationService.validateKhartisFiles(
      Array.from(files)
    );
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
      title={m.create_project_error_label()}
      subtitle={error}
      on:close={() => (error = '')}
    />
  {/if}

  <div class="flex gap-5 overflow-x-auto pb-3">
    {#if isLoading}
      {#each Array(3) as _item, idx (idx)}
        <div class="project-card-skeleton">
          <SkeletonPlaceholder style="width: 200px; height: 150px;" />
        </div>
      {/each}
    {:else if savedProjects.length === 0}
      <div class="no-projects">
        <p class="text-grey">{m.create_project_no_saved_projects()}</p>
      </div>
    {:else}
      {#each savedProjects as project (project.id)}
        <div class="project-card-wrapper">
          <ProjectCard
            title={project.name}
            subtitle={project.description || formatFileSize(project.size)}
            variant="blue"
            selected={selectedProjectId === project.id}
            onclick={() => handleProjectClick(project.id)}
          >
            {#snippet footer()}
              <div class="flex items-center justify-between w-full">
                <div class="flex items-center">
                  <Calendar
                    size={16}
                    style="color: var(--calendar-color); fill: var(--calendar-color);"
                  />
                  <span class="ml-2 text-sm"
                    >{formatDate(project.updatedAt)}</span
                  >
                </div>
                <OverflowMenu
                  size="sm"
                  flipped
                  on:click={(e: MouseEvent) => e.stopPropagation()}
                >
                  <OverflowMenuItem
                    text={m.open_project_duplicate()}
                    disabled={isDuplicating}
                    on:click={(e) => {
                      e.stopPropagation();
                      handleDuplicateProject(project.id);
                    }}
                  >
                    <Copy size={16} />
                  </OverflowMenuItem>
                  <OverflowMenuItem
                    danger
                    text={m.open_project_delete()}
                    on:click={(e) => {
                      e.stopPropagation();
                      confirmDeleteProject(project.id);
                    }}
                  >
                    <TrashCan size={16} />
                  </OverflowMenuItem>
                </OverflowMenu>
              </div>
            {/snippet}
          </ProjectCard>
        </div>
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
        accept={KHARTIS_FILE_EXTENSIONS}
        validateFiles={validateKhartisFiles}
        disabled={isImporting}
        on:change={handleFileImport}
      />
    </div>

    <div class="flex items-center gap-3 text-grey">
      <span>{m.open_project_learn_more_data()}</span>

      <Link size={24} />
    </div>
  </div>

  <Modal
    danger
    bind:open={showDeleteConfirm}
    modalHeading={m.open_project_delete_confirm_title()}
    primaryButtonText={m.open_project_delete_confirm_button()}
    secondaryButtonText={m.open_project_cancel()}
    on:click:button--primary={handleDeleteProject}
    on:click:button--secondary={cancelDelete}
    size="sm"
  >
    <p>
      {m.open_project_delete_confirm_message()}
    </p>
  </Modal>
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

  .project-card-wrapper {
    position: relative;
  }

  .project-card-wrapper :global(.bx--overflow-menu) {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 10;
  }

  .project-card-wrapper :global(.bx--overflow-menu__icon) {
    fill: var(--cds-icon-secondary);
  }

  .project-card-wrapper
    :global(.bx--overflow-menu:hover .bx--overflow-menu__icon) {
    fill: var(--cds-icon-primary);
  }
</style>
