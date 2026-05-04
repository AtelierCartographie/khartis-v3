<script lang="ts">
  import IconButton from '$lib/features/commons/components/carbon/icon-button.svelte';
  import {
    globalActions,
    globalState
  } from '$lib/features/commons/store/global.svelte';
  import { projectStore } from '$lib/features/commons/store/project.store.svelte';
  import { visualizationStore } from '$lib/features/commons/store/visualization.store.svelte';
  import {
    StylingTools,
    ToolbarStep,
    VisualizationTools
  } from '$lib/features/commons/types/global';
  import * as m from '$lib/paraglide/messages';
  import {
    Add,
    ChevronDown,
    ColorPalette,
    DataBase,
    Earth,
    EdgeNode,
    Edit,
    Grid as GridIcon,
    Layers,
    Legend,
    Location,
    RulerAlt,
    Search,
    TextFont,
    View
  } from 'carbon-icons-svelte';
  import clsx from 'clsx';
  import ToolPopover from '../step-toolbar/tool-popover.svelte';
  import { annotationsActions } from '../step-toolbar/tools/annotations/annotations.store.svelte';
  import {
    getLegendState,
    legendActions
  } from '../step-toolbar/tools/legend/legend.store.svelte';
  import {
    closeSelectedToolPanel,
    selectTool
  } from '../step-toolbar/tools-list/tool-list.utils.svelte';
  import ToolContainer from '../step-toolbar/tools/tool-container.svelte';
  import { VizSubTab } from './constants';
  import DataTab from './data-tab/data-tab.svelte';
  import ChooseVisualization from './visualization-tab/choose-visualization.svelte';
  import ConfigureVisualization from './visualization-tab/configure-visualization.svelte';
  import CustomizeBasemap from './visualization-tab/customize-basemap.svelte';

  let activeVizSubTab = $state<VizSubTab>(VizSubTab.CHOOSE);

  const vizSubTabs = [
    { id: VizSubTab.CHOOSE, label: m.mobile_viz_tab_choose() },
    { id: VizSubTab.CONFIGURE, label: m.mobile_viz_tab_configure() },
    { id: VizSubTab.CUSTOMIZE, label: m.mobile_viz_tab_customize() }
  ] as const;

  const stepLabels = {
    [ToolbarStep.Data]: m.step_data(),
    [ToolbarStep.Visualizations]: m.step_visualizations(),
    [ToolbarStep.Styling]: m.step_styling()
  };

  const vizCount = $derived(
    visualizationStore.activeVisualizations?.length ?? 0
  );
  const legendState = $derived(getLegendState());
  const showLegendBadge = $derived(!legendState.hasBeenOpened);

  const selectStep = (step: ToolbarStep): void => {
    if (globalState.selectedStep === step && globalState.isMobileToolbarOpen) {
      globalActions.closeMobileToolbar();
    } else {
      globalActions.setNavigationState(step);
      if (step === ToolbarStep.Styling) {
        globalActions.closeMobileToolbar();
      } else {
        globalActions.openMobileToolbar();
      }
    }
    closeSelectedToolPanel();
  };

  const isStepSelected = (step: ToolbarStep): boolean => {
    return globalState.selectedStep === step;
  };

  const handleClose = () => {
    globalActions.closeMobileToolbar();
  };

  const handleToolSelect = (tool: VisualizationTools) => {
    selectTool(tool);
  };

  const handleStylingToolSelect = (tool: StylingTools) => {
    if (tool === StylingTools.Legend) {
      legendActions.markAsOpened();
    }

    if (tool === StylingTools.Annotations) {
      if (globalState.selectedTool === StylingTools.Annotations) {
        closeSelectedToolPanel();
        return;
      }

      annotationsActions.initPageElements({
        withPlaceholders: true,
        visible: true
      });
    }

    selectTool(tool);
  };

  const showToolsBar = $derived(
    globalState.selectedStep === ToolbarStep.Visualizations ||
      globalState.selectedStep === ToolbarStep.Styling
  );

  const hasProject = $derived(!!projectStore.currentProject);
</script>

