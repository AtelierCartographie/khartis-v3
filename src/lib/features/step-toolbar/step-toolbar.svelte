<script lang="ts">
  import {
    globalActions,
    globalState
  } from '$lib/features/commons/store/global.svelte';
  import { ToolbarStep } from '$lib/features/commons/types/global';
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
    getColorBlindnessState
  } from './tools/color-blindness/color-blindness.store.svelte';
  import { annotationsActions } from './tools/annotations/annotations.store.svelte';

  const MAIN_TOOLBAR_CONTENT_SELECTOR =
    '#khartis-main-toolbar .toolbar-content';

  const listToolsComponents = {
    [ToolbarStep.Visualizations]: VisualizationTools,
    [ToolbarStep.Styling]: StylingTools
  };

  const colorBlindnessState = $derived(getColorBlindnessState());
  let notificationDismissed = $state(false);

  const showColorBlindnessNotification = $derived(
    colorBlindnessState.enabled &&
      globalState.selectedStep !== ToolbarStep.Styling &&
      !globalState.selectedTool &&
      !notificationDismissed
  );

  $effect(() => {
    if (!colorBlindnessState.enabled) {
      notificationDismissed = false;
    }
  });

  $effect(() => {
    if (globalState.selectedStep === ToolbarStep.Styling) {
      // untrack: initPageElements reads+writes s.items; tracking it would cause
      // a write-triggers-read loop. Only selectedStep should drive this effect.
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

  const selectStep = async (step: ToolbarStep): Promise<void> => {
    globalActions.setNavigationState(step);
    globalState.selectedTool = undefined;
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
  data-outline
  aria-label={m.toolbar_nav_aria()}
>
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

  <ToolPopover
    light
    open={!!globalState.selectedTool}
    align="right-top"
    viewMode={globalState.projectionViewMode ?? 'list'}
    listWidth={POPOVER_DIMENSIONS.DEFAULT_LIST_WIDTH}
    gridWidth={POPOVER_DIMENSIONS.DEFAULT_GRID_WIDTH}
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
        ondeactivate={() => colorBlindnessActions.toggleEnabled()}
        onclose={() => (notificationDismissed = true)}
      />
    </Popover>
  </div>
</nav>

<style>
  :global(#khartis-step-toolbar) {
    position: relative;
    z-index: var(--z-toolbar);
    align-self: center;
  }

  header span {
    color: var(--cds-text-01);
    font-weight: bold;
    font-size: 14px;
  }

  nav {
    position: relative;
    border: 1px solid var(--cds-ui-01);
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
    background-color: #cac5c4;
    border-left: 3px solid #cac5c4;
  }

  .nav-item span {
    font-size: 12px;
  }

  :global(#khartis-step-toolbar .tools-grid) {
    padding: var(--cds-spacing-03) var(--cds-spacing-02);
  }

  :global(#khartis-step-toolbar .bx--popover--right-top) {
    top: 0 !important;
  }

  :global(#khartis-tool-popover .bx--popover) {
    z-index: var(--z-toolbar);
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
