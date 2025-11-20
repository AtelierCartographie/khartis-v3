<script lang="ts">
  import {
    globalActions,
    globalState
  } from '$lib/features/commons/store/global.svelte';
  import { projectStore } from '$lib/features/commons/store/project.store.svelte';
  import {
    ToolbarState,
    ToolbarStep
  } from '$lib/features/commons/types/global';
  import * as m from '$lib/paraglide/messages';
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
  import { dataTabStore } from './data-tab/data-tab.store.svelte';
  import DataTab from './data-tab/data-tab.svelte';
  import {
    getDerivedToolbarState,
    mainToolbarActions,
    mainToolbarState
  } from './main-toolbar.state.svelte';
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

  const derivedToolbarState = $derived(getDerivedToolbarState());

  $effect(() => {
    const project = projectStore.currentProject;

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
    {@const activeStepIndex = dataTabStore.activeStepIndex}

    <footer
      class={clsx(
        'sticky bottom-0  bg-white p-5 border-t',
        globalState.toolbarState === ToolbarState.Collapsed && 'opacity-0'
      )}
    >
      <ProgressIndicator
        currentIndex={activeStepIndex}
        spaceEqually
        on:click={(e) => {
          const detail = e.detail;
          if (detail !== undefined && dataTabStore.canNavigateToStep[detail]) {
            dataTabStore.setActiveStep(detail);
          }
        }}
      >
        <ProgressStep
          complete={dataTabStore.hasCompletedStep[0]}
          label={m.data_tab_control()}
          description={dataTabStore.hasCompletedStep[0]
            ? 'Données contrôlées'
            : 'Vérifiez et nettoyez vos données'}
        />
        <ProgressStep
          complete={dataTabStore.hasCompletedStep[1]}
          disabled={!dataTabStore.canNavigateToStep[1]}
          label={m.data_tab_geolocate()}
          description={dataTabStore.hasCompletedStep[1]
            ? 'Géolocalisation effectuée'
            : 'Sélectionnez les colonnes géographiques'}
        />
        <ProgressStep
          complete={dataTabStore.hasCompletedStep[2]}
          disabled={!dataTabStore.canNavigateToStep[2]}
          label={m.data_tab_join()}
          description={dataTabStore.hasCompletedStep[2]
            ? 'Jointure réalisée'
            : 'Associez vos données au fond de carte'}
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
          size="small">{m.data_tab_visualize()}</Button
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
