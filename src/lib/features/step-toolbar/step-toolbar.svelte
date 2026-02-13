<script lang="ts">
  import {
    globalActions,
    globalState
  } from '$lib/features/commons/store/global.svelte';
  import { ToolbarStep } from '$lib/features/commons/types/global';
  import { m } from '$lib/paraglide/messages.js';
  import { ColorPalette, DataBase, RulerAlt } from 'carbon-icons-svelte';
  import clsx from 'clsx';
  import type { Snippet } from 'svelte';
  import ToolPopover from './tool-popover.svelte';
  import StylingTools from './tools-list/styling-tools.svelte';
  import VisualizationTools from './tools-list/visualization-tools.svelte';
  import ToolContainer from './tools/tool-container.svelte';

  const listToolsComponents = {
    [ToolbarStep.Visualizations]: VisualizationTools,
    [ToolbarStep.Styling]: StylingTools
  };

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

  const selectStep = (step: ToolbarStep): void => {
    globalActions.setNavigationState(step);
    globalState.selectedTool = undefined;
  };

  const isStepSelected = (step: ToolbarStep): boolean => {
    return globalState.selectedStep === step;
  };
</script>

<nav
  id="khartis-step-toolbar"
  class="app-shadow"
  data-outline
  aria-label={m.toolbar_nav_aria()}
>
  <header class="step-header">
    <span class="step-title">{m.step_toolbar_steps()}</span>
  </header>

  <div
    class="step-container"
    role="group"
    aria-label={m.toolbar_step_selection_aria()}
  >
    <button
      data-testid="step-data"
      class={clsx('nav-item', {
        selected: isStepSelected(ToolbarStep.Data)
      })}
      onclick={() => selectStep(ToolbarStep.Data)}
      aria-pressed={isStepSelected(ToolbarStep.Data)}
      aria-label={m.step_data_aria()}
    >
      <DataBase size={32} />
      <span>{stepLabels[ToolbarStep.Data]}</span>
    </button>

    <button
      data-testid="step-visualizations"
      class={clsx('nav-item', {
        selected: isStepSelected(ToolbarStep.Visualizations)
      })}
      onclick={() => selectStep(ToolbarStep.Visualizations)}
      aria-pressed={isStepSelected(ToolbarStep.Visualizations)}
      aria-label={m.step_visualizations_aria()}
    >
      <ColorPalette size={32} />
      <span>{stepLabels[ToolbarStep.Visualizations]}</span>
    </button>

    <button
      data-testid="step-styling"
      class={clsx('nav-item', {
        selected: isStepSelected(ToolbarStep.Styling)
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
    listWidth={420}
    gridWidth="790px"
  >
    {#snippet content()}
      <ToolContainer />
    {/snippet}
  </ToolPopover>
</nav>

<style>
  #khartis-step-toolbar {
    position: relative;
    z-index: 1000;
  }

  header span {
    color: var(--cds-ui-04);
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

  #khartis-step-toolbar :global(.nav-item svg) {
    fill: var(--cds-text-01);
  }

  .nav-item.selected {
    background-color: var(--cds-ui-03);
  }

  .nav-item span {
    font-size: 12px;
  }

  #khartis-step-toolbar :global(.tools-grid) {
    padding: var(--cds-spacing-03) var(--cds-spacing-02);
  }

  #khartis-step-toolbar :global(.bx--popover--right-top) {
    top: -13.5vh !important;
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
