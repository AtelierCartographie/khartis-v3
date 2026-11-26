<script lang="ts">
  import ContentSwitcher from '$lib/features/commons/components/palette-popover/content-switcher.svelte';
  import Tooltip from '$lib/features/commons/components/carbon/tooltip.svelte';
  import ProjectCard from '$lib/features/commons/components/project-card.svelte';
  import { LogCategory, logger } from '$lib/features/commons/utils/logger';
  import { analyticsService } from '$lib/features/commons/services/analytics.service';
  import { horizontalWheelScroll } from '$lib/features/commons/utils/horizontal-wheel-scroll';
  import {
    matchesProjectSearch,
    projectRepository,
    readBrowserStorageStatus,
    type BrowserStorageStatus,
    type ListedProjectMetadata
  } from '$lib/features/project-management';
  import { m } from '$lib/paraglide/messages';
  import { portal } from '$lib/features/commons/utils/portal';
  import {
    Button,
    FileUploaderDropContainer,
    InlineNotification,
    Modal,
    OverflowMenu,
    OverflowMenuItem,
    ProgressBar,
    Search,
    SkeletonPlaceholder
  } from 'carbon-components-svelte';
  import { Calendar, DataBase, TrashCan } from 'carbon-icons-svelte';
  import { onMount } from 'svelte';
  import {
    readCarbonStringValue,
    type CarbonValueEvent
  } from '$lib/features/commons/utils/carbon-events.utils';
  import { useProjectNavigation } from '../hooks/use-project-navigation.svelte';
  import { CreateProjectValidationService } from '../services/validation.service';
  import { projectStore } from '$lib/features/commons/stores/project.store.svelte';
  import { createProjectActions } from '$lib/features/commons/stores/create-project.store.svelte';
  import {
    formatApproximateSize,
    formatDate
  } from '$lib/features/commons/utils/format.utils';

  interface Props {
    onClose?: () => void;
  }

  const { onClose }: Props = $props();

  const { navigateAfterAction } = useProjectNavigation({
    onClose: () => onClose?.()
  });

  const KHARTIS_FILE_EXTENSIONS = ['.kh', '.khartis'];
  const STORAGE_NEARLY_FULL_RATIO = 0.8;
  const SORT_BY_SIZE_INDEX = 1;

  let savedProjects = $state<ListedProjectMetadata[]>([]);
  let storageStatus = $state<BrowserStorageStatus | null>(null);
  let projectBytes = $state(0);
  let sortIndex = $state(0);
  let searchQuery = $state('');
  let cardRail = $state<HTMLDivElement | null>(null);
  let selectedProjectId = $state<string | null>(null);
  let isLoading = $state(true);
  let error = $state('');
  let isImporting = $state(false);
  let isDuplicating = $state(false);
  let projectToDelete = $state<string | null>(null);
  let showDeleteConfirm = $state(false);
  let showDeleteAllConfirm = $state(false);

  // The offline app's Cache Storage shares the quota: what it holds is
  // taken off the space shown as available to projects.
  const availableBytes = $derived(
    storageStatus
      ? Math.max(
          projectBytes,
          storageStatus.quota - Math.max(0, storageStatus.usage - projectBytes)
        )
      : 0
  );
  const storageNearlyFull = $derived(
    availableBytes > 0 &&
      projectBytes / availableBytes >= STORAGE_NEARLY_FULL_RATIO
  );
  const visibleProjects = $derived.by(() => {
    const matching = savedProjects.filter((project) =>
      matchesProjectSearch(
        [project.name, project.description, project.search?.text],
        searchQuery
      )
    );
    return sortIndex === SORT_BY_SIZE_INDEX
      ? matching.sort((a, b) => b.storageBytes - a.storageBytes)
      : matching;
  });

  function handleSearchInput(event: CarbonValueEvent) {
    searchQuery = readCarbonStringValue(event, searchQuery);
    cardRail?.scrollTo({ left: 0 });
  }
  const reclaimableOnDelete = $derived(
    savedProjects.find((project) => project.id === projectToDelete)
      ?.reclaimableBytes
  );

  onMount(async () => {
    await loadProjects();
  });

  async function loadProjects() {
    isLoading = true;
    error = '';

    try {
      [savedProjects, storageStatus, projectBytes] = await Promise.all([
        projectStore.listProjects(),
        readBrowserStorageStatus(),
        projectRepository.measureStorage()
      ]);
    } catch (err) {
      logger.error('Failed to load projects', LogCategory.PROJECT, err);
      error =
        err instanceof Error
          ? err.message
          : m.open_project_error_load_projects();
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
    createProjectActions.setOpeningProject(true);

    try {
      await projectStore.loadProject(projectId);
      await navigateAfterAction();
    } catch (err) {
      analyticsService.trackFailure('project_open', err);
      logger.error('Failed to load project', LogCategory.PROJECT, err);
      error =
        err instanceof Error
          ? err.message
          : m.open_project_error_load_project();
      selectedProjectId = null;
    } finally {
      createProjectActions.setOpeningProject(false);
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
      error = m.validation_invalid_khartis_file();
      return;
    }

    isImporting = true;
    createProjectActions.setOpeningProject(true);
    error = '';

    try {
      await projectStore.importProject(khFile);
      analyticsService.trackProjectOpened('backup_file');
      await navigateAfterAction();
    } catch (err) {
      analyticsService.trackFailure('project_import', err);
      logger.error('Failed to import project', LogCategory.PROJECT, err);
      error =
        err instanceof Error
          ? err.message
          : m.open_project_error_import_project();
    } finally {
      isImporting = false;
      createProjectActions.setOpeningProject(false);
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
        err instanceof Error
          ? err.message
          : m.open_project_error_duplicate_project();
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
      error =
        err instanceof Error
          ? err.message
          : m.open_project_error_delete_project();
    }
  }

  async function handleDeleteAllProjects() {
    showDeleteAllConfirm = false;
    error = '';

    try {
      for (const project of savedProjects) {
        await projectStore.deleteProject(project.id);
      }
      selectedProjectId = null;
    } catch (err) {
      logger.error('Failed to delete all projects', LogCategory.PROJECT, err);
      error =
        err instanceof Error
          ? err.message
          : m.open_project_error_delete_project();
    } finally {
      await loadProjects();
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
  <header class="mb-4">
    <h6 class="mb-3">{m.open_project_select_backup()}</h6>

    <span class="text-grey">
      {m.open_project_backup_description()}
      <span class="inline-tooltip">
        <Tooltip size="compact">
          <p>
            {m.open_project_backup_warning()}
          </p>
        </Tooltip>
      </span>
    </span>
  </header>

  {#if storageNearlyFull}
    <InlineNotification
      lowContrast
      hideCloseButton
      kind="warning"
      subtitle={m.open_project_storage_nearly_full()}
    />
  {/if}

  {#if error}
    <InlineNotification
      closeButtonDescription={m.a11y_close_notification()}
      lowContrast
      kind="error"
      role="alert"
      title={m.create_project_error_label()}
      subtitle={error}
      on:close={() => (error = '')}
    />
  {/if}

  {#if !isLoading && savedProjects.length > 1}
    <div class="flex flex-wrap items-center gap-3">
      <div class="project-search">
        <Search
          size="sm"
          hideLabel
          labelText={m.open_project_search_label()}
          placeholder={m.open_project_search_placeholder()}
          closeButtonLabelText={m.a11y_clear_search()}
          value={searchQuery}
          on:input={handleSearchInput}
          on:clear={() => (searchQuery = '')}
        />
      </div>
      <div class="project-sort">
        <span class="project-sort__label" aria-hidden="true">
          {m.open_project_sort_short()}
        </span>
        <ContentSwitcher
          ariaLabel={m.open_project_sort_label()}
          items={[m.open_project_sort_recent(), m.open_project_sort_size()]}
          activeIndex={sortIndex}
          onchange={(index) => {
            sortIndex = index;
            cardRail?.scrollTo({ left: 0 });
          }}
        />
      </div>
    </div>
  {/if}

  <div
    bind:this={cardRail}
    class="flex gap-5 overflow-x-auto pb-3 card-rail"
    use:horizontalWheelScroll
  >
    {#if isLoading}
      {#each Array(3) as _item, idx (idx)}
        <div class="project-card-skeleton">
          <SkeletonPlaceholder style="width: 180px; height: 135px;" />
        </div>
      {/each}
    {:else if savedProjects.length === 0}
      <div class="no-projects">
        <p class="text-grey">{m.create_project_no_saved_projects()}</p>
      </div>
    {:else if visibleProjects.length === 0}
      <div class="no-projects">
        <p class="text-grey">{m.open_project_search_no_match()}</p>
      </div>
    {:else}
      {#each visibleProjects as project (project.id)}
        <div class="project-card-wrapper">
          <ProjectCard
            title={project.name}
            subtitle={project.description ?? ''}
            thumbnail={project.thumbnail}
            variant="gray"
            selected={selectedProjectId === project.id}
            onclick={() => handleProjectClick(project.id)}
          >
            {#snippet footer()}
              <div class="flex items-center justify-between w-full">
                <div class="grid gap-1">
                  <div class="flex items-center">
                    <Calendar
                      size={16}
                      style="color: var(--calendar-color); fill: var(--calendar-color);"
                    />
                    <span class="ml-2 text-sm">
                      {formatDate(project.updatedAt)}
                    </span>
                  </div>
                  <div class="flex items-center">
                    <DataBase
                      size={16}
                      title={m.open_project_storage_size()}
                      style="color: var(--calendar-color); fill: var(--calendar-color);"
                    />
                    <span class="ml-2 text-sm">
                      {formatApproximateSize(project.storageBytes)}
                    </span>
                  </div>
                </div>
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  onclick={(e: MouseEvent) => e.stopPropagation()}
                  onkeydown={(e: KeyboardEvent) => e.stopPropagation()}
                >
                  <OverflowMenu
                    iconDescription={m.a11y_open_options()}
                    size="sm"
                    flipped
                  >
                    <OverflowMenuItem
                      text={m.open_project_duplicate()}
                      disabled={isDuplicating}
                      on:click={() => handleDuplicateProject(project.id)}
                    />
                    <OverflowMenuItem
                      danger
                      text={m.open_project_delete()}
                      on:click={() => confirmDeleteProject(project.id)}
                    />
                  </OverflowMenu>
                </div>
              </div>
            {/snippet}
          </ProjectCard>
        </div>
      {/each}
    {/if}
  </div>

  {#if !isLoading && (storageStatus || savedProjects.length > 0)}
    <div class="flex flex-wrap items-end justify-between gap-5">
      {#if storageStatus}
        <div class="storage-gauge grid gap-2">
          <div class="flex items-baseline justify-between gap-3 text-sm">
            <span class="storage-label">{m.open_project_storage_label()}</span>
            <span class="text-grey">
              {m.open_project_storage_usage({
                used: formatApproximateSize(projectBytes),
                available: formatApproximateSize(availableBytes)
              })}
            </span>
          </div>
          <ProgressBar
            size="sm"
            hideLabel
            labelText={m.open_project_storage_label()}
            value={projectBytes}
            max={availableBytes}
            status={storageNearlyFull ? 'error' : 'active'}
          />
        </div>
      {/if}
      {#if savedProjects.length > 0}
        <Button
          kind="tertiary"
          size="small"
          icon={TrashCan}
          on:click={() => (showDeleteAllConfirm = true)}
        >
          {m.open_project_delete_all()}
        </Button>
      {/if}
    </div>
  {/if}

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
  </div>

  {#if showDeleteConfirm}
    <div use:portal>
      <Modal
        preventCloseOnClickOutside={false}
        iconDescription={m.a11y_close_dialog()}
        danger
        bind:open={showDeleteConfirm}
        modalHeading={m.open_project_delete_confirm_title()}
        primaryButtonText={m.open_project_delete_confirm_button()}
        secondaryButtonText={m.open_project_cancel()}
        on:click:button--primary={handleDeleteProject}
        on:click:button--secondary={cancelDelete}
        on:close={cancelDelete}
        size="sm"
      >
        <p>
          {m.open_project_delete_confirm_message()}
          {#if reclaimableOnDelete}
            {m.open_project_delete_reclaim({
              size: formatApproximateSize(reclaimableOnDelete)
            })}
          {/if}
        </p>
      </Modal>
    </div>
  {/if}

  {#if showDeleteAllConfirm}
    <div use:portal>
      <Modal
        preventCloseOnClickOutside={false}
        iconDescription={m.a11y_close_dialog()}
        danger
        bind:open={showDeleteAllConfirm}
        modalHeading={m.open_project_delete_all_confirm_title()}
        primaryButtonText={m.open_project_delete_all_confirm_button()}
        secondaryButtonText={m.open_project_cancel()}
        on:click:button--primary={handleDeleteAllProjects}
        on:click:button--secondary={() => (showDeleteAllConfirm = false)}
        on:close={() => (showDeleteAllConfirm = false)}
        size="sm"
      >
        <p>
          {m.open_project_delete_all_confirm_message()}
        </p>
      </Modal>
    </div>
  {/if}
</section>

<style>
  #khartis-open-project :global(.bx--file__drop-container) {
    line-height: 1.25rem;
    color: var(--cds-text-helper);
  }

  #khartis-open-project :global(.bx--file-browse-btn) {
    min-width: 100%;
  }

  /* Centred on the line of text it ends. */
  .inline-tooltip {
    display: inline-flex;
    align-items: center;
    height: 1lh;
    vertical-align: top;
  }

  .project-sort {
    display: flex;
    align-items: center;
    gap: var(--kh-gap-inline);
    flex: 0 1 20rem;
  }

  .project-sort__label {
    flex-shrink: 0;
    font-size: var(--kh-font-label);
    line-height: var(--kh-line-label);
    color: var(--cds-text-secondary);
  }

  .storage-label {
    color: var(--cds-text-helper);
  }

  .storage-gauge {
    flex: 1 1 12rem;
    max-width: 24rem;
  }

  .project-search {
    flex: 1 1 14rem;
  }

  .project-card-skeleton {
    min-width: 180px;
  }

  .card-rail::-webkit-scrollbar {
    height: 8px;
    -webkit-appearance: none;
  }

  .card-rail::-webkit-scrollbar-track {
    background: var(--cds-layer-02, #e8e8e8);
    border-radius: 4px;
  }

  .card-rail::-webkit-scrollbar-thumb {
    background-color: var(--cds-border-strong, #8d8d8d);
    border-radius: 4px;
  }

  .card-rail::-webkit-scrollbar-thumb:hover {
    background-color: var(--cds-text-secondary, #525252);
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

  /* Its icon lines up with the card's radio, set inside the 1px border. */
  .project-card-wrapper :global(.bx--overflow-menu) {
    position: absolute;
    top: 8px;
    right: 9px;
    z-index: var(--z-content);
  }

  .project-card-wrapper :global(.bx--overflow-menu__icon) {
    fill: var(--cds-icon-secondary);
  }

  .project-card-wrapper
    :global(.bx--overflow-menu:hover .bx--overflow-menu__icon) {
    fill: var(--cds-icon-primary);
  }
</style>
