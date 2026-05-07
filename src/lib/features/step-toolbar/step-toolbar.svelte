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
  import { m } from '$lib/paraglide/messages.js';
  import { ColorPalette, DataBase, RulerAlt } from 'carbon-icons-svelte';
  import { Popover } from 'carbon-components-svelte';
  import clsx from 'clsx';
  import { tick, untrack } from 'svelte';
  import type { Snippet } from 'svelte';
  import {
    DOM_IDS,
    CSS_CLASSES,
    TEST_IDS,
    POPOVER_DIMENSIONS
  } from './step-toolbar.constants';
  import ToolPopover from './tool-popover.svelte';
  import StylingTools from './tools-list/styling-tools.svelte';
  import VisualizationTools from './tools-list/visualization-tools.svelte';
  import ToolContainer from './tools/tool-container.svelte';
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

  const listToolsComponents = {
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

  const stepLabels = {
    [ToolbarStep.Data]: m.step_data(),
    [ToolbarStep.Visualizations]: m.step_visualizations(),
    [ToolbarStep.Styling]: m.step_styling()
  };

  let selectedList = $derived<Snippet | undefined>(
    globalState.selectedStep
      ? listToolsComponents[
          globalState.selectedStep as ToolbarStep.Visualizations &
            ToolbarStep.Styling
        ]
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
      class={CSS_CLASSES.STEP_CONTAINER}
      role="group"
      aria-label={m.toolbar_step_selection_aria()}
    >
      <button
        data-testid={TEST_IDS.STEP_DATA}
        class={clsx(CSS_CLASSES.NAV_ITEM, {
          [CSS_CLASSES.SELECTED]: isStepSelected(ToolbarStep.Data)
        })}
        onclick={() => selectStep(ToolbarStep.Data)}
        aria-pressed={isStepSelected(ToolbarStep.Data)}
        aria-label={m.step_data_aria()}
      >
        <DataBase size={32} />
        <span>{stepLabels[ToolbarStep.Data]}</span>
      </button>

      <button
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
        data-testid={TEST_IDS.STEP_STYLING}
        class={clsx(CSS_CLASSES.NAV_ITEM, {
          [CSS_CLASSES.SELECTED]: isStepSelected(ToolbarStep.Styling)
        })}
        onclick={() => selectStep(ToolbarStep.Styling)}
        aria-pressed={isStepSelected(ToolbarStep.Styling)}
        aria-label={m.step_styling_aria()}
      >
        <RulerAlt size={32} />
        <span>{stepLabels[ToolbarStep.Styling]}</span>
      </button>
    </div>

    {@render selectedList?.()}
  </div>

  <ToolPopover
    light
    open={!!globalState.selectedTool}
    align="right-top"
    viewMode={popoverViewMode}
    listWidth={POPOVER_DIMENSIONS.DEFAULT_LIST_WIDTH}
    gridWidth={POPOVER_DIMENSIONS.PROJECTION_GRID_WIDTH}
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
    font-size: 14px;
  }

  nav {
    position: relative;
    background: var(--cds-background);
  }

  button {
    background: none;
    color: var(--cds-text-01);
  }

  .nav-item {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 0.3rem;
    width: 100%;
    padding: var(--cds-spacing-03) var(--cds-spacing-04);
    outline: none;
    border: none;
    cursor: pointer;
  }

  :global(#khartis-step-toolbar .nav-item svg) {
    fill: var(--cds-text-01);
  }

  .nav-item.selected {
    background-color: var(--cds-border-subtle-01);
    border-left: 3px solid var(--cds-border-subtle-01);
  }

  .nav-item span {
    font-size: 12px;
  }

  :global(#khartis-step-toolbar .tools-grid) {
    padding: var(--cds-spacing-03) var(--cds-spacing-02);
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
