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
    Document,
    Earth,
    EdgeNode,
    Grid as GridIcon,
    Layers,
    ListBoxes,
    Pen,
    RulerAlt,
    Search,
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
      globalActions.openMobileToolbar();
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
      open: globalState.isMobileToolbarOpen
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
        <div class="styling-tools-grid">
          <p class="styling-intro">{m.styling_tools_intro()}</p>
          <div class="tools-grid">
            <button
              class="tool-btn"
              onclick={() => handleStylingToolSelect(StylingTools.Format)}
            >
              <Document size={32} />
              <span>{m.tool_format()}</span>
            </button>
            <div class="tool-button-wrapper">
              <button
                class="tool-btn"
                onclick={() => handleStylingToolSelect(StylingTools.Legend)}
              >
                <ListBoxes size={32} />
                <span>{m.tool_legend()}</span>
              </button>
              {#if showLegendBadge}
                <span class="notification-badge"></span>
              {/if}
            </div>
            <button
              class="tool-btn"
              onclick={() =>
                handleStylingToolSelect(StylingTools.GeoIndications)}
            >
              <Earth size={32} />
              <span>{m.tool_geo_indications()}</span>
            </button>
            <button
              class="tool-btn"
              onclick={() => handleStylingToolSelect(StylingTools.Annotations)}
            >
              <Pen size={32} />
              <span>{m.tool_annotations()}</span>
            </button>
            <button
              class="tool-btn"
              onclick={() =>
                handleStylingToolSelect(StylingTools.ColorBlindness)}
            >
              <View size={32} />
              <span>{m.tool_color_blindness()}</span>
            </button>
          </div>
        </div>
      {/if}
    </article>

    {#if globalState.selectedStep === ToolbarStep.Visualizations}
      <div class="viz-sub-tabs">
        <button
          class={clsx('sub-tab', {
            selected: activeVizSubTab === VizSubTab.CHOOSE
          })}
          onclick={() => (activeVizSubTab = VizSubTab.CHOOSE)}
        >
          {m.mobile_viz_tab_choose()}
        </button>
        <button
          class={clsx('sub-tab', {
            selected: activeVizSubTab === VizSubTab.CONFIGURE
          })}
          onclick={() => (activeVizSubTab = VizSubTab.CONFIGURE)}
        >
          {m.mobile_viz_tab_customize()}
        </button>
      </div>
    {/if}
  </div>

  {#if showToolsBar && hasProject}
    <nav class="mobile-tools-bar app-shadow" aria-label={m.mobile_tools_aria()}>
      <IconButton
        kind="ghost"
        size="small"
        icon={Search}
        iconDescription={m.tool_search()}
        isSelected={globalState.selectedTool === VisualizationTools.Search}
        on:click={() => handleToolSelect(VisualizationTools.Search)}
      />
      <IconButton
        kind="ghost"
        size="small"
        icon={Layers}
        iconDescription={m.tool_layers()}
        isSelected={globalState.selectedTool === VisualizationTools.Layers}
        on:click={() => handleToolSelect(VisualizationTools.Layers)}
      />
      <IconButton
        kind="ghost"
        size="small"
        icon={Earth}
        iconDescription={m.tool_projection()}
        isSelected={globalState.selectedTool === VisualizationTools.Projection}
        on:click={() => handleToolSelect(VisualizationTools.Projection)}
      />
      <IconButton
        kind="ghost"
        size="small"
        icon={EdgeNode}
        iconDescription={m.tool_simplification()}
        isSelected={globalState.selectedTool ===
          VisualizationTools.Simplification}
        on:click={() => handleToolSelect(VisualizationTools.Simplification)}
      />
      <IconButton
        kind="ghost"
        size="small"
        icon={GridIcon}
        iconDescription={m.tool_facets()}
        isSelected={globalState.selectedTool === VisualizationTools.Facets}
        on:click={() => handleToolSelect(VisualizationTools.Facets)}
      />

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
    </nav>
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

  .styling-tools-grid {
    padding: var(--cds-spacing-05);
  }

  .styling-intro {
    color: var(--cds-text-02);
    font-size: 0.875rem;
    margin-bottom: var(--cds-spacing-05);
    text-align: center;
  }

  .tools-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--cds-spacing-04);
  }

  .tool-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--cds-spacing-02);
    padding: var(--cds-spacing-04);
    background: var(--cds-ui-01);
    border: 1px solid var(--cds-ui-03);
    border-radius: 8px;
    color: var(--cds-text-01);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .tool-btn:hover {
    background: var(--cds-hover-ui);
  }

  .tool-btn:active {
    background: var(--cds-active-ui);
  }

  .tool-btn :global(svg) {
    fill: var(--cds-text-01);
  }

  .tool-btn span {
    font-size: 0.75rem;
    font-weight: 500;
    text-align: center;
  }

  .tool-button-wrapper {
    position: relative;
  }

  .tool-button-wrapper .tool-btn {
    width: 100%;
  }

  .notification-badge {
    position: absolute;
    top: 8px;
    right: 8px;
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
    gap: var(--cds-spacing-02);
    padding: var(--cds-spacing-02) var(--cds-spacing-03);
    background: var(--cds-ui-01);
    border-radius: 8px;
    z-index: var(--z-mobile-overlay);
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
    color: var(--cds-interactive-01);
  }

  .nav-tab.selected :global(svg) {
    fill: var(--cds-interactive-01);
  }

  .nav-tab :global(svg) {
    fill: var(--cds-text-02);
  }

  .nav-tab span {
    font-size: 11px;
    font-weight: 500;
  }
</style>
