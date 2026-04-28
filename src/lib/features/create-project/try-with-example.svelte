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
  import {
    createProjectActions,
    createProjectState
  } from '$lib/features/commons/store/create-project.store.svelte';
  import { projectStore } from '$lib/features/commons/store/project.store.svelte';
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import { dataTabActions } from '$lib/features/commons/store/data-tab.store.svelte';
  import { basemapStyleStore } from '$lib/features/commons/store/basemap-style.store.svelte';
  import { basemapCatalogService } from '$lib/features/map/services/basemap-catalog.service.svelte';
  import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
  import { Duck } from '$lib/features/duckdb';
  import { BasemapSource } from '$lib/features/commons/constants/ui.constants';
  import { PERSISTED_BASEMAP_TYPE } from '$lib/features/main-toolbar/data-tab/services/persisted-basemap';
  import { persistTabularSourceSnapshot } from '$lib/features/main-toolbar/data-tab/services/tabular-source-snapshot';
  import { dataTabStore } from '$lib/features/main-toolbar/data-tab/data-tab.store.svelte';
  import type { ExampleProject } from '$lib/features/commons/store/create-project.types';
  import type { UploadedFile } from '$lib/features/commons/store/create-project.types';
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

  const DEFAULT_DATA_FILENAME = 'example-data.csv';

  function getExampleMimeType(dataUrl?: string): string {
    if (!dataUrl) {
      return 'text/csv';
    }

    if (dataUrl.endsWith('.geojson') || dataUrl.endsWith('.json')) {
      return 'application/geo+json';
    }

    if (dataUrl.endsWith('.tsv')) {
      return 'text/tab-separated-values';
    }

    return 'text/csv';
  }

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

  function resolveExampleGeoColumn(file: UploadedFile): string | undefined {
    const detection = file.deepAnalysis?.geoDetection;
    const suggested = detection?.suggestedPrimaryGeoColumn?.columnName;
    const detected = detection?.geoColumns;
    if (!detected || detected.length === 0) {
      return suggested;
    }
    const sorted = [...detected].sort(
      (a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)
    );
    return sorted[0]?.columnName ?? suggested;
  }

  async function applyExamplePreset(
    example: ExampleProject,
    file: UploadedFile
  ): Promise<void> {
    if (!example.baseMapId) {
      return;
    }

    await basemapCatalogService.loadCatalog();
    const basemap = basemapCatalogService.getBasemapById(example.baseMapId);
    if (!basemap) {
      logger.warn(
        'Example baseMapId not found in catalog',
        LogCategory.PROJECT,
        { exampleId: example.id, baseMapId: example.baseMapId }
      );
      return;
    }

    const dataset = datasetsStore.getDatasetBySourceFile(file.id);
    if (!dataset) {
      logger.warn(
        'Example dataset not found after project creation',
        LogCategory.PROJECT,
        { exampleId: example.id, fileId: file.id }
      );
      return;
    }

    const geoColumn = resolveExampleGeoColumn(file) ?? '';

    dataTabActions.setBasemapJoinState({
      selectedBasemap: basemap.file,
      basemapSource: BasemapSource.CATALOG
    });
    basemapStyleStore.setReferenceBasemap(basemap.file);
    projectStore.updateProjectData({
      basemap: {
        id: basemap.file,
        type: basemap.isCustom
          ? PERSISTED_BASEMAP_TYPE.CUSTOM
          : PERSISTED_BASEMAP_TYPE.CATALOG,
        data: basemap.isCustom ? { ...basemap } : undefined
      }
    });

    try {
      await duckDBOrchestrator.finalizeJoin(dataset.id, basemap, geoColumn);

      const duckColumns = await Duck.analyse(dataset.tableName, {
        force: true
      });
      await persistTabularSourceSnapshot({
        sourceFileId: file.id,
        tableName: dataset.tableName,
        duckColumns,
        joinState: {
          joinedBasemap: basemap.file,
          geoColumn,
          gpsMode: false,
          gpsColumns: undefined
        }
      });

      const basemapStepIndex = dataTabStore.basemapStepIndex;
      for (let i = 0; i <= basemapStepIndex; i++) {
        dataTabStore.markStepComplete(i);
      }
    } catch (joinError) {
      logger.warn(
        'Failed to auto-join example dataset to basemap',
        LogCategory.PROJECT,
        {
          exampleId: example.id,
          baseMapId: basemap.file,
          geoColumn,
          error: joinError
        }
      );
    }
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
      const previousFileIds = new Set(
        createProjectState.newProject.uploadedFiles.map((file) => file.id)
      );

      const fileName = example.dataUrl
        ? example.dataUrl.split('/').pop()
        : DEFAULT_DATA_FILENAME;
      const fileContent =
        typeof data === 'string' ? data : JSON.stringify(data);
      const file = new File([fileContent], fileName || DEFAULT_DATA_FILENAME, {
        type: getExampleMimeType(example.dataUrl)
      });

      await createProjectActions.processFiles([file]);
      const processedExampleFile = Array.from(
        createProjectState.newProject.uploadedFiles
      )
        .reverse()
        .find(
          (uploadedFile) =>
            !previousFileIds.has(uploadedFile.id) &&
            uploadedFile.name === file.name &&
            uploadedFile.status === FileStatus.COMPLETE
        );

      if (!processedExampleFile) {
        throw new Error(
          createProjectState.newProject.error ?? m.error_example_load_failed()
        );
      }

      createProjectActions.setProjectName(example.title);

      await projectStore.createProject(example.title, [processedExampleFile]);
      await applyExamplePreset(example, processedExampleFile);

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
              >{example.tags?.join(m.separator_bullet_space()) || ''}</span
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
