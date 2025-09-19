<script lang="ts">
  import {
    globalActions,
    globalState
  } from '$lib/features/commons/store/global.svelte';
  import {
    ToolbarState,
    ToolbarStep
  } from '$lib/features/commons/types/global';
  import {
    Button,
    ProgressIndicator,
    ProgressStep
  } from 'carbon-components-svelte';
  import {
    ArrowRight,
    ChevronLeft,
    ChevronRight,
    Table
  } from 'carbon-icons-svelte';
  import clsx from 'clsx';
  import type { Snippet } from 'svelte';
  import ToolbarTabs from './components/toolbar-tabs.svelte';
  import DataTab from './data-tab/data-tab.svelte';
  import {
    mainToolbarActions,
    mainToolbarState,
    getDerivedToolbarState
  } from './main-toolbar.state.svelte';
  import { projectStore } from '$lib/features/commons/store/project.store.svelte';
  import VizualisationTab from './visualization-tab/visualization-tab.svelte';

  const listToolsComponents = {
    [ToolbarStep.Data]: DataTab,
    [ToolbarStep.Visualizations]: VizualisationTab
  };

  let selectedList = $derived<Snippet | undefined>(
    globalState.selectedStep
      ? listToolsComponents[
          globalState.selectedStep as ToolbarStep.Visualizations &
            ToolbarStep.Styling
        ]
      : undefined
  );

  function setToolbar(state: ToolbarState) {
    globalActions.setToolbarState(state);
  }

  const selectStep = (step: ToolbarStep): void => {
    globalActions.setNavigationState(step);

    globalState.selectedTool = undefined;
  };

  const derivedToolbarState = $derived(getDerivedToolbarState());

  // Update toolbar state when project changes
  $effect(() => {
    const project = projectStore.currentProject;
    const isDirty = projectStore.isDirty;

    // Update navigation state based on project
    if (project?.data?.sourceFiles && project.data.sourceFiles.length > 0) {
      mainToolbarState.canNavigateToVisualization = true;
    } else {
      mainToolbarState.canNavigateToVisualization = false;
    }

    mainToolbarActions.updateToolbarState();
  });
</script>

<nav
  id="khartis-main-toolbar"
  class={clsx(
    'app-shadow bg-white scrollbar-hidden',
    globalState.toolbarState,
    {
      'collapsed-toolbar': globalState.toolbarState === ToolbarState.Collapsed
    }
  )}
  style="width: {globalState.toolbarState === ToolbarState.Collapsed
    ? '50px'
    : globalState.toolbarState === ToolbarState.Compact
      ? '400px'
      : 'var(--cds-main-toolbar-width)'}"
>
  <header class="flex sticky z-1000 bg-white border-b main-toolbar-header">
    {#if globalState.toolbarState === ToolbarState.Compact}
      <Button
        kind="ghost"
        iconDescription="Agrandir"
        icon={ChevronLeft}
        on:click={() => setToolbar(ToolbarState.Full)}
      />
    {/if}

    {#if globalState.toolbarState === ToolbarState.Collapsed}
      <Button
        kind="ghost"
        iconDescription="Agrandir"
        disabled={globalState.selectedStep === ToolbarStep.Styling}
        icon={ChevronLeft}
        on:click={() => setToolbar(ToolbarState.Full)}
      />
    {:else}
      <Button
        kind="ghost"
        iconDescription="Réduire"
        tooltipAlignment="start"
        icon={ChevronRight}
        on:click={() => setToolbar(ToolbarState.Collapsed)}
      />

      <Button
        kind="ghost"
        iconDescription={globalState.toolbarState === ToolbarState.Compact
          ? 'Agrandir'
          : 'Compacte'}
        icon={Table}
        on:click={() =>
          setToolbar(
            globalState.toolbarState === ToolbarState.Compact
              ? ToolbarState.Full
              : ToolbarState.Compact
          )}
      />
    {/if}

    <ToolbarTabs />
  </header>

  <article
    class={clsx(
      'mt-5 mb-5 pr-5 pl-5',
      globalState.toolbarState === ToolbarState.Collapsed && 'opacity-0'
    )}
  >
    {@render selectedList?.()}
  </article>

  {#if globalState.selectedStep === ToolbarStep.Data}
    {@const dataCompleteness = mainToolbarActions.checkDataCompleteness()}

    <footer
      class={clsx(
        'sticky bottom-0  bg-white p-5 border-t',
        globalState.toolbarState === ToolbarState.Collapsed && 'opacity-0'
      )}
    >
      <ProgressIndicator
        currentIndex={derivedToolbarState.hasProject
          ? derivedToolbarState.hasFiles
            ? 2
            : 1
          : 0}
        spaceEqually
      >
        <ProgressStep
          complete={derivedToolbarState.hasProject}
          label="Créer projet"
          description={derivedToolbarState.hasProject
            ? projectStore.currentProject?.manifest.name
            : 'Créez ou chargez un projet'}
        />
        <ProgressStep
          complete={derivedToolbarState.hasFiles}
          disabled={!derivedToolbarState.hasProject}
          label="Importer données"
          description={derivedToolbarState.hasFiles
            ? 'Données importées'
            : 'Importez vos fichiers CSV ou GeoJSON'}
        />
        <ProgressStep
          complete={dataCompleteness.isComplete}
          disabled={!derivedToolbarState.hasFiles}
          label="Valider"
          description={dataCompleteness.isComplete
            ? 'Prêt pour la visualisation'
            : 'Validation des données'}
        />

        <Button
          on:click={mainToolbarActions.navigateToVisualization}
          disabled={!derivedToolbarState.canVisualize}
          icon={ArrowRight}
          class="visualize-button"
          tooltipPosition="top"
          tooltipAlignment="end"
          iconDescription={!derivedToolbarState.canVisualize
            ? dataCompleteness.missingSteps.join(', ')
            : 'Passer à la visualisation'}
          size="small">Visualiser</Button
        >
      </ProgressIndicator>

      {#if projectStore.isDirty}
        <div class="mt-2 text-xs text-gray-600">
          ⚠️ Modifications non sauvegardées
        </div>
      {/if}
    </footer>
  {/if}
</nav>

<style>
  #khartis-main-toolbar {
    background-color: var(--cds-ui-01);
  }

  nav {
    border-left: 1px solid var(--cds-ui-01);
    transition:
      width 0.3s cubic-bezier(0.4, 0, 0.2, 1),
      right 0.2s ease-in-out;
    width: var(--cds-main-toolbar-width);
    height: calc(100dvh - var(--cds-header-height));
    overflow-y: scroll;
    position: relative;
    gap: var(--cds-spacing-05);
  }

  .scrollbar-hidden {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }

  .scrollbar-hidden::-webkit-scrollbar {
    display: none;
  }

  nav.full {
    right: 0;
    width: var(--cds-main-toolbar-width);
  }

  nav.compact {
    width: 400px !important;
    right: 0;
  }

  nav.collapsed {
    right: 0;
    width: 50px !important;
    min-width: 0;
    padding: 0;
    height: calc(100dvh - 47px);
  }

  .collapsed-toolbar {
    height: calc(100dvh - 47px) !important;
    overflow: hidden;
  }

  #khartis-main-toolbar :global(.visualize-button) {
    margin-left: var(--cds-spacing-05);
  }

  .main-toolbar-header {
    top: 1px !important;
  }
</style>
