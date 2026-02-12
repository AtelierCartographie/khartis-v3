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
  import { LogCategory, logger } from '$lib/features/commons/utils/logger';
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
  import ToolbarTabs from './components/toolbar-tabs.svelte';
  import { dataTabStore } from './data-tab/data-tab.store.svelte';
  import DataTab from './data-tab/data-tab.svelte';
  import {
    mainToolbarActions,
    mainToolbarState
  } from './main-toolbar.state.svelte';
  import VizualisationTab from './visualization-tab/visualization-tab.svelte';

  function setToolbar(state: ToolbarState) {
    globalActions.setToolbarState(state);
  }

  let lastUiSnapshot = $state<string>('');

  $effect(() => {
    const project = projectStore.currentProject;

    const hasFiles = (project?.data?.sourceFiles?.length ?? 0) > 0;

    mainToolbarState.canNavigateToVisualization = hasFiles;
    mainToolbarState.hasValidData = hasFiles;
    mainToolbarState.currentProjectName = project?.manifest.name || '';
  });

  $effect(() => {
    const selectedStep = globalState.selectedStep;
    const toolbarState = globalState.toolbarState;
    const hasDataTabContent = selectedStep === ToolbarStep.Data;
    const hasVisualizationTabContent =
      selectedStep === ToolbarStep.Visualizations;
    const snapshot = `${selectedStep}|${toolbarState}|${hasDataTabContent}|${hasVisualizationTabContent}`;

    if (snapshot === lastUiSnapshot) {
      return;
    }
    lastUiSnapshot = snapshot;

    logger.info('[main-toolbar] content selection snapshot', LogCategory.UI, {
      selectedStep,
      toolbarState,
      willRenderDataTab: hasDataTabContent,
      willRenderVisualizationTab: hasVisualizationTabContent,
      selectedTool: globalState.selectedTool
    });
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
>
  <header class="flex sticky z-1000 bg-white border-b main-toolbar-header">
    {#if globalState.toolbarState === ToolbarState.Compact}
      <Button
        kind="ghost"
        iconDescription={m.toolbar_expand()}
        icon={ChevronLeft}
        on:click={() => setToolbar(ToolbarState.Full)}
      />
    {/if}

    {#if globalState.toolbarState === ToolbarState.Collapsed}
      <Button
        kind="ghost"
        iconDescription={m.toolbar_expand()}
        disabled={globalState.selectedStep === ToolbarStep.Styling}
        icon={ChevronLeft}
        on:click={() => setToolbar(ToolbarState.Full)}
      />
    {:else}
      <Button
        kind="ghost"
        iconDescription={m.toolbar_collapse()}
        tooltipAlignment="start"
        icon={ChevronRight}
        on:click={() => setToolbar(ToolbarState.Collapsed)}
      />

      <Button
        kind="ghost"
        iconDescription={globalState.toolbarState === ToolbarState.Compact
          ? m.toolbar_expand()
          : m.toolbar_compact()}
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
      'toolbar-content scrollbar-hidden',
      globalState.toolbarState === ToolbarState.Collapsed && 'opacity-0'
    )}
  >
    {#if globalState.selectedStep === ToolbarStep.Data}
      <DataTab />
    {:else if globalState.selectedStep === ToolbarStep.Visualizations}
      <VizualisationTab />
    {/if}
  </article>

  {#if globalState.selectedStep === ToolbarStep.Data}
    {@const activeStepIndex = dataTabStore.activeStepIndex}
    {@const isGeographicMode = dataTabStore.isGeographicMode}
    {@const canVisualizeNow = dataTabStore.isReadyForVisualization}

    <footer
      class={clsx(
        'toolbar-footer bg-white p-5 border-t z-50',
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
            ? m.data_step_status_controlled()
            : m.data_step_status_clean()}
        />

        {#if isGeographicMode}
          <ProgressStep
            complete={dataTabStore.hasCompletedStep[1]}
            disabled={!dataTabStore.canNavigateToStep[1]}
            label={m.data_tab_enrich()}
            description={dataTabStore.hasCompletedStep[1]
              ? m.enrich_status_done()
              : m.enrich_status_pending()}
          />
        {:else}
          <ProgressStep
            complete={dataTabStore.hasCompletedStep[1]}
            disabled={!dataTabStore.canNavigateToStep[1]}
            label={m.data_tab_geolocate()}
            description={dataTabStore.hasCompletedStep[1]
              ? m.geolocation_status_done()
              : m.geolocation_status_pending()}
          />
          <ProgressStep
            complete={dataTabStore.hasCompletedStep[2]}
            disabled={!dataTabStore.canNavigateToStep[2]}
            label={m.data_tab_join()}
            description={dataTabStore.hasCompletedStep[2]
              ? m.join_status_done()
              : m.join_status_pending()}
          />
        {/if}

        <Button
          on:click={mainToolbarActions.navigateToVisualization}
          disabled={!canVisualizeNow}
          icon={ArrowRight}
          class="visualize-button"
          tooltipPosition="top"
          tooltipAlignment="end"
          iconDescription={!canVisualizeNow
            ? isGeographicMode
              ? m.data_step_status_clean()
              : m.join_status_pending()
            : m.go_to_visualization()}
          size="small">{m.data_tab_visualize()}</Button
        >
      </ProgressIndicator>
    </footer>
  {/if}
</nav>

<style>
  #khartis-main-toolbar {
    background-color: var(--cds-ui-01);
  }

  nav {
    display: flex;
    flex-direction: column;
    border-left: 1px solid var(--cds-ui-01);
    z-index: 1100;
    transition:
      width 0.3s cubic-bezier(0.4, 0, 0.2, 1),
      flex 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    height: calc(100dvh - var(--cds-header-height));
    overflow: hidden;
    position: relative;
    flex-shrink: 0;
  }

  .scrollbar-hidden {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }

  .scrollbar-hidden::-webkit-scrollbar {
    display: none;
  }

  nav.full {
    width: 50%;
    min-width: 400px;
    max-width: 800px;
  }

  nav.compact {
    width: 434px;
  }

  nav.collapsed {
    width: 50px;
    min-width: 50px;
    padding: 0;
    height: calc(100dvh - 47px);
    overflow: hidden;
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

  .toolbar-content {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .toolbar-footer {
    flex-shrink: 0;
  }
</style>
