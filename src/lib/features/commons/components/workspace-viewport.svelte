<script lang="ts">
  import { onMount, tick, type Snippet } from 'svelte';
  import { EVENT } from '$lib/features/commons/constants/dom.constants';
  import {
    globalActions,
    globalState
  } from '$lib/features/commons/stores/global.svelte';
  import { mapInstanceStore } from '$lib/features/commons/stores/map-instance.store.svelte';
  import { zoomModeStore } from '$lib/features/commons/stores/zoom-mode.store.svelte';
  import {
    DEFAULT_WORKSPACE_VIEWPORT_BOUNDS,
    WORKSPACE_FIT_EVENT,
    clampWorkspacePanOffset,
    isWorkspacePanTarget,
    resolveWorkspaceViewportBounds,
    type WorkspaceViewportBounds
  } from '$lib/features/commons/utils/workspace-viewport.utils';

  interface Props {
    children: Snippet;
    overlays?: Snippet;
  }

  let { children, overlays }: Props = $props();

  const LEFT_BUTTON = 0;
  const MIDDLE_BUTTON = 1;
  const SPACE_PAN_INTERACTIVE_SELECTOR = [
    'button',
    'a',
    '[role="button"]',
    '[role="menuitem"]',
    '[role="tab"]',
    '[tabindex]'
  ].join(', ');

  let workspaceViewportElement = $state<HTMLElement | null>(null);
  let stepToolbarWidth = $state(0);
  let stepToolbarResizeObserver = $state<ResizeObserver | null>(null);
  let observedPageElement: HTMLElement | null = null;

  const pagePan = $derived(globalState.zoom.pagePanOffset);
  const workspaceCenteringOffsetX = $derived(stepToolbarWidth / 2);
  const workspaceCameraStyle = $derived(
    `transform: translate(${pagePan.x + workspaceCenteringOffsetX}px, ${pagePan.y}px);`
  );
  let workspaceViewportBounds = $state<WorkspaceViewportBounds>(
    DEFAULT_WORKSPACE_VIEWPORT_BOUNDS
  );
  let isWorkspacePanDraggable = $state(false);
  let hasWorkspaceOverflow = $state(false);
  let isSpacePanArmed = $state(false);
  let workspaceDragState = $state<{ lastX: number; lastY: number } | null>(
    null
  );
  let pageResizeObserver = $state<ResizeObserver | null>(null);
  let workspaceResizeObserver = $state<ResizeObserver | null>(null);
  let pageMutationObserver = $state<MutationObserver | null>(null);

  const isPageMode = $derived(zoomModeStore.isPageMode);

  $effect(() => {
    const element = workspaceViewportElement;
    mapInstanceStore.setWorkspaceViewportElement(element);

    return () => {
      if (mapInstanceStore.workspaceViewportElement === element) {
        mapInstanceStore.setWorkspaceViewportElement(null);
      }
    };
  });

  onMount(() => {
    pageResizeObserver = new ResizeObserver(() => {
      updateWorkspaceViewportState();
    });
    workspaceResizeObserver = new ResizeObserver(() => {
      updateWorkspaceViewportState();
    });
    pageMutationObserver = new MutationObserver(() => {
      refreshObservedPageElement(pageResizeObserver);
    });
    stepToolbarResizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      stepToolbarWidth = Math.round(entry.contentRect.width);
    });

    window.addEventListener(EVENT.KEYDOWN, handleGlobalKeyDown);
    window.addEventListener(EVENT.KEYUP, handleGlobalKeyUp);
    window.addEventListener(WORKSPACE_FIT_EVENT, handleWorkspaceFitEvent);

    return () => {
      window.removeEventListener(EVENT.KEYDOWN, handleGlobalKeyDown);
      window.removeEventListener(EVENT.KEYUP, handleGlobalKeyUp);
      window.removeEventListener(WORKSPACE_FIT_EVENT, handleWorkspaceFitEvent);
      window.removeEventListener(EVENT.POINTERMOVE, handleWorkspacePanMove);
      window.removeEventListener(EVENT.POINTERUP, handleWorkspacePanUp);
      workspaceResizeObserver?.disconnect();
      pageResizeObserver?.disconnect();
      pageMutationObserver?.disconnect();
      stepToolbarResizeObserver?.disconnect();
      workspaceResizeObserver = null;
      pageResizeObserver = null;
      pageMutationObserver = null;
      stepToolbarResizeObserver = null;
    };
  });

  $effect(() => {
    const shouldObserve = !globalState.isMobileView;
    if (!shouldObserve || !stepToolbarResizeObserver) {
      stepToolbarWidth = 0;
      return;
    }
    const observer = stepToolbarResizeObserver;
    let cancelled = false;
    void tick().then(() => {
      if (cancelled) return;
      const el = document.getElementById('khartis-step-toolbar');
      if (!el) return;
      observer.observe(el);
      stepToolbarWidth = Math.round(el.getBoundingClientRect().width);
    });
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  });

  $effect(() => {
    void globalState.zoom.pageZoomScale;
    void zoomModeStore.mode;

    const frameId = requestAnimationFrame(() => {
      updateWorkspaceViewportState();
    });

    return () => {
      cancelAnimationFrame(frameId);
    };
  });

  $effect(() => {
    const workspaceViewport = workspaceViewportElement;

    if (
      !workspaceViewport ||
      !pageResizeObserver ||
      !workspaceResizeObserver ||
      !pageMutationObserver
    ) {
      return;
    }

    workspaceResizeObserver.disconnect();
    pageMutationObserver.disconnect();
    workspaceResizeObserver.observe(workspaceViewport);
    pageMutationObserver.observe(workspaceViewport, {
      childList: true,
      subtree: true
    });
    refreshObservedPageElement(pageResizeObserver);

    return () => {
      workspaceResizeObserver?.disconnect();
      pageMutationObserver?.disconnect();
      if (observedPageElement && pageResizeObserver) {
        pageResizeObserver.unobserve(observedPageElement);
      }
      observedPageElement = null;
    };
  });

  function getPageContainerElement(): HTMLElement | null {
    const pageElement =
      workspaceViewportElement?.querySelector('.page-container');
    return pageElement instanceof HTMLElement ? pageElement : null;
  }

  function updateWorkspaceViewportState(): void {
    const pageElement = getPageContainerElement();
    const viewportElement = workspaceViewportElement;

    if (!pageElement || !viewportElement) {
      workspaceViewportBounds = DEFAULT_WORKSPACE_VIEWPORT_BOUNDS;
      isWorkspacePanDraggable = false;
      return;
    }

    const nextBounds = resolveWorkspaceViewportBounds({
      viewportWidth: viewportElement.clientWidth,
      viewportHeight: viewportElement.clientHeight,
      pageWidth: pageElement.offsetWidth,
      pageHeight: pageElement.offsetHeight,
      pageZoomScale: 1
    });

    workspaceViewportBounds = nextBounds;
    isWorkspacePanDraggable = isPageMode;
    hasWorkspaceOverflow = nextBounds.hasOverflow;

    const clampedOffset = clampWorkspacePanOffset(pagePan, nextBounds);
    if (clampedOffset.x !== pagePan.x || clampedOffset.y !== pagePan.y) {
      globalActions.setPagePanOffset(clampedOffset);
    }
  }

  function fitPageToWorkspace(): void {
    globalActions.setPageZoom(100);
    globalActions.resetPagePan();
  }

  function refreshObservedPageElement(
    pageResizeObserver: ResizeObserver | null = null
  ): void {
    const nextPageElement = getPageContainerElement();

    if (nextPageElement === observedPageElement) {
      updateWorkspaceViewportState();
      return;
    }

    if (observedPageElement && pageResizeObserver) {
      pageResizeObserver.unobserve(observedPageElement);
    }

    observedPageElement = nextPageElement;

    if (observedPageElement && pageResizeObserver) {
      pageResizeObserver.observe(observedPageElement);
    }

    updateWorkspaceViewportState();
  }

  function shouldStartWorkspacePan(event: PointerEvent): boolean {
    const isTouchPointer = event.pointerType === 'touch';
    const isMiddleClick = event.button === MIDDLE_BUTTON;
    const isLeftClick = event.button === LEFT_BUTTON;

    if (!isWorkspacePanTarget(event.target)) {
      return false;
    }

    if (isPageMode && isWorkspacePanDraggable) {
      if (!isTouchPointer && !isLeftClick && !isMiddleClick) {
        return false;
      }
      return true;
    }

    if (!isPageMode) {
      if (isMiddleClick) return true;
      if (isLeftClick && isSpacePanArmed) return true;
    }

    return false;
  }

  function handleMainContentPointerDown(event: PointerEvent): void {
    if (!shouldStartWorkspacePan(event)) {
      return;
    }

    event.preventDefault();
    workspaceDragState = { lastX: event.clientX, lastY: event.clientY };
    window.addEventListener(EVENT.POINTERMOVE, handleWorkspacePanMove);
    window.addEventListener(EVENT.POINTERUP, handleWorkspacePanUp);
  }

  function handleWorkspacePanMove(event: PointerEvent): void {
    if (!workspaceDragState) return;

    const dx = event.clientX - workspaceDragState.lastX;
    const dy = event.clientY - workspaceDragState.lastY;

    workspaceDragState = { lastX: event.clientX, lastY: event.clientY };
    globalActions.setPagePanOffset(
      clampWorkspacePanOffset(
        {
          x: pagePan.x + dx,
          y: pagePan.y + dy
        },
        workspaceViewportBounds
      )
    );
  }

  function handleWorkspacePanUp(): void {
    workspaceDragState = null;
    window.removeEventListener(EVENT.POINTERMOVE, handleWorkspacePanMove);
    window.removeEventListener(EVENT.POINTERUP, handleWorkspacePanUp);
  }

  function isTypingTarget(target: EventTarget | null): boolean {
    const element = target instanceof Element ? target : null;
    if (!element) return false;
    return Boolean(
      element.closest(
        'input, textarea, select, [contenteditable="true"], [role="textbox"], [role="combobox"]'
      )
    );
  }

  function isInteractiveSpaceTarget(target: EventTarget | null): boolean {
    const element = target instanceof Element ? target : null;
    return Boolean(element?.closest(SPACE_PAN_INTERACTIVE_SELECTOR));
  }

  function shouldArmSpacePan(target: EventTarget | null): boolean {
    if (isInteractiveSpaceTarget(target)) return false;

    const element = target instanceof Element ? target : null;
    if (!element) return true;

    if (
      typeof document !== 'undefined' &&
      (element === document.body || element === document.documentElement)
    ) {
      return true;
    }

    return isWorkspacePanTarget(element);
  }

  function handleWorkspaceFitEvent(): void {
    fitPageToWorkspace();
  }

  function handleGlobalKeyDown(event: KeyboardEvent): void {
    if (isTypingTarget(event.target)) return;

    if (event.code === 'Space' && !event.repeat) {
      if (!shouldArmSpacePan(event.target)) return;
      event.preventDefault();
      isSpacePanArmed = true;
      return;
    }

    const isCmdOrCtrl = event.metaKey || event.ctrlKey;
    if (!isCmdOrCtrl) return;

    if (event.key === '0') {
      event.preventDefault();
      fitPageToWorkspace();
      return;
    }

    if (event.key === '1') {
      event.preventDefault();
      globalActions.setPageZoom(100);
      globalActions.resetPagePan();
    }
  }

  function handleGlobalKeyUp(event: KeyboardEvent): void {
    if (event.code === 'Space') {
      isSpacePanArmed = false;
    }
  }