{#if globalState.isMobileView}
  <div
    class={clsx('mobile-toolbar-overlay', {
      open: globalState.isMobileToolbarOpen,
      'with-tools-bar': showToolsBar
    })}
    role="dialog"
    aria-modal="true"
    aria-label={stepLabels[globalState.selectedStep]}
  >
    <header class="mobile-toolbar-header">
      <div class="header-left">
        {#if globalState.selectedStep === ToolbarStep.Visualizations}
          <ColorPalette size={20} />
          <h2>{m.step_visualizations()} ({vizCount})</h2>
        {:else if globalState.selectedStep === ToolbarStep.Data}
          <DataBase size={20} />
          <h2>{stepLabels[ToolbarStep.Data]}</h2>
        {:else}
          <RulerAlt size={20} />
          <h2>{stepLabels[ToolbarStep.Styling]}</h2>
        {/if}
      </div>
      <div class="header-actions">
        {#if globalState.selectedStep === ToolbarStep.Visualizations}
          <IconButton
            kind="ghost"
            size="small"
            icon={Add}
            iconDescription={m.new_visualization_button()}
          />
        {/if}
        <IconButton
          kind="ghost"
          size="small"
          icon={ChevronDown}
          iconDescription={m.close()}
          on:click={handleClose}
        />
      </div>
    </header>

    <article class="mobile-toolbar-content">
      {#if globalState.selectedStep === ToolbarStep.Data}
        <DataTab />
      {:else if globalState.selectedStep === ToolbarStep.Visualizations}
        <div class="viz-content">
          {#if activeVizSubTab === VizSubTab.CHOOSE}
            <ChooseVisualization />
          {:else}
            <ConfigureVisualization />
            <CustomizeBasemap />
          {/if}
        </div>
      {:else if globalState.selectedStep === ToolbarStep.Styling}
        <div class="styling-empty-state">
          <p class="styling-hint">{m.styling_tools_hint()}</p>
        </div>
      {/if}
    </article>

    {#if globalState.selectedStep === ToolbarStep.Visualizations}
      <div class="viz-sub-tabs">
        {#each vizSubTabs as tab (tab.id)}
          <button
            type="button"
            class={clsx('sub-tab', {
              selected: activeVizSubTab === tab.id
            })}
            onclick={() => (activeVizSubTab = tab.id)}
            aria-pressed={activeVizSubTab === tab.id}
          >
            {tab.label}
          </button>
        {/each}
      </div>
    {/if}
  </div>

  {#if showToolsBar && hasProject}
    <nav class="mobile-tools-bar app-shadow" aria-label={m.mobile_tools_aria()}>
      {#if globalState.selectedStep === ToolbarStep.Visualizations}
        <IconButton
          kind="ghost"
          size="small"
          icon={Search}
          iconDescription={m.tool_search()}
          hideTooltip={true}
          isSelected={globalState.selectedTool === VisualizationTools.Search}
          on:click={() => handleToolSelect(VisualizationTools.Search)}
        />
        <IconButton
          kind="ghost"
          size="small"
          icon={Layers}
          iconDescription={m.tool_layers()}
          hideTooltip={true}
          isSelected={globalState.selectedTool === VisualizationTools.Layers}
          on:click={() => handleToolSelect(VisualizationTools.Layers)}
        />
        <IconButton
          kind="ghost"
          size="small"
          icon={Earth}
          iconDescription={m.tool_projection()}
          hideTooltip={true}
          isSelected={globalState.selectedTool ===
            VisualizationTools.Projection}
          on:click={() => handleToolSelect(VisualizationTools.Projection)}
        />
        <IconButton
          kind="ghost"
          size="small"
          icon={EdgeNode}
          iconDescription={m.tool_simplification()}
          hideTooltip={true}
          isSelected={globalState.selectedTool ===
            VisualizationTools.Simplification}
          on:click={() => handleToolSelect(VisualizationTools.Simplification)}
        />
        <IconButton
          kind="ghost"
          size="small"
          icon={GridIcon}
          iconDescription={m.tool_facets()}
          hideTooltip={true}
          isSelected={globalState.selectedTool === VisualizationTools.Facets}
          on:click={() => handleToolSelect(VisualizationTools.Facets)}
        />
      {:else if globalState.selectedStep === ToolbarStep.Styling}
        <button
          type="button"
          class="mobile-tool-btn"
          class:active={globalState.selectedTool === StylingTools.Format}
          aria-pressed={globalState.selectedTool === StylingTools.Format}
          onclick={() => handleStylingToolSelect(StylingTools.Format)}
        >
          {#if globalState.selectedTool === StylingTools.Format}
            <span class="tool-active-indicator"></span>
          {/if}
          <TextFont size={20} />
        </button>
        <div class="mobile-tool-wrapper">
          <button
            type="button"
            class="mobile-tool-btn"
            class:active={globalState.selectedTool === StylingTools.Legend}
            aria-pressed={globalState.selectedTool === StylingTools.Legend}
            onclick={() => handleStylingToolSelect(StylingTools.Legend)}
          >
            {#if globalState.selectedTool === StylingTools.Legend}
              <span class="tool-active-indicator"></span>
            {/if}
            <Legend size={20} />
          </button>
          {#if showLegendBadge}
            <span class="notification-badge"></span>
          {/if}
        </div>
        <button
          type="button"
          class="mobile-tool-btn"
          class:active={globalState.selectedTool ===
            StylingTools.GeoIndications}
          aria-pressed={globalState.selectedTool ===
            StylingTools.GeoIndications}
          onclick={() => handleStylingToolSelect(StylingTools.GeoIndications)}
        >
          {#if globalState.selectedTool === StylingTools.GeoIndications}
            <span class="tool-active-indicator"></span>
          {/if}
          <Location size={20} />
        </button>
        <button
          type="button"
          class="mobile-tool-btn"
          class:active={globalState.selectedTool === StylingTools.Annotations}
          aria-pressed={globalState.selectedTool === StylingTools.Annotations}
          onclick={() => handleStylingToolSelect(StylingTools.Annotations)}
        >
          {#if globalState.selectedTool === StylingTools.Annotations}
            <span class="tool-active-indicator"></span>
          {/if}
          <Edit size={20} />
        </button>
        <button
          type="button"
          class="mobile-tool-btn"
          class:active={globalState.selectedTool ===
            StylingTools.ColorBlindness}
          aria-pressed={globalState.selectedTool ===
            StylingTools.ColorBlindness}
          onclick={() => handleStylingToolSelect(StylingTools.ColorBlindness)}
        >
          {#if globalState.selectedTool === StylingTools.ColorBlindness}
            <span class="tool-active-indicator"></span>
          {/if}
          <View size={20} />
        </button>
      {/if}
    </nav>

    <ToolPopover
      light
      open={!!globalState.selectedTool}
      align="top"
      viewMode={globalState.projectionViewMode ?? 'list'}
      listWidth={320}
      gridWidth="100vw"
    >
      {#snippet content()}
        <ToolContainer />
      {/snippet}
    </ToolPopover>
  {/if}

  <nav
    class="mobile-bottom-nav app-shadow"
    aria-label={m.navigation_primary_aria()}
  >
    <button
      class={clsx('nav-tab', { selected: isStepSelected(ToolbarStep.Data) })}
      onclick={() => selectStep(ToolbarStep.Data)}
      aria-pressed={isStepSelected(ToolbarStep.Data)}
    >
      <DataBase size={24} />
      <span>{stepLabels[ToolbarStep.Data]}</span>
    </button>

    <button
      class={clsx('nav-tab', {
        selected: isStepSelected(ToolbarStep.Visualizations)
      })}
      onclick={() => selectStep(ToolbarStep.Visualizations)}
      aria-pressed={isStepSelected(ToolbarStep.Visualizations)}
    >
      <ColorPalette size={24} />
      <span>{stepLabels[ToolbarStep.Visualizations]}</span>
    </button>

    <button
      class={clsx('nav-tab', { selected: isStepSelected(ToolbarStep.Styling) })}
      onclick={() => selectStep(ToolbarStep.Styling)}
      aria-pressed={isStepSelected(ToolbarStep.Styling)}
    >
      <RulerAlt size={24} />
      <span>{stepLabels[ToolbarStep.Styling]}</span>
    </button>
  </nav>
{/if}

<style>
  .mobile-toolbar-overlay {
    position: fixed;
    top: var(--cds-header-height);
    left: 0;
    right: 0;
    bottom: calc(60px + env(safe-area-inset-bottom, 0px));
    background: var(--cds-ui-01);
    z-index: var(--z-mobile-toolbar);
    transform: translateY(100%);
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .mobile-toolbar-overlay.with-tools-bar {
    bottom: calc(
      60px + env(safe-area-inset-bottom, 0px) + var(--cds-spacing-10) +
        var(--cds-spacing-03)
    );
  }

  .mobile-toolbar-overlay.open {
    transform: translateY(0);
  }

  .mobile-toolbar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--cds-spacing-03) var(--cds-spacing-05);
    border-bottom: 1px solid var(--cds-ui-03);
    background: var(--cds-ui-01);
    flex-shrink: 0;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03);
  }

  .header-left :global(svg) {
    fill: var(--cds-text-01);
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-02);
  }

  .mobile-toolbar-header h2 {
    font-size: 1rem;
    font-weight: 600;
    margin: 0;
  }

  .mobile-toolbar-content {
    flex: 1;
    overflow-y: auto;
    padding: 0;
    -webkit-overflow-scrolling: touch;
  }

  .viz-content {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-05);
  }

  .viz-sub-tabs {
    display: flex;
    position: sticky;
    bottom: 0;
    background: var(--cds-ui-01);
    border-top: 1px solid var(--cds-ui-03);
    flex-shrink: 0;
  }

  .sub-tab {
    flex: 1;
    padding: var(--cds-spacing-04);
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--cds-text-02);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .sub-tab:active {
    background: var(--cds-hover-ui);
  }

  .sub-tab.selected {
    color: var(--cds-text-01);
    border-bottom-color: var(--cds-interactive-01);
  }

  .styling-empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: var(--cds-spacing-05);
  }

  .styling-hint {
    color: var(--cds-text-02);
    font-size: 0.875rem;
    text-align: center;
  }

  .mobile-tool-wrapper {
    position: relative;
  }

  .mobile-tool-btn {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: var(--cds-text-01);
    cursor: pointer;
    transition: background-color 0.15s ease;
  }

  .mobile-tool-btn:hover {
    background: var(--cds-hover-ui);
  }

  .mobile-tool-btn:active {
    background: var(--cds-active-ui);
  }

  .mobile-tool-btn :global(svg) {
    fill: var(--cds-text-01);
  }

  .tool-active-indicator {
    position: absolute;
    top: 2px;
    left: 50%;
    transform: translateX(-50%);
    width: 6px;
    height: 6px;
    background-color: var(--cds-support-error, #da1e28);
    border-radius: 50%;
    pointer-events: none;
  }

  .notification-badge {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 8px;
    height: 8px;
    background-color: var(--cds-support-error, #da1e28);
    border-radius: 50%;
    pointer-events: none;
  }

  .mobile-tools-bar {
    position: fixed;
    bottom: calc(
      60px + env(safe-area-inset-bottom, 0px) + var(--cds-spacing-03)
    );
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-01);
    padding: var(--cds-spacing-02) var(--cds-spacing-03);
    background: var(--cds-ui-01);
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
    z-index: calc(var(--z-mobile-toolbar) + 1);
  }

  .mobile-bottom-nav {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex;
    align-items: stretch;
    justify-content: space-around;
    background: var(--cds-background);
    border-top: 1px solid var(--cds-ui-03);
    padding-bottom: env(safe-area-inset-bottom, 0px);
    z-index: var(--z-toolbar);
    height: calc(60px + env(safe-area-inset-bottom, 0px));
  }

  .nav-tab {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: var(--cds-spacing-03) var(--cds-spacing-02);
    background: none;
    border: none;
    color: var(--cds-text-02);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .nav-tab:active {
    background: var(--cds-hover-ui);
  }

  .nav-tab.selected {
    color: var(--cds-text-primary);
    background: var(--cds-layer-selected);
  }

  .nav-tab.selected :global(svg) {
    fill: var(--cds-text-primary);
  }

  .nav-tab :global(svg) {
    fill: var(--cds-text-02);
  }

  .nav-tab span {
    font-size: 11px;
    font-weight: 500;
  }
</style>
