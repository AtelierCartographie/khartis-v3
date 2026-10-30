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
    DoubleChevronLeft,
    DoubleChevronRight,
    OpenPanelFilledRight
  } from 'carbon-icons-svelte';
  import clsx from 'clsx';
  import { tick, untrack } from 'svelte';
  import { cubicIn, cubicOut } from 'svelte/easing';
  import { fly } from 'svelte/transition';
  import OpenPanelFilledRightWide from './components/open-panel-filled-right-wide.svelte';
  import ToolbarTabs from './components/toolbar-tabs.svelte';
  import { dataTabStore } from '$lib/features/data-tab/stores/data-tab.store.svelte';
  import DataTab from '$lib/features/data-tab/data-tab.svelte';
  import { Visualization as VizualisationTab } from '$lib/features/visualization-tab';
  import { mainToolbarActions } from './stores/main-toolbar.store.svelte';
  import { datasetsStore } from '$lib/features/commons/stores/datasets.store.svelte';
  import { projectStore } from '$lib/features/commons/stores/project.store.svelte';
  import { findDatasetAttachment } from '$lib/features/commons/utils/dataset-attachment.utils';
  import { scrollShadows } from '$lib/features/commons/utils/scroll-shadows';
  import {
    motionDuration,
    trackStepDirection
  } from '$lib/features/commons/utils/step-transition.svelte';

  let toolbarContent = $state<HTMLElement | null>(null);
  let panelElement = $state<HTMLElement | null>(null);

  const PANEL_MOTION_MS = 300;
  const PANEL_EASING = 'cubic-bezier(0.2, 0, 0.38, 0.9)';

  // Habillage slides the panel out. It keeps the width it had, rather than
  // the collapsed state the step sets, so that it does not shrink first.
  const isPanelHidden = $derived(
    globalState.selectedStep === ToolbarStep.Styling
  );
  let shownToolbarState = $state(untrack(() => globalState.toolbarState));

  $effect.pre(() => {
    const toolbarState = globalState.toolbarState;
    if (!isPanelHidden) {
      shownToolbarState = toolbarState;
    }
  });

  // A width change snaps the panel to its new width, then slides its edge
  // from where it was: only a transform runs on each frame.
  let panelLeftBefore: number | null = null;
  let panelSlide: Animation | null = null;

  $effect.pre(() => {
    void shownToolbarState;
    untrack(() => {
      panelLeftBefore = panelElement?.getBoundingClientRect().left ?? null;
    });
  });

  $effect(() => {
    void shownToolbarState;
    untrack(() => {
      const from = panelLeftBefore;
      panelLeftBefore = null;
      if (from === null || !panelElement) return;
      panelSlide?.cancel();
      const shift = from - panelElement.getBoundingClientRect().left;
      if (Math.abs(shift) < 1 || motionDuration(PANEL_MOTION_MS) === 0) {
        return;
      }
      panelSlide = panelElement.animate(
        [{ transform: `translateX(${shift}px)` }, { transform: 'none' }],
        { duration: PANEL_MOTION_MS, easing: PANEL_EASING }
      );
    });
  });

  // The content of a step leaves towards the step left behind and the next
  // one arrives from the other side, along the order of the steps.
  const stepDirection = trackStepDirection();
  const PANE_SHIFT = 24;
  const paneShift = $derived(PANE_SHIFT * stepDirection.current);
  let toolbarContentWidth = $state(0);

  // In a wide panel a dropdown is no wider than a field of the two-column
  // layout (coordinates in geocode-settings): the field column sits inside
  // three padded containers and the two columns are 12px apart.
  const dropdownMaxWidth = $derived(
    globalState.toolbarState === ToolbarState.Full && toolbarContentWidth > 0
      ? `calc((${toolbarContentWidth}px - 6 * var(--kh-pad-panel) - 12px) / 2)`
      : undefined
  );

  function setToolbar(state: ToolbarState) {
    globalActions.setToolbarState(state);
  }

  const hasToolbarPanel = $derived(
    globalState.selectedStep !== ToolbarStep.Styling
  );

  const isCompact = $derived(globalState.toolbarState === ToolbarState.Compact);

  const isVisualizationsStep = $derived(
    globalState.selectedStep === ToolbarStep.Visualizations
  );

  // The Données toggle picks a width, the Visualisations one opens and closes:
  // two behaviours that must not share a picto.
  const willExpandToolbar = $derived(
    isVisualizationsStep
      ? globalState.toolbarState === ToolbarState.Collapsed
      : globalState.toolbarState !== ToolbarState.Full
  );

  const toolbarToggleIcon = $derived.by(() => {
    if (isVisualizationsStep) {
      return willExpandToolbar ? DoubleChevronLeft : DoubleChevronRight;
    }

    return willExpandToolbar ? OpenPanelFilledRightWide : OpenPanelFilledRight;
  });

  const toolbarToggleLabel = $derived.by(() => {
    if (isVisualizationsStep) {
      return willExpandToolbar ? m.toolbar_open() : m.toolbar_close();
    }

    return willExpandToolbar ? m.toolbar_expand() : m.toolbar_compact();
  });

  // A table joined into a geo file has nothing left to geolocate or join: it
  // is visualized from that file.
  const isAttachedTable = $derived(
    Boolean(
      findDatasetAttachment(
        projectStore.currentProject?.data?.sourceFiles,
        datasetsStore.selectedDataset
      )
    )
  );
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

    if (isVisualizationsStep) {
      setToolbar(
        willExpandToolbar ? ToolbarState.Compact : ToolbarState.Collapsed
      );
      return;
    }

    setToolbar(willExpandToolbar ? ToolbarState.Full : ToolbarState.Compact);
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
  bind:this={panelElement}
  id="khartis-main-toolbar"
  inert={isPanelHidden}
  style:--khartis-dropdown-max-width={dropdownMaxWidth}
  class={clsx('app-shadow scrollbar-hidden', shownToolbarState, {
    'collapsed-toolbar': shownToolbarState === ToolbarState.Collapsed,
    'panel-hidden': isPanelHidden
  })}
