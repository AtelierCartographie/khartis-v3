<script lang="ts">
  import { projectStore } from '$lib/features/commons/store/project.store.svelte';
  import { sanitizeProjectName } from '$lib/features/commons/utils/sanitize.utils';
  import { logger, LogCategory } from '$lib/features/commons/utils/logger';
  import { m } from '$lib/paraglide/messages.js';
  import { Button, TextInput } from 'carbon-components-svelte';
  import { Save } from 'carbon-icons-svelte';

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
    if (event.key === 'Enter') {
      event.preventDefault();
      handleSave();
    } else if (event.key === 'Escape') {
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
    <Button
      size="small"
      tooltipPosition="bottom"
      tooltipAlignment="end"
      iconDescription={m.save_tooltip()}
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
  }
</style>
