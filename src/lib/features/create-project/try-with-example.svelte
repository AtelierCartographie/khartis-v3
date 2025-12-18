<script lang="ts">
  import {
    ExampleCategory,
    FileStatus
  } from '$lib/features/commons/constants/ui.constants';
  import ProjectCard from '$lib/features/commons/components/project-card.svelte';
  import {
    EXAMPLE_CATEGORIES,
    EXAMPLE_PROJECTS,
    getExamplesByCategory,
    loadExampleData
  } from '$lib/features/commons/mocks/examples.data';
  import { createProjectActions } from '$lib/features/commons/store/create-project.store.svelte';
  import type { UploadedFile } from '$lib/features/commons/store/create-project.types';
  import {
    DataSourceType as DataSource,
    FileType as FType
  } from '$lib/features/commons/store/create-project.types';
  import { projectStore } from '$lib/features/commons/store/project.store.svelte';
  import { logger, LogCategory } from '$lib/features/commons/utils/logger';
  import { m } from '$lib/paraglide/messages';
  import { useProjectNavigation } from './hooks';
  import {
    InlineNotification,
    SkeletonPlaceholder,
    Tag
  } from 'carbon-components-svelte';

  interface Props {
    onClose?: () => void;
  }

  const { onClose }: Props = $props();

  const { navigateAfterAction } = useProjectNavigation({
    getOnClose: () => onClose
  });

  let selectedCategory = $state<ExampleCategory>(ExampleCategory.ALL);
  let selectedExample = $state<string | null>(null);
  let isLoading = $state(false);
  let error = $state<string>('');

  const filteredExamples = $derived(getExamplesByCategory(selectedCategory));

  const CATEGORY_LABELS: Record<string, () => string> = {
    try_example_all: m.try_example_all,
    try_example_symbols: m.try_example_symbols,
    try_example_polygons: m.try_example_polygons,
    try_example_lines: m.try_example_lines,
    try_example_texts: m.try_example_texts,
    try_example_hybrids: m.try_example_hybrids
  };

  function getCategoryLabel(label: string): string {
    return CATEGORY_LABELS[label]?.() ?? label;
  }

  function selectCategory(category: ExampleCategory) {
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
        throw new Error(m.error_example_not_found());
      }

      const data = await loadExampleData(example);

      const fileName = example.dataUrl
        ? example.dataUrl.split('/').pop()
        : 'example-data.csv';
      const fileType = example.dataUrl?.endsWith('.json')
        ? 'application/json'
        : 'text/csv';

      const fileContent =
        typeof data === 'string' ? data : JSON.stringify(data);
      const file = new File([fileContent], fileName || 'example-data.csv', {
        type: fileType
      });

      const uploadedFile: UploadedFile = {
        id: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        type: file.type,
        fileType: file.type.includes('json') ? FType.GEOJSON : FType.CSV,
        content: fileContent,
        originalFile: file,
        status: FileStatus.COMPLETE,
        sourceType: DataSource.FILE_UPLOAD
      };

      await createProjectActions.processFiles([file]);
      createProjectActions.setProjectName(example.title);

      await projectStore.createProject(example.title, [uploadedFile]);

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

  <div class="flex gap-5 overflow-x-auto pb-3">
    {#if isLoading}
      {#each Array(3) as _item, idx (idx)}
        <div class="example-card-skeleton">
          <SkeletonPlaceholder style="width: 200px; height: 150px;" />
        </div>
      {/each}
    {:else if filteredExamples.length === 0}
      <div class="no-examples">
        <p class="text-grey">{m.create_project_no_examples_category()}</p>
      </div>
    {:else}
      {#each filteredExamples as example (example.id)}
        <ProjectCard
          title={example.title}
          subtitle={example.subtitle}
          variant={selectedExample === example.id ? 'blue' : 'gray'}
          selected={selectedExample === example.id}
          onclick={() => handleExampleClick(example.id)}
        >
          {#snippet footer()}
            <span class="text-xs text-grey"
              >{example.tags?.join(' • ') || ''}</span
            >
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
