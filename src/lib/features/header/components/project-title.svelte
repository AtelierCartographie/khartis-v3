<script lang="ts">
  import IconButton from '$lib/features/commons/components/carbon/icon-button.svelte';
  import { projectStore } from '$lib/features/commons/stores/project.store.svelte';
  import { sanitizeProjectName } from '$lib/features/commons/utils/sanitize.utils';
  import { m } from '$lib/paraglide/messages';
  import { TextInput } from 'carbon-components-svelte';
  import { Save } from 'carbon-icons-svelte';
  import { KEY } from '../../commons/constants/dom.constants';
  import {
    type CarbonValueEvent,
    readCarbonStringValue
  } from '$lib/features/commons/utils/carbon-events.utils';

  let inputValue = $state(projectStore.projectName);
  let originalName = $state(projectStore.projectName);

  const isEmpty = $derived(!inputValue.trim());
  const hasChanges = $derived(inputValue.trim() !== originalName);
  const canSave = $derived(!isEmpty && hasChanges);

  $effect(() => {
    inputValue = projectStore.projectName;
    originalName = projectStore.projectName;
  });

  async function handleSave() {
    const trimmed = inputValue.trim();

    if (!trimmed) {
      inputValue = originalName;
      return;
    }

    const sanitized = sanitizeProjectName(trimmed);

    if (sanitized !== originalName) {
      projectStore.updateProjectName(sanitized);
      await projectStore.saveCurrentProject();
      originalName = sanitized;
      inputValue = sanitized;
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === KEY.ENTER) {
      event.preventDefault();
      void handleSave();
    } else if (event.key === KEY.ESCAPE) {
      event.preventDefault();
      inputValue = originalName;
    }
  }

  function handleBlur() {
    void handleSave();
  }

  function handleTitleInput(event: CarbonValueEvent) {
    inputValue = readCarbonStringValue(event, inputValue);
  }
</script>

<div
  id="khartis-project-title"
  class="project-title"
  data-testid="project-title"
  title={inputValue || m.project_placeholder()}
>
  <div class="project-title-field">
    <TextInput
      light
      size="sm"
      value={inputValue}
      placeholder={m.project_placeholder()}
      on:input={handleTitleInput}
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
</div>

<style>
  /* In the header's flow, the field and its save button centre between the
     logo and the actions, with equal space on both sides. The left padding
     leaves out the 2px focus border the logo link keeps. */
  .project-title {
    --_gap: var(--cds-spacing-07);
    --_save-width: 2rem;
    flex: 1 1 0;
    display: flex;
    align-items: center;
    justify-content: center;
    align-self: stretch;
    min-width: 0;
    padding-inline: calc(var(--_gap) - 2px)
      calc(var(--_save-width) + var(--_gap));
  }

  .project-title-field {
    position: relative;
    width: min(100%, 40rem);
    height: 2rem;
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
      --_gap: var(--cds-spacing-05);
      --_save-width: 0px;
    }

    .project-title-save {
      display: none;
    }
  }

  @media (max-width: 639px) {
    #khartis-project-title :global(input) {
      font-size: 0.75rem;
      padding-inline: var(--cds-spacing-02);
    }
  }
</style>
