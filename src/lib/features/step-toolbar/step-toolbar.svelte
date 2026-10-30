<script lang="ts">
  import {
    globalActions,
    globalState
  } from '$lib/features/commons/stores/global.svelte';
  import {
    ToolbarStep,
    VisualizationTools as VisualizationToolId
  } from '$lib/features/commons/types/global';
  import { ColorBlindnessType } from '$lib/features/commons/constants/ui.constants';
  import { m } from '$lib/paraglide/messages';
  import { ColorPalette, DataTable, ToolsAlt } from 'carbon-icons-svelte';
  import { Popover } from 'carbon-components-svelte';
  import clsx from 'clsx';
  import { tick, untrack } from 'svelte';
  import type { Component } from 'svelte';
  import { cubicIn, cubicOut } from 'svelte/easing';
  import { fly, slide } from 'svelte/transition';
  import {
    motionDuration,
    trackStepDirection
  } from '$lib/features/commons/utils/step-transition.svelte';
  import {
    DOM_IDS,
    CSS_CLASSES,
    TEST_IDS,
    POPOVER_DIMENSIONS,
    FILL_HEIGHT_TOOLS
  } from './step-toolbar.constants';
  import ToolPopover from './tool-popover.svelte';
  import StylingTools from './tools-list/styling-tools.svelte';
  import VisualizationTools from './tools-list/visualization-tools.svelte';
  import ToolContainer from './tools/tool-container.svelte';
  import ToolsListContainer from './tools-list/tools-list-container.svelte';
  import ColorBlindnessNotification from './tools/color-blindness/color-blindness-notification.svelte';
  import {
    colorBlindnessActions,
    getColorBlindnessState,
    isColorBlindnessActive
  } from './tools/color-blindness/color-blindness.store.svelte';
  import { annotationsActions } from './tools/annotations/annotations.store.svelte';
  import { closeSelectedToolPanel } from './tools-list/tool-list.utils.svelte';

  const MAIN_TOOLBAR_CONTENT_SELECTOR =
    '#khartis-main-toolbar .toolbar-content';

  type ListToolsStep = ToolbarStep.Visualizations | ToolbarStep.Styling;

  const listToolsComponents: Record<ListToolsStep, Component> = {
    [ToolbarStep.Visualizations]: VisualizationTools,
    [ToolbarStep.Styling]: StylingTools
  };

  const colorBlindnessState = $derived(getColorBlindnessState());
  let notificationDismissed = $state(false);

  const showColorBlindnessNotification = $derived(
    isColorBlindnessActive(colorBlindnessState) &&
      globalState.selectedStep !== ToolbarStep.Styling &&
      !globalState.selectedTool &&
      !notificationDismissed
  );

  $effect(() => {
    if (!isColorBlindnessActive(colorBlindnessState)) {
      notificationDismissed = false;
    }
  });

  $effect(() => {
    if (globalState.selectedStep === ToolbarStep.Styling) {
      untrack(() =>
        annotationsActions.initPageElements({
          withPlaceholders: true,
          visible: true
        })
      );
    }
  });

  const stepLabels = $derived.by(() => ({
    [ToolbarStep.Data]: m.step_data(),
    [ToolbarStep.Visualizations]: m.step_visualizations(),
    [ToolbarStep.Styling]: m.step_styling()
  }));

  let SelectedList = $derived<Component | undefined>(
    globalState.selectedStep === ToolbarStep.Visualizations ||
      globalState.selectedStep === ToolbarStep.Styling
      ? listToolsComponents[globalState.selectedStep]
      : undefined
  );

  const popoverViewMode = $derived(
    globalState.selectedTool === VisualizationToolId.Projection
      ? (globalState.projectionViewMode ?? 'list')
      : 'list'
  );

  const selectStep = async (step: ToolbarStep): Promise<void> => {
    closeSelectedToolPanel();
    globalActions.setNavigationState(step);
    await tick();
    const content = document.querySelector(MAIN_TOOLBAR_CONTENT_SELECTOR);
    if (content) {
      content.scrollTop = 0;
    }
  };

  const isStepSelected = (step: ToolbarStep): boolean => {
    return globalState.selectedStep === step;
  };

  // The selection is one block that slides from step to step, rather than
  // a background that jumps from one button to the next.
  let stepContainer = $state<HTMLDivElement | null>(null);
  const stepButtons = $state<Partial<Record<ToolbarStep, HTMLButtonElement>>>(
    {}
  );
  let indicator = $state<{ top: number; height: number } | null>(null);

  function measureIndicator(): void {
    const button = stepButtons[globalState.selectedStep];
    indicator = button
      ? { top: button.offsetTop, height: button.offsetHeight }
      : null;
  }

  $effect(() => {
    void globalState.selectedStep;
    measureIndicator();
  });

  $effect(() => {
    if (!stepContainer) return;
    const observer = new ResizeObserver(() => measureIndicator());
    observer.observe(stepContainer);
    return () => observer.disconnect();
  });

  // Tools leave towards the previous step and arrive from the next one.
  const stepDirection = trackStepDirection();
  const TOOLS_SHIFT = 12;
  const toolsShift = $derived(TOOLS_SHIFT * stepDirection.current);