>
  <header class="flex sticky z-1000 border-b main-toolbar-header">
    {#if hasToolbarPanel}
      <IconButton
        kind="ghost"
        iconDescription={toolbarToggleLabel}
        icon={toolbarToggleIcon}
        on:click={handleToolbarToggle}
      />
      <ToolbarTabs />
    {/if}
  </header>

  <div
    class={clsx(
      'kh-scroll-area',
      globalState.toolbarState === ToolbarState.Collapsed && 'opacity-0'
    )}
  >
    <article
      bind:this={toolbarContent}
      bind:clientWidth={toolbarContentWidth}
      class="toolbar-content"
      use:scrollShadows
    >
      {#key globalState.selectedStep}
        <div
          class="step-pane"
          in:fly={{
            x: paneShift,
            duration: motionDuration(220),
            delay: motionDuration(90),
            easing: cubicOut
          }}
          out:fly={{
            x: -paneShift,
            duration: motionDuration(90),
            easing: cubicIn
          }}
        >
          {#if globalState.selectedStep === ToolbarStep.Data}
            <DataTab />
          {:else if globalState.selectedStep === ToolbarStep.Visualizations}
            <VizualisationTab />
          {/if}
        </div>
      {/key}
    </article>
  </div>

  {#if globalState.selectedStep === ToolbarStep.Data}
    {@const activeStepIndex = dataTabStore.activeStepIndex}
    {@const isGeographicMode = dataTabStore.isGeographicMode}
    {@const canVisualizeNow =
      dataTabStore.isReadyForVisualization || isAttachedTable}

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

          {#if isAttachedTable}
            <ProgressStep
              complete
              label={m.data_tab_attached()}
              description={m.attached_table_step_title()}
            />
          {:else if isGeographicMode}
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
  /* Floats over the right edge of <main>, which keeps its room
     (+layout.svelte). The second shadow paints the panel's colour past its
     right edge, so a narrowing panel shows no gap while it slides. */
  #khartis-main-toolbar {
    position: absolute;
    top: 0;
    right: 0;
    background-color: var(--cds-ui-01);
    box-shadow:
      0 2px 6px 0 rgba(0, 0, 0, 0.1),
      800px 0 0 0 var(--cds-ui-01);
    transition:
      transform 300ms cubic-bezier(0.2, 0, 0.38, 0.9),
      visibility 0s;
  }

  :global(html[theme='g100']) #khartis-main-toolbar {
    box-shadow:
      0 2px 6px 0 rgba(0, 0, 0, 0.5),
      800px 0 0 0 var(--cds-ui-01);
  }

  #khartis-main-toolbar.panel-hidden {
    transform: translateX(100%);
    visibility: hidden;
    transition:
      transform 300ms cubic-bezier(0.2, 0, 0.38, 0.9),
      visibility 0s linear 300ms;
  }

  @media (prefers-reduced-motion: reduce) {
    #khartis-main-toolbar,
    #khartis-main-toolbar.panel-hidden {
      transition: none;
    }
  }

  /* No transform or will-change at rest: either would make the panel the
     containing block of the data tools' fixed windows, which it clips. */
  nav {
    display: flex;
    flex-direction: column;
    border-left: 1px solid var(--cds-ui-01);
    z-index: var(--z-main-toolbar);
    height: calc(100dvh - var(--cds-header-height));
    overflow: hidden;
  }

  .scrollbar-hidden {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }

  .scrollbar-hidden::-webkit-scrollbar {
    display: none;
  }

  nav.full {
    width: var(--kh-side-panel-full-width);
  }

  nav.compact {
    width: var(--kh-panel-w);
  }

  .toolbar-content :global(.bx--list-box),
  .toolbar-content :global(.bx--select-input__wrapper) {
    max-width: var(--khartis-dropdown-max-width, none);
  }

  nav.collapsed {
    width: var(--kh-side-panel-collapsed-width);
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

  /* The leaving and arriving steps share one cell while they swap. */
  .toolbar-content {
    position: relative;
    display: grid;
    align-content: start;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .step-pane {
    grid-area: 1 / 1;
    min-width: 0;
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
