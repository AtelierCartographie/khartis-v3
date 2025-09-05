<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { Button, TextInput } from 'carbon-components-svelte';
  import { Add } from 'carbon-icons-svelte';
  import {
    createProjectState,
    createProjectActions
  } from '$lib/features/commons/store/create-project.store.svelte';

  interface Props {
    onClose?: () => void;
  }

  const { onClose }: Props = $props();

  function handleCreate() {
    createProjectActions.closeModal();
    onClose?.();
  }

  function handleProjectNameChange(event: Event) {
    const target = event.target as HTMLInputElement;
    createProjectActions.setProjectName(target.value);
  }
</script>

<footer class="fixed bottom-0 left-0 right-0 app-shadow border-t bg-white">
  <div class="flex items-center gap-5 p-5 mt-2 mb-2">
    <span class="text-grey">{m.project_name_label()}</span>

    <TextInput
      placeholder={m.project_name_placeholder()}
      value={createProjectState.newProject.projectName}
      on:input={handleProjectNameChange}
    />

    <Button
      size="field"
      icon={Add}
      disabled={!createProjectState.newProject.projectName.trim()}
      on:click={handleCreate}
    >
      {m.project_name_create()}
    </Button>
  </div>
</footer>