</script>

<nav
  id={DOM_IDS.STEP_TOOLBAR}
  class="app-shadow"
  class:tool-open={!!globalState.selectedTool}
  data-outline
  aria-label={m.toolbar_nav_aria()}
>
  <div class={CSS_CLASSES.SCROLL_VIEWPORT}>
    <header class={CSS_CLASSES.STEP_HEADER}>
      <span class={CSS_CLASSES.STEP_TITLE}>{m.step_toolbar_steps()}</span>
    </header>

    <div
      bind:this={stepContainer}
      class={CSS_CLASSES.STEP_CONTAINER}
      role="group"
      aria-label={m.toolbar_step_selection_aria()}
    >
      {#if indicator}
        <span
          class="step-indicator"
          style:height="{indicator.height}px"
          style:transform="translateY({indicator.top}px)"
          aria-hidden="true"
        ></span>
      {/if}

      <button
        bind:this={stepButtons[ToolbarStep.Data]}
        type="button"
        data-testid={TEST_IDS.STEP_DATA}
        class={clsx(CSS_CLASSES.NAV_ITEM, {
          [CSS_CLASSES.SELECTED]: isStepSelected(ToolbarStep.Data)
        })}
        onclick={() => selectStep(ToolbarStep.Data)}
        aria-pressed={isStepSelected(ToolbarStep.Data)}
        aria-label={m.step_data_aria()}
      >
        <DataTable size={32} />
        <span>{stepLabels[ToolbarStep.Data]}</span>
      </button>

      <button
        bind:this={stepButtons[ToolbarStep.Visualizations]}
        type="button"
        data-testid={TEST_IDS.STEP_VISUALIZATIONS}
        class={clsx(CSS_CLASSES.NAV_ITEM, {
          [CSS_CLASSES.SELECTED]: isStepSelected(ToolbarStep.Visualizations)
        })}
        onclick={() => selectStep(ToolbarStep.Visualizations)}
        aria-pressed={isStepSelected(ToolbarStep.Visualizations)}
        aria-label={m.step_visualizations_aria()}
      >
        <ColorPalette size={32} />
        <span>{stepLabels[ToolbarStep.Visualizations]}</span>
      </button>

      <button
        bind:this={stepButtons[ToolbarStep.Styling]}
        type="button"
        data-testid={TEST_IDS.STEP_STYLING}
        class={clsx(CSS_CLASSES.NAV_ITEM, {
          [CSS_CLASSES.SELECTED]: isStepSelected(ToolbarStep.Styling)
        })}
        onclick={() => selectStep(ToolbarStep.Styling)}
        aria-pressed={isStepSelected(ToolbarStep.Styling)}
        aria-label={m.step_styling_aria()}
      >
        <ToolsAlt size={32} />
        <span>{stepLabels[ToolbarStep.Styling]}</span>
      </button>
    </div>

    {#if SelectedList}
      <div
        class="tools-reveal"
        transition:slide={{ duration: motionDuration(240), easing: cubicOut }}
      >
        <ToolsListContainer>
          <div class="tools-stack" style:--_tools-shift="{toolsShift}px">
            {#key globalState.selectedStep}
              <div
                class="tools-set"
                out:fly={{
                  x: -toolsShift,
                  duration: motionDuration(120),
                  easing: cubicIn
                }}
              >
                <SelectedList />
              </div>
            {/key}
          </div>
        </ToolsListContainer>
      </div>
    {/if}
  </div>

  <ToolPopover
    light
    open={!!globalState.selectedTool}
    align="right-top"
    viewMode={popoverViewMode}
    listWidth={POPOVER_DIMENSIONS.DEFAULT_LIST_WIDTH}
    gridWidth={POPOVER_DIMENSIONS.PROJECTION_GRID_WIDTH}
    sizing={FILL_HEIGHT_TOOLS.has(globalState.selectedTool ?? '')
      ? 'fill'
      : 'fit'}
  >
    {#snippet content()}
      <ToolContainer />
    {/snippet}
  </ToolPopover>

  <div
    id={DOM_IDS.COLORBLINDNESS_NOTIFICATION}
    style="--cb-notif-width:{POPOVER_DIMENSIONS.DEFAULT_LIST_WIDTH}px;"
  >
    <Popover open={showColorBlindnessNotification} align="right-top" light>
      <ColorBlindnessNotification
        ondeactivate={() =>
          colorBlindnessActions.setSimulationType(ColorBlindnessType.NONE)}
        onclose={() => (notificationDismissed = true)}
      />
    </Popover>
  </div>
</nav>

<style>
  :global(#khartis-step-toolbar) {
    position: absolute;
    top: 50%;
    left: 0;
    transform: translateY(-50%);
    max-height: calc(100% - var(--cds-spacing-05) * 2);
    z-index: var(--z-toolbar);
    scrollbar-width: none;
    background: var(--cds-background);
    box-shadow:
      0 4px 16px rgba(0, 0, 0, 0.1),
      0 1px 4px rgba(0, 0, 0, 0.06);
  }

  :global(#khartis-step-toolbar.tool-open) {
    z-index: calc(var(--z-toolbar) + 1);
  }

  .scroll-viewport {
    width: 100%;
    max-height: inherit;
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: none;
  }

  .scroll-viewport::-webkit-scrollbar {
    width: 0;
    height: 0;
    display: none;
  }

  header span {
    color: var(--cds-text-01);
    font-weight: bold;
    font-size: var(--kh-font-group);
  }

  nav {
    position: relative;
    background: var(--cds-background);
  }

  button {
    background: none;
    color: var(--cds-text-01);
  }

  .step-container {
    --_step-motion: 240ms cubic-bezier(0.2, 0, 0.38, 0.9);
    position: relative;
  }

  .step-indicator {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    background-color: var(--cds-border-subtle-01);
    pointer-events: none;
    transition:
      transform var(--_step-motion),
      height var(--_step-motion);
  }

  .nav-item {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 0.3rem;
    width: 100%;
    padding: var(--cds-spacing-03) var(--cds-spacing-04);
    border: none;
    cursor: pointer;
    transition: background-color 110ms ease;
  }

  .nav-item:hover:not(.selected) {
    background-color: var(--cds-layer-hover-01);
  }

  .nav-item:focus-visible {
    outline: 2px solid var(--cds-focus);
    outline-offset: -2px;
  }

  :global(#khartis-step-toolbar .nav-item svg) {
    width: var(--kh-icon-step);
    height: var(--kh-icon-step);
    fill: var(--cds-text-01);
  }

  .nav-item span {
    font-size: var(--kh-font-label);
  }

  :global(#khartis-step-toolbar .tools-grid) {
    padding: var(--cds-spacing-03) var(--cds-spacing-02);
  }

  /* The outgoing and incoming tool sets share one cell while they swap, so
     the bar does not grow by a second list. */
  .tools-stack {
    display: grid;
    overflow: hidden;
  }

  /* A flex column, so the Carbon grid's auto margins centre the tools. */
  .tools-set {
    display: flex;
    flex-direction: column;
    grid-area: 1 / 1;
    min-width: 0;
  }

  /* Incoming tools arrive one after the other, once the previous set has
     started to leave. */
  .tools-set :global(.tools-grid > .bx--row) {
    animation: tool-arrive 220ms cubic-bezier(0, 0, 0.38, 0.9) both;
    animation-delay: calc(80ms + var(--_tool-index, 0) * 35ms);
  }

  .tools-set :global(.tools-grid > .bx--row:nth-child(2)) {
    --_tool-index: 1;
  }

  .tools-set :global(.tools-grid > .bx--row:nth-child(3)) {
    --_tool-index: 2;
  }

  .tools-set :global(.tools-grid > .bx--row:nth-child(4)) {
    --_tool-index: 3;
  }

  .tools-set :global(.tools-grid > .bx--row:nth-child(n + 5)) {
    --_tool-index: 4;
  }

  @keyframes tool-arrive {
    from {
      opacity: 0;
      transform: translateX(var(--_tools-shift, 12px));
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .step-indicator,
    .nav-item {
      transition: none;
    }

    .tools-set :global(.tools-grid > .bx--row) {
      animation: none;
    }
  }

  :global(#khartis-tool-popover .bx--popover) {
    z-index: var(--z-popover);
  }

  :global(html[theme='g100'] #khartis-tool-popover) {
    --khartis-expandable-section-background: var(--cds-background);
    --khartis-expandable-section-hover-background: var(
      --khartis-control-surface-background
    );
  }

  :global(#khartis-colorblindness-notification .bx--popover--right-top) {
    top: 0 !important;
  }

  :global(#khartis-colorblindness-notification .bx--popover-contents) {
    width: var(--cb-notif-width) !important;
    max-width: var(--cb-notif-width) !important;
    padding: 0;
  }

  :global(#khartis-colorblindness-notification .bx--inline-notification) {
    max-width: 100%;
    margin: 0;
  }

  .step-header {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding-top: var(--cds-spacing-03);
  }

  .step-title {
    padding-bottom: var(--cds-spacing-02);
    padding-top: var(--cds-spacing-02);
  }

  .step-container {
    display: flex;
    flex-direction: column;
    padding-bottom: var(--cds-spacing-03);
  }
</style>
