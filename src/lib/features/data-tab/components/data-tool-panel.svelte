<script lang="ts">
  import IconButton from '$lib/features/commons/components/carbon/icon-button.svelte';
  import { EVENT } from '$lib/features/commons/constants/dom.constants';
  import {
    createExclusiveContextualSurfaceId,
    engageExclusiveContextualSurface
  } from '$lib/features/commons/utils/contextual-surface-coordinator';
  import { globalState } from '$lib/features/commons/stores/global.svelte';
  import { ToolbarState } from '$lib/features/commons/types/global';
  import * as m from '$lib/paraglide/messages';
  import { Close } from 'carbon-icons-svelte';
  import { onMount, type Snippet } from 'svelte';
  import { dataToolsStore } from '../data-tools.store.svelte';

  interface Props {
    title: string;
    children: Snippet;
  }

  let { title, children }: Props = $props();

  const MAIN_TOOLBAR_ID = 'khartis-main-toolbar';
  const contextualSurfaceId =
    createExclusiveContextualSurfaceId('data-tool-panel');

  function getFallbackPanelRight(toolbarState: ToolbarState): string {
    switch (toolbarState) {
      case ToolbarState.Collapsed:
        return '50px';
      case ToolbarState.Compact:
        return '434px';
      default:
        return 'clamp(400px, 50vw, 800px)';
    }
  }

  function readPanelRight(): string {
    if (typeof window === 'undefined') {
      return getFallbackPanelRight(globalState.toolbarState);
    }

    const toolbar = document.getElementById(MAIN_TOOLBAR_ID);
    if (!toolbar) {
      return getFallbackPanelRight(globalState.toolbarState);
    }

    const toolbarRect = toolbar.getBoundingClientRect();
    const rightOffset = Math.max(0, window.innerWidth - toolbarRect.left);

    return `${Math.round(rightOffset)}px`;
  }

  let panelRight = $state(readPanelRight());

  function updatePanelPosition(): void {
    panelRight = readPanelRight();
  }

  $effect(() => {
    void globalState.toolbarState;
    updatePanelPosition();
  });

  $effect(() =>
    engageExclusiveContextualSurface(contextualSurfaceId, () => {
      dataToolsStore.closeTool();
    })
  );

  onMount(() => {
    updatePanelPosition();

    const toolbar = document.getElementById(MAIN_TOOLBAR_ID);
    const resizeObserver =
      toolbar && typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            updatePanelPosition();
          })
        : null;

    if (toolbar && resizeObserver) {
      resizeObserver.observe(toolbar);
    }

    window.addEventListener(EVENT.RESIZE, updatePanelPosition);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener(EVENT.RESIZE, updatePanelPosition);
    };
  });
</script>

<aside class="data-tool-panel" style:right={panelRight}>
  <header class="panel-header">
    <h3>{title}</h3>
    <IconButton
      kind="ghost"
      size="small"
      icon={Close}
      iconDescription={m.data_tool_close()}
      on:click={() => dataToolsStore.closeTool()}
    />
  </header>
  <div class="panel-content">
    {@render children()}
  </div>
</aside>

<style>
  .data-tool-panel {
    position: fixed;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 280px;
    background: var(--cds-ui-02);
    border: 1px solid var(--cds-border-subtle);
    z-index: var(--z-dropdown);
    display: flex;
    flex-direction: column;
    transition: right 0.2s ease-out;
    box-shadow:
      0 4px 16px rgba(0, 0, 0, 0.12),
      0 0 1px rgba(0, 0, 0, 0.15);
  }

  @media (max-width: 1023px) {
    .data-tool-panel {
      right: 0 !important;
      left: 0;
      top: auto;
      bottom: calc(60px + env(safe-area-inset-bottom, 0px));
      transform: none;
      width: 100vw;
      max-height: calc(
        100dvh - var(--cds-header-height, 48px) - 60px -
          env(safe-area-inset-bottom, 0px) - var(--cds-spacing-05)
      );
      z-index: calc(var(--z-mobile-toolbar) + 2);
      border-radius: 8px 8px 0 0;
      box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.15);
    }
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--cds-spacing-04);
    border-bottom: 1px solid var(--cds-border-subtle);
  }

  .panel-header h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--cds-text-01);
  }

  .panel-content {
    padding: var(--cds-spacing-04);
  }
</style>
