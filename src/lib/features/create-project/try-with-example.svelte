<script lang="ts">
  import ProjectCard from '$lib/features/commons/components/project-card.svelte';
  import { m } from '$lib/paraglide/messages';
  import { Tag } from 'carbon-components-svelte';

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

<section id="khartis-try-with-example" class="grid grid-cols-1 gap-3">
  <header class="flex justify-between items-end">
    <div>
      <h6 class="mb-3">{m.try_example_choose_example()}</h6>

      <span class="text-grey">
        {m.try_example_description()}
      </span>
    </div>
  </header>

  <div>
    <span class="text-grey">{m.try_example_graphic_primitives()}</span>

    <div class="mt-2">
      <Tag type="high-contrast">{m.try_example_all()}</Tag>
      <Tag>{m.try_example_symbols()}</Tag>
      <Tag>{m.try_example_polygons()}</Tag>
      <Tag>{m.try_example_lines()}</Tag>
      <Tag>{m.try_example_texts()}</Tag>
      <Tag>{m.try_example_hybrids()}</Tag>
    </div>
  </div>

  <div class="flex gap-5 overflow-x-auto pb-3">
    {#each Array(10) as _, index}
      <ProjectCard
        title="Title Lorem dolor sit amet"
        subtitle="Project preview"
        variant="gray"
        selected={selectedCardIndex === index}
        onclick={() => handleCardClick(index)}
      >
        {#snippet footer()}
          <span>Lorem ipsum</span>
        {/snippet}
      </ProjectCard>
    {/each}
  </div>
</section>

<style>
  #khartis-try-with-example :global(.bx--file-browse-btn) {
    min-width: 100%;
  }
</style>
