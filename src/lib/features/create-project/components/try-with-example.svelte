<script lang="ts">
  import { ExampleCategory } from '$lib/features/commons/constants/ui.constants';
  import {
    EXAMPLE_CATEGORIES,
    EXAMPLE_PROJECTS,
    getExamplesByCategory,
    loadExampleArchive
  } from '$lib/features/commons/constants/examples.data';
  import { SvelteMap } from 'svelte/reactivity';
  import { LogCategory, logger } from '$lib/features/commons/utils/logger';
  import { horizontalWheelScroll } from '$lib/features/commons/utils/horizontal-wheel-scroll';
  import { m } from '$lib/paraglide/messages';
  import { DataValidationError } from '$lib/features/commons/pipeline.errors';
  import { useProjectNavigation } from '../hooks/use-project-navigation.svelte';
  import { InlineNotification, Tag } from 'carbon-components-svelte';
  import ProjectCard from '$lib/features/commons/components/project-card.svelte';
  import { projectStore } from '$lib/features/commons/stores/project.store.svelte';
  import { projectRepository } from '$lib/features/project-management';
  import type { ExampleProject } from '$lib/features/commons/types/create-project.types';

  interface Props {
    onClose?: () => void;
  }

  const { onClose }: Props = $props();

  const { navigateAfterAction } = useProjectNavigation({
    onClose: () => onClose?.()
  });

  let selectedCategory = $state<ExampleCategory>(ExampleCategory.ALL);
  let selectedExample = $state<string | null>(null);
  let isLoading = $state(false);
  let error = $state<string>('');
  let savedExampleThumbnails = $state(new SvelteMap<string, string>());

  $effect(() => {
    projectRepository.listMetadata().then((metadata) => {
      const map = new SvelteMap<string, string>();
      for (const entry of metadata) {
        if (entry.exampleId && entry.thumbnail && !map.has(entry.exampleId)) {
          map.set(entry.exampleId, entry.thumbnail);
        }
      }
      savedExampleThumbnails = map;
    });
  });

  const filteredExamples = $derived(getExamplesByCategory(selectedCategory));

  const CATEGORY_LABELS: Record<string, () => string> = {
    try_example_all: m.try_example_all,
    try_example_symbols: m.try_example_symbols,
    try_example_polygons: m.try_example_polygons,
    try_example_lines: m.try_example_lines,
    try_example_texts: m.try_example_texts,
    try_example_hybrids: m.try_example_hybrids,
    try_example_collection: m.try_example_collection
  };

  function getCategoryLabel(label: string): string {
    return CATEGORY_LABELS[label]?.() ?? label;
  }

  function getExampleCategoriesLabel(example: ExampleProject): string {
    return EXAMPLE_CATEGORIES.filter((category) =>
      example.categories.includes(category.id)
    )
      .map((category) => getCategoryLabel(category.label))
      .join(m.separator_bullet_space());
  }

  function selectCategory(category: ExampleCategory) {
    if (isLoading) {
      return;
    }

    selectedCategory = category;
  }

  async function handleExampleClick(exampleId: string) {
    if (isLoading) {
      return;
    }

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
        throw new DataValidationError(
          m.error_example_not_found(),
          'exampleId',
          { exampleId }
        );
      }

      const archive = await loadExampleArchive(example);
      await projectStore.importProject(archive);
      projectStore.updateProjectName(example.title);
      await projectStore.saveCurrentProject({
        fallbackThumbnail: example.thumbnail,
        exampleId: example.id
      });

      await navigateAfterAction();
    } catch (err) {
      logger.error('Failed to load example', LogCategory.PROJECT, err);
      error =
        err instanceof Error ? err.message : m.error_example_load_failed();
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
      closeButtonDescription={m.a11y_close_notification()}
      lowContrast
      kind="error"
      title={m.create_project_error_label()}
      subtitle={error}
      on:close={() => (error = '')}
    />
  {/if}

  <div>
    <span class="text-grey">{m.try_example_graphic_primitives()}</span>

    <div class="mt-2 flex gap-2 flex-wrap">
      {#each EXAMPLE_CATEGORIES as category (category.id)}
        <Tag
          type={selectedCategory === category.id ? 'high-contrast' : 'gray'}
          interactive
          on:click={() => selectCategory(category.id)}
        >
          {getCategoryLabel(category.label)}
        </Tag>
      {/each}
    </div>
  </div>

  <div
    class="flex gap-5 overflow-x-auto pb-3 card-rail"
    use:horizontalWheelScroll
  >
    {#if filteredExamples.length === 0}
      <div class="no-examples">
        <p class="text-grey">{m.create_project_no_examples_category()}</p>
      </div>
    {:else}
      {#each filteredExamples as example (example.id)}
        <div class="example-project-card">
          <ProjectCard
            title={example.title}
            subtitle={getExampleCategoriesLabel(example)}
            thumbnail={savedExampleThumbnails.get(example.id) ??
              example.thumbnail}
            variant="gray"
            selected={selectedExample === example.id}
            disabled={isLoading}
            onclick={() => handleExampleClick(example.id)}
          >
            {#snippet footer()}
              <span class="example-tags text-xs text-grey"
                >{getExampleCategoriesLabel(example)}</span
              >
            {/snippet}
          </ProjectCard>
        </div>
      {/each}
    {/if}
  </div>
</section>

<style>
  #khartis-try-with-example :global(.bx--file-browse-btn) {
    min-width: 100%;
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

  .example-tags {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;
    line-clamp: 1;
    overflow: hidden;
    min-height: 1lh;
  }

  .example-project-card :global(.kh-card .title-text) {
    font-size: 0.875rem;
    line-height: 1.25;
  }

  .example-project-card :global(.kh-card .top-section > svg) {
    width: 1.5rem;
    height: 1.5rem;
    flex-shrink: 0;
  }

  .example-project-card :global(.kh-card .top-section > .text-sm) {
    font-size: 0.75rem;
    line-height: 1.25;
    text-align: center;
  }
</style>
