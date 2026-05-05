<script lang="ts">
  import { m } from '$lib/paraglide/messages.js';
  import {
    InlineLoading,
    Modal,
    RadioButton,
    RadioButtonGroup,
    TextInput
  } from 'carbon-components-svelte';
  import { projectsStore } from '../stores/projects.store.svelte';

  interface Props {
    open: boolean;
    isLoading?: boolean;
    onClose: () => void;
    onConfirm: (projectId: string, newName: string) => void;
  }

  let {
    open = $bindable(),
    isLoading = false,
    onClose,
    onConfirm
  }: Props = $props();

  let selectedProjectId = $state('');
  let newProjectName = $state('');

  $effect(() => {
    if (open) {
      projectsStore.refresh();
    }
  });

  $effect(() => {
    if (open && projectsStore.projects.length > 0) {
      selectedProjectId =
        projectsStore.currentProject?.id || projectsStore.projects[0].id;
      const selectedProject = projectsStore.getProjectById(selectedProjectId);
      newProjectName = selectedProject
        ? `${selectedProject.name}${m.copy_suffix()}`
        : '';
    }
  });

  function handleProjectSelection(value: string) {
    selectedProjectId = value;
    const selectedProject = projectsStore.getProjectById(value);

    if (selectedProject) {
      const duplicateCount = projectsStore.projects.filter((p) =>
        p.name.startsWith(selectedProject.name + m.copy_suffix())
      ).length;

      newProjectName =
        duplicateCount === 0
          ? `${selectedProject.name}${m.copy_suffix()}`
          : `${selectedProject.name}${m.copy_suffix_numbered({ count: String(duplicateCount + 1) })}`;
    }
  }

  function handleConfirm() {
    if (selectedProjectId && newProjectName) {
      onConfirm(selectedProjectId, newProjectName);
      resetForm();
    }
  }

  function handleCancel() {
    onClose();
    resetForm();
  }

  function resetForm() {
    selectedProjectId = '';
    newProjectName = '';
  }
</script>

<Modal
  bind:open={open}
  modalHeading={m.duplicate_project_modal_title()}
  primaryButtonText={isLoading ? '' : m.duplicate_project_modal_confirm()}
  secondaryButtonText={m.duplicate_project_modal_cancel()}
  on:click:button--primary={handleConfirm}
  on:click:button--secondary={handleCancel}
  on:close={handleCancel}
  size="sm"
  primaryButtonDisabled={!selectedProjectId || !newProjectName || isLoading}
  preventCloseOnClickOutside={isLoading}
>
  <div class="duplicate-modal-content">
    {#if projectsStore.projects.length === 0}
      <p class="no-projects-message">
        {m.duplicate_project_modal_no_projects()}
      </p>
    {:else}
      <div class="project-selection">
        <h5>{m.duplicate_project_modal_select_project()}</h5>

        <RadioButtonGroup
          bind:selected={selectedProjectId}
          on:change={(e) => handleProjectSelection(String(e.detail))}
        >
          {#each projectsStore.projects as project (project.id)}
            <RadioButton value={project.id} labelText={project.name} />
          {/each}
        </RadioButtonGroup>
      </div>

      <div class="name-input-section">
        <TextInput
          light
          labelText={m.duplicate_project_modal_new_name()}
          placeholder={m.duplicate_project_modal_name_placeholder()}
          bind:value={newProjectName}
          disabled={isLoading}
        />
      </div>

      {#if isLoading}
        <div class="loading-section">
          <InlineLoading description={m.duplicate_project_modal_loading()} />
        </div>
      {/if}
    {/if}
  </div>
</Modal>

<style>
  .duplicate-modal-content {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-05);
  }

  .no-projects-message {
    color: var(--cds-text-02);
    text-align: center;
    padding: var(--cds-spacing-05) 0;
  }

  .project-selection {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
  }

  .project-selection h5 {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--cds-text-01);
  }

  .name-input-section {
    margin-top: var(--cds-spacing-03);
  }

  :global(.duplicate-modal-content .bx--radio-button-group) {
    max-height: 200px;
    overflow-y: auto;
  }

  .loading-section {
    display: flex;
    justify-content: center;
    padding: var(--cds-spacing-03) 0;
  }
</style>
