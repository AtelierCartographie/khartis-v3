<script lang="ts">
  import PanelHeader from '$lib/features/commons/components/panel-header.svelte';
  import { EVENT } from '$lib/features/commons/constants/dom.constants';
  import {
    createExclusiveContextualSurfaceId,
    engageExclusiveContextualSurface
  } from '$lib/features/commons/utils/contextual-surface-coordinator';
  import { globalState } from '$lib/features/commons/stores/global.svelte';
  import { scrollShadows } from '$lib/features/commons/utils/scroll-shadows';
  import {
    MAIN_TOOLBAR_ID,
    readToolbarPanelRight,
    resolveToolbarPanelWidth
  } from '$lib/features/commons/utils/toolbar-width.utils';
  import * as m from '$lib/paraglide/messages';
  import { onMount, type Snippet } from 'svelte';
  import { dataToolsStore } from '../stores/data-tools.store.svelte';

  interface Props {
    title: string;
    children: Snippet;
  }

  let { title, children }: Props = $props();

  const contextualSurfaceId =
    createExclusiveContextualSurfaceId('data-tool-panel');

  function readPanelRight(): string {
    return readToolbarPanelRight(() =>
      resolveToolbarPanelWidth(globalState.toolbarState)
    );
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
  <PanelHeader
    title={title}
    closeLabel={m.data_tool_close()}
    onclose={() => dataToolsStore.closeTool()}
  />
  <div class="kh-scroll-area">
    <div class="panel-content" use:scrollShadows>
      {@render children()}
    </div>
  </div>
</aside>

<style>
  .data-tool-panel {
    position: fixed;
    right: 0;
    top: var(--kh-floating-window-center);
    transform: translateY(-50%);
    width: 280px;
    max-height: var(--kh-floating-window-max-height);
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

  .panel-content {
    overflow-y: auto;
    padding: var(--cds-spacing-05);
  }

  /* Carbon forces min-width: 18rem on inline notifications, wider than this
     fixed 280px panel, so they overflow the right edge. Constrain every tool
     panel's notifications to the available content width. */
  .panel-content :global(.bx--inline-notification) {
    min-width: 0;
    max-width: 100%;
    margin-top: 0;
    margin-bottom: 0;
  }
</style>
