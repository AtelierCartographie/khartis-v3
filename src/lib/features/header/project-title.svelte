<script lang="ts">
  import IconButton from '$lib/features/commons/components/carbon/icon-button.svelte';
  import { projectStore } from '$lib/features/commons/store/project.store.svelte';
  import { sanitizeProjectName } from '$lib/features/commons/utils/sanitize.utils';
  import { m } from '$lib/paraglide/messages.js';
  import { TextInput } from 'carbon-components-svelte';
  import { Save } from 'carbon-icons-svelte';
  import { KEY } from '../commons/constants/dom.constants';

  let inputValue = $state(projectStore.projectName);
  let originalName = $state(projectStore.projectName);

  const isEmpty = $derived(!inputValue.trim());
  const hasChanges = $derived(inputValue.trim() !== originalName);
  const canSave = $derived(!isEmpty && hasChanges);

  $effect(() => {
    inputValue = projectStore.projectName;
    originalName = projectStore.projectName;
  });

  function handleSave() {
    const trimmed = inputValue.trim();

    if (!trimmed) {
      inputValue = originalName;
      return;
    }

    const sanitized = sanitizeProjectName(trimmed);

    if (sanitized !== originalName) {
      projectStore.updateProjectName(sanitized);
      projectStore.saveCurrentProject();
      originalName = sanitized;
      inputValue = sanitized;
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === KEY.ENTER) {
      event.preventDefault();
      handleSave();
    } else if (event.key === KEY.ESCAPE) {
      event.preventDefault();
      inputValue = originalName;
    }
  }

  function handleBlur() {
    handleSave();
  }
</script>

<div
  id="khartis-project-title"
  class="project-title"
  data-testid="project-title"
>
  <TextInput
    light
    size="sm"
    bind:value={inputValue}
    placeholder={m.project_placeholder()}
    on:blur={handleBlur}
    on:keydown={handleKeydown}
    disabled={!projectStore.currentProject}
  />

  <div class="project-title-save">
    <IconButton
      size="small"
      tooltipPosition="bottom"
      tooltipAlignment="end"
      iconDescription={m.save_tooltip()}
      portalTooltip
      showDisabledTooltip
      kind="ghost"
      icon={Save}
      disabled={!canSave}
      on:click={handleSave}
    />
  </div>
</div>

<style>
  .project-title {
    position: absolute;
    top: 9px;
    bottom: 9px;
    left: 50%;
    transform: translateX(-50%);
    width: 250px;
    max-width: calc(100vw - 280px);
    min-width: 140px;
  }

  .project-title-save {
    position: absolute;
    top: 0;
    left: 100%;
    height: 100%;
  }

  #khartis-project-title :global(input::placeholder) {
    text-align: center;
  }

  #khartis-project-title :global(input) {
    text-align: center;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (max-width: 1023px) {
    .project-title {
      width: 180px;
      max-width: calc(100vw - 176px);
    }

    .project-title-save {
      display: none;
    }
  }

  @media (max-width: 639px) {
    .project-title {
      width: 136px;
      max-width: calc(100vw - 152px);
    }

    #khartis-project-title :global(input) {
      font-size: 0.75rem;
      padding-inline: var(--cds-spacing-02);
    }
  }
</style>
