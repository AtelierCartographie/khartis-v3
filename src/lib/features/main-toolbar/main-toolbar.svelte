<script lang="ts">
  import Button from '$lib/features/commons/components/carbon/button.svelte';
  import IconButton from '$lib/features/commons/components/carbon/icon-button.svelte';
  import {
    globalActions,
    globalState
  } from '$lib/features/commons/stores/global.svelte';
  import {
    ToolbarState,
    ToolbarStep
  } from '$lib/features/commons/types/global';
  import * as m from '$lib/paraglide/messages';
  import { ProgressIndicator, ProgressStep } from 'carbon-components-svelte';
  import {
    ArrowRight,
    CheckmarkOutline,
    ChevronLeft,
    ChevronRight,
    CircleDash,
    OpenPanelFilledRight
  } from 'carbon-icons-svelte';
  import clsx from 'clsx';
  import { tick } from 'svelte';
  import ToolbarTabs from './components/toolbar-tabs.svelte';
  import { dataTabStore } from '$lib/features/data-tab/stores/data-tab.store.svelte';
  import DataTab from '$lib/features/data-tab/data-tab.svelte';
  import { Visualization as VizualisationTab } from '$lib/features/visualization-tab';
  import { mainToolbarActions } from './stores/main-toolbar.store.svelte';

  let toolbarContent = $state<HTMLElement | null>(null);

  function setToolbar(state: ToolbarState) {
    globalActions.setToolbarState(state);
  }

  const hasToolbarPanel = $derived(
    globalState.selectedStep !== ToolbarStep.Styling
  );

  const isCompact = $derived(globalState.toolbarState === ToolbarState.Compact);

  const totalSteps = $derived(dataTabStore.isGeographicMode ? 2 : 3);

  const currentStepLabel = $derived.by(() => {
    const idx = dataTabStore.activeStepIndex;
    if (idx === 0) return m.data_tab_control();
    if (dataTabStore.isGeographicMode) return m.data_tab_enrich();
    if (idx === 1) return m.data_tab_geolocate();
    if (dataTabStore.isTabularGPSMode) return m.data_tab_basemap();
    return m.data_tab_join();
  });

  const DATA_STEP_SECTION_IDS: Record<string, string[]> = {
    geo: ['data-control-step', 'enrich-data-step'],
    tabular: ['data-control-step', 'geolocation-step', 'basemap-join-step']
  };

  async function handleBreadcrumbStep(stepIndex: number) {
    if (dataTabStore.canNavigateToStep[stepIndex]) {
      dataTabStore.setActiveStep(stepIndex);
      await tick();
      const mode = dataTabStore.isGeographicMode ? 'geo' : 'tabular';
      const sectionId = DATA_STEP_SECTION_IDS[mode][stepIndex];
      const section = toolbarContent?.querySelector(`#${sectionId}`);
      if (section) {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (toolbarContent) {
        toolbarContent.scrollTop = 0;
      }
    }
  }

  function handleToolbarToggle(): void {
    if (!hasToolbarPanel) {
      return;
    }

    if (globalState.selectedStep === ToolbarStep.Visualizations) {
      setToolbar(
        globalState.toolbarState === ToolbarState.Collapsed
          ? ToolbarState.Compact
          : ToolbarState.Collapsed
      );
      return;
    }

    setToolbar(
      globalState.toolbarState === ToolbarState.Full
        ? ToolbarState.Compact
        : ToolbarState.Full
    );
  }

  $effect(() => {
    if (
      globalState.selectedStep === ToolbarStep.Visualizations &&
      globalState.toolbarState === ToolbarState.Full
    ) {
      globalActions.setToolbarState(ToolbarState.Compact);
    }
  });

  $effect(() => {
    void globalState.selectedStep;
    if (toolbarContent) {
      toolbarContent.scrollTop = 0;
    }
  });
</script>

<nav
  id="khartis-main-toolbar"
  hidden={globalState.selectedStep === ToolbarStep.Styling}
  class={clsx('app-shadow scrollbar-hidden', globalState.toolbarState, {
    'collapsed-toolbar': globalState.toolbarState === ToolbarState.Collapsed
  })}
>
  <header class="flex sticky z-1000 border-b main-toolbar-header">
    {#if hasToolbarPanel}
      <IconButton
        kind="ghost"
        iconDescription={globalState.toolbarState === ToolbarState.Full
          ? m.toolbar_compact()
          : m.toolbar_expand()}
        icon={OpenPanelFilledRight}
        on:click={handleToolbarToggle}
      />
      <ToolbarTabs />
    {/if}
  </header>

  <article
    bind:this={toolbarContent}
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
        'toolbar-footer border-t z-50',
        globalState.toolbarState === ToolbarState.Collapsed && 'opacity-0'
      )}
    >
      {#if isCompact}
        <div class="compact-steps">
          <IconButton
            kind="ghost"
            size="sm"
            icon={ChevronLeft}
            iconDescription={m.data_step_previous()}
            disabled={activeStepIndex === 0}
            on:click={() => handleBreadcrumbStep(activeStepIndex - 1)}
          />
          <span class="compact-step-label">
            {#if dataTabStore.hasCompletedStep[activeStepIndex]}
              <CheckmarkOutline size={16} class="step-icon" />
            {:else}
              <CircleDash size={16} class="step-icon" />
            {/if}
            {activeStepIndex +
              1}&thinsp;/&thinsp;{totalSteps}&ensp;·&ensp;{currentStepLabel}
          </span>
          <IconButton
            kind="ghost"
            size="sm"
            icon={ChevronRight}
            iconDescription={m.data_step_next()}
            disabled={!dataTabStore.canNavigateToStep[activeStepIndex + 1]}
            on:click={() => handleBreadcrumbStep(activeStepIndex + 1)}
          />
        </div>
      {:else}
        <ProgressIndicator
          currentIndex={activeStepIndex}
          spaceEqually
          on:change={(e) => handleBreadcrumbStep(e.detail)}
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
              label={dataTabStore.isTabularGPSMode
                ? m.data_tab_basemap()
                : m.data_tab_join()}
              description={dataTabStore.hasCompletedStep[2]
                ? m.join_status_done()
                : m.join_status_pending()}
            />
          {/if}
        </ProgressIndicator>
      {/if}

      <Button
        on:click={mainToolbarActions.navigateToVisualization}
        disabled={!canVisualizeNow}
        icon={ArrowRight}
        hasIconOnly={!canVisualizeNow}
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
    </footer>
  {/if}
</nav>

<style>
  #khartis-main-toolbar[hidden] {
    display: none !important;
  }

  #khartis-main-toolbar {
    background-color: var(--cds-ui-01);
  }

  nav {
    display: flex;
    flex-direction: column;
    border-left: 1px solid var(--cds-ui-01);
    z-index: var(--z-main-toolbar);
    will-change: width;
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
    height: calc(100dvh - var(--cds-header-height));
    overflow: hidden;
  }

  .collapsed-toolbar {
    height: calc(100dvh - var(--cds-header-height)) !important;
    overflow: hidden;
  }

  .main-toolbar-header {
    top: 1px !important;
    background-color: var(--cds-ui-01);
    border-color: var(--cds-border-subtle-00);
  }

  .toolbar-content {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .toolbar-footer {
    flex-shrink: 0;
    background-color: var(--cds-ui-01);
    border-color: var(--cds-border-subtle-00);
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-04);
    padding: var(--cds-spacing-04) var(--cds-spacing-05);
  }

  #khartis-main-toolbar :global(.toolbar-footer .bx--progress) {
    flex: 1;
    min-width: 0;
  }

  #khartis-main-toolbar :global(.toolbar-footer .bx--progress-optional) {
    display: none;
  }

  .compact-steps {
    display: flex;
    align-items: center;
    flex: 1;
    min-width: 0;
    gap: var(--cds-spacing-02);
  }

  .compact-step-label {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-02);
    flex: 1;
    min-width: 0;
    font-size: 0.875rem;
    line-height: 1.125rem;
    color: var(--cds-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  #khartis-main-toolbar :global(.step-icon) {
    flex-shrink: 0;
  }
</style>
