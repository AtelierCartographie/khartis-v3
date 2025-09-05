<script lang="ts">
  import ProjectCard from '$lib/features/commons/components/project-card.svelte';
  import { m } from '$lib/paraglide/messages';
  import { FileUploaderDropContainer, Tooltip } from 'carbon-components-svelte';
  import { Calendar, Link } from 'carbon-icons-svelte';

  interface Props {
    onClose?: () => void;
  }

  const { onClose }: Props = $props();

  let selectedCardIndex = $state<number | null>(null);

  function handleCardClick(index: number) {
    selectedCardIndex = selectedCardIndex === index ? null : index;
    onClose?.();
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

  <div class="flex gap-5 overflow-x-auto pb-3">
    {#each Array(10) as _, index}
      <ProjectCard
        title="Title Lorem dolor sit amet"
        subtitle="Project preview"
        variant="blue"
        selected={selectedCardIndex === index}
        onclick={() => handleCardClick(index)}
      >
        {#snippet footer()}
          <div class="flex items-center">
            <Calendar
              size={16}
              style="color: var(--calendar-color); fill: var(--calendar-color);"
            />
            <span class="ml-2 text-sm">DD/MM/YYYY</span>
          </div>
        {/snippet}
      </ProjectCard>
    {/each}
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
        multiple
        validateFiles={(files) => {
          return files.filter((file) => file.size < 1_024);
        }}
        onchange={(e) => {
          console.log('files', e);
        }}
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
</style>
