<script lang="ts">
  import { goto } from '$app/navigation';
  import ProjectCard from '$lib/features/commons/components/project-card.svelte';
  import {
    EXAMPLE_CATEGORIES,
    EXAMPLE_PROJECTS,
    getExamplesByCategory,
    loadExampleData
  } from '$lib/features/commons/mocks/examples.data';
  import { createProjectActions } from '$lib/features/commons/store/create-project.store.svelte';
  import { globalState } from '$lib/features/commons/store/global.svelte';
  import { projectStore } from '$lib/features/commons/store/project.store.svelte';
  import { logger, LogCategory } from '$lib/features/commons/utils/logger';
  import { m } from '$lib/paraglide/messages';
  import {
    InlineNotification,
    SkeletonPlaceholder,
    Tag
  } from 'carbon-components-svelte';

  interface Props {
    onClose?: () => void;
  }

  const { onClose }: Props = $props();

  let selectedCategory = $state<string>('all');
  let selectedExample = $state<string | null>(null);
  let isLoading = $state(false);
  let error = $state<string>('');

  const filteredExamples = $derived(getExamplesByCategory(selectedCategory));

  function selectCategory(category: string) {
    selectedCategory = category;
  }

  async function handleExampleClick(exampleId: string) {
    if (selectedExample === exampleId) {
      selectedExample = null;
      return;
    }

    selectedExample = exampleId;
    isLoading = true;
    error = '';

    try {
      const example = EXAMPLE_PROJECTS.find((e) => e.id === exampleId);
      if (!example) {
        throw new Error('Example not found');
      }

      const data = await loadExampleData(example);

      const file = new File(
        [typeof data === 'string' ? data : JSON.stringify(data)],
        example.dataUrl.split('/').pop() || 'example-data.csv',
        {
          type: example.dataUrl.endsWith('.json')
            ? 'application/json'
            : 'text/csv'
        }
      );

      await createProjectActions.processFiles([file]);
      createProjectActions.setProjectName(example.title);

      await projectStore.createProject(example.title, [file]);

      globalState.isCreateProjectModalOpen = false;
      createProjectActions.resetAllTabs();
      onClose?.();
      goto('/');
    } catch (err) {
      logger.error('Failed to load example', LogCategory.PROJECT, err);
      error = err instanceof Error ? err.message : 'Failed to load example';
    } finally {
      isLoading = false;
    }
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

  {#if error}
    <InlineNotification
      lowContrast
      kind="error"
      title="Error:"
      subtitle={error}
      on:close={() => (error = '')}
    />
  {/if}

  <div>
    <span class="text-grey">{m.try_example_graphic_primitives()}</span>

    <div class="mt-2 flex gap-2 flex-wrap">
      {#each EXAMPLE_CATEGORIES as category}
        <Tag
          type={selectedCategory === category.id ? 'high-contrast' : 'gray'}
          interactive
          on:click={() => selectCategory(category.id)}
        >
          {m[category.label]()}
        </Tag>
      {/each}
    </div>
  </div>

  <div class="flex gap-5 overflow-x-auto pb-3">
    {#if isLoading}
      {#each Array(3) as _}
        <div class="example-card-skeleton">
          <SkeletonPlaceholder style="width: 200px; height: 150px;" />
        </div>
      {/each}
    {:else if filteredExamples.length === 0}
      <div class="no-examples">
        <p class="text-grey">No examples available in this category</p>
      </div>
    {:else}
      {#each filteredExamples as example}
        <ProjectCard
          title={example.title}
          subtitle={example.subtitle}
          variant={selectedExample === example.id ? 'blue' : 'gray'}
          selected={selectedExample === example.id}
          onclick={() => handleExampleClick(example.id)}
        >
          {#snippet footer()}
            <span class="text-xs text-grey">{example.tags.join(' • ')}</span>
          {/snippet}
        </ProjectCard>
      {/each}
    {/if}
  </div>
</section>

<style>
  #khartis-try-with-example :global(.bx--file-browse-btn) {
    min-width: 100%;
  }
</style>