</script>

<article
  class="main-content"
  class:mobile-view={globalState.isMobileView}
  class:workspace-panning={workspaceDragState !== null}
  class:workspace-overflow-draggable={isWorkspacePanDraggable}
  class:workspace-has-overflow={hasWorkspaceOverflow}
  class:workspace-space-armed={isSpacePanArmed && !isPageMode}
  onpointerdown={handleMainContentPointerDown}
>
  <div
    bind:this={workspaceViewportElement}
    class="workspace-viewport"
    class:has-overflow={hasWorkspaceOverflow}
  >
    <div class="workspace-camera" style={workspaceCameraStyle}>
      <div class="page-scale-layer">
        <div class="page-content-wrapper">
          {@render children()}
        </div>
      </div>
    </div>
  </div>

  {@render overlays?.()}
</article>

<style>
  .main-content {
    position: relative;
    flex: 1;
    min-width: 0;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: visible;
  }

  .main-content.mobile-view {
    justify-content: center;
  }

  .workspace-viewport {
    position: relative;
    flex: 1;
    min-width: 0;
    height: 100%;
    overflow: hidden;
  }

  .workspace-viewport.has-overflow::before,
  .workspace-viewport.has-overflow::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    width: 48px;
    pointer-events: none;
    z-index: 1;
    opacity: 0.85;
  }

  .workspace-viewport.has-overflow::before {
    left: 0;
    background: linear-gradient(
      to right,
      var(--cds-ui-01) 0%,
      rgba(244, 244, 244, 0) 100%
    );
  }

  .workspace-viewport.has-overflow::after {
    right: 0;
    background: linear-gradient(
      to left,
      var(--cds-ui-01) 0%,
      rgba(244, 244, 244, 0) 100%
    );
  }

  .workspace-camera,
  .page-scale-layer,
  .page-content-wrapper {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: visible;
  }

  .workspace-camera {
    will-change: transform;
  }

  .page-content-wrapper {
    min-width: 0;
    padding: var(--cds-spacing-03) var(--cds-spacing-05);
  }

  @media (max-width: 1023px) {
    .page-content-wrapper {
      padding: var(--cds-spacing-02) var(--cds-spacing-03);
    }
  }

  .workspace-panning .workspace-camera {
    transition: none;
  }

  .workspace-panning {
    cursor: grabbing;
  }

  .main-content.workspace-overflow-draggable :global(.main-map-container),
  .main-content.workspace-overflow-draggable :global(.map-stage),
  .main-content.workspace-overflow-draggable :global(.map-canvas),
  .main-content.workspace-overflow-draggable :global(.map-canvas canvas),
  .main-content.workspace-overflow-draggable :global(.page-grid),
  .main-content.workspace-overflow-draggable :global(.page-container) {
    cursor: grab;
    touch-action: none;
  }

  .main-content.workspace-space-armed :global(.main-map-container),
  .main-content.workspace-space-armed :global(.map-stage),
  .main-content.workspace-space-armed :global(.map-canvas),
  .main-content.workspace-space-armed :global(.map-canvas canvas),
  .main-content.workspace-space-armed :global(.page-grid),
  .main-content.workspace-space-armed :global(.page-container) {
    cursor: grab;
  }

  .workspace-panning :global(.main-map-container),
  .workspace-panning :global(.map-stage),
  .workspace-panning :global(.map-canvas),
  .workspace-panning :global(.map-canvas canvas),
  .workspace-panning :global(.page-grid),
  .workspace-panning :global(.page-container) {
    cursor: grabbing;
  }
</style>
