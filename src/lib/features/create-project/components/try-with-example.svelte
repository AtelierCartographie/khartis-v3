<script lang="ts">
  import {
    BasemapSource,
    ExampleCategory,
    FileStatus,
    GeoreferenceType
  } from '$lib/features/commons/constants/ui.constants';
  import { INTERNAL_COLUMN } from '$lib/features/commons/constants/data.constants';
  import {
    EXAMPLE_CATEGORIES,
    EXAMPLE_PROJECTS,
    getExamplesByCategory,
    loadExampleData
  } from '$lib/features/commons/constants/examples.data';
  import { LogCategory, logger } from '$lib/features/commons/utils/logger';
  import { horizontalWheelScroll } from '$lib/features/commons/utils/horizontal-wheel-scroll';
  import { m } from '$lib/paraglide/messages';
  import { useProjectNavigation } from '../hooks/use-project-navigation.svelte';
  import { InlineNotification, Tag } from 'carbon-components-svelte';
  import ProjectCard from '$lib/features/commons/components/project-card.svelte';
  import {
    createProjectActions,
    createProjectState
  } from '$lib/features/commons/stores/create-project.store.svelte';
  import { projectStore } from '$lib/features/commons/stores/project.store.svelte';
  import { datasetsStore } from '$lib/features/commons/stores/datasets.store.svelte';
  import { dataTabActions } from '$lib/features/commons/stores/data-tab.store.svelte';
  import { basemapStyleStore } from '$lib/features/commons/stores/basemap-style.store.svelte';
  import { basemapCatalogService } from '$lib/features/map/services/basemap-catalog.service.svelte';
  import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
  import { detectGPSColumns } from '$lib/features/duckdb/orchestrator/gps-ops';
  import { PERSISTED_BASEMAP_TYPE } from '$lib/features/data-tab/services/persisted-basemap.service';
  import { persistTabularSourceSnapshot } from '$lib/features/data-tab/services/tabular-source-snapshot.service';
  import { dataTabStore } from '$lib/features/data-tab/stores/data-tab.store.svelte';
  import { applyExampleVisualizationPresets } from '../services/example-visualization-preset.service';
  import type { ExampleProject } from '$lib/features/commons/types/create-project.types';
  import type { UploadedFile } from '$lib/features/commons/types/create-project.types';
  import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';

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

  function applyReferenceBasemapToProject(basemap: BasemapMetadata): void {
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
      return;
    }

    const dataset = datasetsStore.getDatasetBySourceFile(file.id);
    if (!dataset) {
      return;
    }

    const geoColumn = resolveExampleGeoColumn(file) ?? '';

    try {
      await duckDBOrchestrator.finalizeJoin(dataset.id, basemap, geoColumn);
      datasetsStore.updateDatasetJoinBasemap(dataset.id, basemap.file);
      applyReferenceBasemapToProject(basemap);
      syncGeolocationStateForCatalogJoin(dataset, geoColumn);

      const duckColumns = await duckDBOrchestrator.getFullAnalysis(
        dataset.tableName,
        true
      );
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
    } catch {
      return;
    }
  }

  function syncGeolocationStateForCatalogJoin(
    dataset: { columns?: Array<{ name: string }> } | null | undefined,
    geoColumn: string
  ): void {
    if (!geoColumn) {
      return;
    }
    const linkedVariable =
      dataset?.columns
        ?.filter(
          (col) =>
            col.name !== INTERNAL_COLUMN.GEOMETRY &&
            col.name !== INTERNAL_COLUMN.ID
        )
        .findIndex((col) => col.name === geoColumn) ?? -1;

    dataTabActions.setGeolocationState({
      geoReference: GeoreferenceType.ENTITIES,
      linkedVariable: linkedVariable >= 0 ? linkedVariable : null,
      linkedVariableName: geoColumn,
      latitudeColumn: undefined,
      longitudeColumn: undefined,
      autoDetected: false
    });
  }

  async function applyExampleReferenceBasemap(
    example: ExampleProject
  ): Promise<void> {
    if (!example.referenceBasemapId) {
      return;
    }

    await basemapCatalogService.loadCatalog();
    const basemap = basemapCatalogService.getBasemapById(
      example.referenceBasemapId
    );
    if (!basemap) {
      return;
    }

    applyReferenceBasemapToProject(basemap);
  }

  async function applyExampleGPSPreset(file: UploadedFile): Promise<void> {
    const dataset = datasetsStore.getDatasetBySourceFile(file.id);
    if (!dataset) {
      return;
    }

    const duckDataset =
      duckDBOrchestrator.getDatasetBySourceFile(file.id) ??
      duckDBOrchestrator.getDataset(dataset.id);
    if (!duckDataset) {
      return;
    }

    const gpsColumns = detectGPSColumns(
      duckDataset.columns,
      duckDataset.geoDetection
    );
    if (!gpsColumns) {
      return;
    }

    dataTabActions.setGeolocationState({
      geoReference: GeoreferenceType.COORDINATES,
      linkedVariable: null,
      linkedVariableName: '',
      latitudeColumn: gpsColumns.lat,
      longitudeColumn: gpsColumns.lon,
      autoDetected: false
    });
    duckDBOrchestrator.updateDatasetJoinInfo(duckDataset.id, {
      joinedBasemap: undefined,
      geoColumn: undefined,
      gpsMode: true,
      gpsColumns
    });

    const duckColumns = await duckDBOrchestrator.getFullAnalysis(
      dataset.tableName,
      true
    );
    await persistTabularSourceSnapshot({
      sourceFileId: file.id,
      tableName: dataset.tableName,
      duckColumns,
      joinState: {
        joinedBasemap: undefined,
        geoColumn: undefined,
        gpsMode: true,
        gpsColumns
      }
    });

    const basemapStepIndex = dataTabStore.basemapStepIndex;
    for (let i = 0; i <= basemapStepIndex; i++) {
      dataTabStore.markStepComplete(i);
    }
  }

  function applyExampleVisualizations(
    example: ExampleProject,
    file: UploadedFile
  ): void {
    const dataset = datasetsStore.getDatasetBySourceFile(file.id);
    if (!dataset) {
      return;
    }

    applyExampleVisualizationPresets(example, dataset);
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
      if (!example.baseMapId) {
        await applyExampleGPSPreset(processedExampleFile);
        await applyExampleReferenceBasemap(example);
      }
      applyExampleVisualizations(example, processedExampleFile);
      await projectStore.saveCurrentProject({
        fallbackThumbnail: example.thumbnail
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
            subtitle={example.subtitle}
            thumbnail={example.thumbnail}
            variant="gray"
            selected={selectedExample === example.id}
            disabled={isLoading}
            onclick={() => handleExampleClick(example.id)}
          >
            {#snippet footer()}
              <span class="example-tags text-xs text-grey"
                >{example.tags?.join(m.separator_bullet_space()) || ''}</span
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

  .card-rail {
    scrollbar-width: thin;
    scrollbar-color: var(--cds-border-strong) var(--cds-layer-02);
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

  .example-project-card :global(#kh-card .title-text) {
    font-size: 0.875rem;
    line-height: 1.25;
  }

  .example-project-card :global(#kh-card .top-section > svg) {
    width: 1.5rem;
    height: 1.5rem;
    flex-shrink: 0;
  }

  .example-project-card :global(#kh-card .top-section > .text-sm) {
    font-size: 0.75rem;
    line-height: 1.25;
    text-align: center;
  }
</style>
