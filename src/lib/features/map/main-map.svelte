<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { InlineNotification } from 'carbon-components-svelte';
  import { WarningAlt } from 'carbon-icons-svelte';
  import { onMount, untrack } from 'svelte';
  import { fade } from 'svelte/transition';
  import { globalActions, globalState } from '../commons/stores/global.svelte';
  import { ToolbarStep } from '../commons/types/global';
  import {
    formatActions,
    formatState
  } from '$lib/features/step-toolbar/tools/format';
  import { EVENT } from '../commons/constants/dom.constants';
  import { PAGE_GRID_SIZE_PX } from '../commons/utils/page-grid.utils';
  import MapSkeleton from './components/map-skeleton.svelte';
  import ThematicMap from './components/thematic-map.svelte';
  import { facetsStore } from '$lib/features/step-toolbar/tools/facets';
  import FacetsPage from '$lib/features/step-toolbar/tools/facets/facets-page.svelte';
  import { resolveWorkspaceFitScale } from '../commons/utils/workspace-viewport.utils';
  import { densityLoadingStore } from './stores/density-loading.store.svelte';
  import { mapLoadingStore } from './stores/map-loading.store.svelte';
  import { MAP_TIMING } from './constants/timing.constants';
  import { useMapDisplayData } from './hooks';
  import { getKeyboardMoveDelta } from './utils/keyboard-position.utils';

  let isInitializing = $state(true);
  let isMapReady = $state(false);
  const skeletonShownAt = Date.now();
  let hasError = $state(false);
  let errorMessage = $state<string | null>(null);
  let toolbarTransitionTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let transitionEndCleanup: (() => void) | null = null;

  const TOOLBAR_TRANSITION_SAFETY_MS = 400;
  const MAP_STATUS_LOADER_DELAY_MS = 300;

  function clearDisplayError(): void {
    hasError = false;
    errorMessage = null;
  }

  function setDisplayError(message: string): void {
    hasError = true;
    errorMessage = message;
  }

  const mapDisplayData = useMapDisplayData({
    getIsInitializing: () => isInitializing,
    onInitialized: () => {
      isInitializing = false;
    },
    clearError: clearDisplayError,
    setError: setDisplayError
  });
  const displayTables = $derived(mapDisplayData.displayTables);
  const displayDensityTables = $derived(mapDisplayData.displayDensityTables);
  const displayGeoJSONs = $derived(mapDisplayData.displayGeoJSONs);
  const displaySplitData = $derived(mapDisplayData.displaySplitData);
  const displayDataVersion = $derived(mapDisplayData.displayDataVersion);

  let showDensityLoader = $state(false);
  let showReferenceBasemapLoader = $state(false);
  function scheduleDelayedMapStatusLoader(
    isLoading: () => boolean,
    setVisible: (visible: boolean) => void
  ): (() => void) | undefined {
    if (!isLoading()) {
      setVisible(false);
      return undefined;
    }

    const timer = setTimeout(() => {
      setVisible(isLoading());
    }, MAP_STATUS_LOADER_DELAY_MS);

    return () => clearTimeout(timer);
  }

  $effect(() => {
    return scheduleDelayedMapStatusLoader(
      () => densityLoadingStore.isLoading,
      (visible) => {
        showDensityLoader = visible;
      }
    );
  });
  $effect(() => {
    return scheduleDelayedMapStatusLoader(
      () => mapLoadingStore.isReferenceBasemapLoading,
      (visible) => {
        showReferenceBasemapLoader = visible;
      }
    );
  });
  const showMapStatusLoader = $derived(
    showReferenceBasemapLoader || showDensityLoader
  );
  const mapStatusLoaderText = $derived(
    showReferenceBasemapLoader ? m.basemap_loading() : m.density_loading()
  );
  const shouldHideMapOutput = $derived(
    mapLoadingStore.isHoldingPreviewForSuggestedBasemap
  );
  const facetsEnabled = $derived(facetsStore.enabled);
  const facetsLayout = $derived(facetsStore.layout);
  const facetVisualizations = $derived(facetsStore.facetVisualizations);

  const WORKSPACE_FIT_PADDING_PX = 30;
  let responsiveMapResizeObserver: ResizeObserver | null = null;
  let observedWorkspace: HTMLElement | null = null;
  let observedStepToolbar: HTMLElement | null = null;
  let workspaceWidth = $state(0);
  let workspaceHeight = $state(0);
  let stepToolbarWidth = $state(0);

  const fitScale = $derived(
    resolveWorkspaceFitScale({
      viewportWidth: workspaceWidth,
      viewportHeight: workspaceHeight,
      pageWidth: formatState.width,
      pageHeight: formatState.height,
      paddingPx: WORKSPACE_FIT_PADDING_PX,
      reservedInlineStartPx: globalState.isMobileView ? 0 : stepToolbarWidth,
      maxViewportCoverageRatio: 1
    })
  );
  const renderedPageScale = $derived(
    fitScale * (globalState.zoom.pageZoomLevel / 100)
  );
  const renderedPageWidth = $derived(
    Math.max(1, Math.round(formatState.width * renderedPageScale))
  );
  const renderedPageHeight = $derived(
    Math.max(1, Math.round(formatState.height * renderedPageScale))
  );

  // Resize handles target the map frame inside fixed page margins.
  const mapAreaInsetLeftPx = $derived(
    Math.round(formatState.margins.left * renderedPageScale)
  );
  const mapAreaInsetTopPx = $derived(
    Math.round(formatState.margins.top * renderedPageScale)
  );
  const mapAreaWidthPx = $derived(
    Math.max(
      1,
      Math.round(
        (formatState.width -
          formatState.margins.left -
          formatState.margins.right) *
          renderedPageScale
      )
    )
  );
  const mapAreaHeightPx = $derived(
    Math.max(
      1,
      Math.round(
        (formatState.height -
          formatState.margins.top -
          formatState.margins.bottom) *
          renderedPageScale
      )
    )
  );

  function applyWorkspaceResize(entry: ResizeObserverEntry): void {
    const rect = entry.contentRect;
    workspaceWidth = rect.width;
    workspaceHeight = rect.height;
  }

  function applyStepToolbarResize(entry: ResizeObserverEntry): void {
    stepToolbarWidth = Math.round(entry.contentRect.width);
  }

  function readObservedDimensions(): void {
    if (observedWorkspace) {
      const rect = observedWorkspace.getBoundingClientRect();
      workspaceWidth = rect.width;
      workspaceHeight = rect.height;
    }
    if (observedStepToolbar) {
      stepToolbarWidth = Math.round(
        observedStepToolbar.getBoundingClientRect().width
      );
    }
  }

  function handleWindowResize(): void {
    readObservedDimensions();
  }

  function startResponsiveMapObservers(): void {
    observedWorkspace = document.querySelector('.workspace-viewport');
    observedStepToolbar = document.getElementById('khartis-step-toolbar');

    if (typeof ResizeObserver !== 'undefined') {
      responsiveMapResizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.target === observedWorkspace) {
            applyWorkspaceResize(entry);
          } else if (entry.target === observedStepToolbar) {
            applyStepToolbarResize(entry);
          }
        }
      });

      if (observedWorkspace) {
        responsiveMapResizeObserver.observe(observedWorkspace);
      }
      if (observedStepToolbar) {
        responsiveMapResizeObserver.observe(observedStepToolbar);
      }
    }

    readObservedDimensions();

    if (typeof window !== 'undefined') {
      window.addEventListener(EVENT.RESIZE, handleWindowResize);
    }
  }

  function stopResponsiveMapObservers(): void {
    responsiveMapResizeObserver?.disconnect();
    responsiveMapResizeObserver = null;
    observedWorkspace = null;
    observedStepToolbar = null;
    if (typeof window !== 'undefined') {
      window.removeEventListener(EVENT.RESIZE, handleWindowResize);
    }
  }

  function cleanupTransitionListener(): void {
    if (transitionEndCleanup) {
      transitionEndCleanup();
      transitionEndCleanup = null;
    }
  }

  function finishToolbarTransition(): void {
    cleanupTransitionListener();
    if (toolbarTransitionTimeoutId) {
      clearTimeout(toolbarTransitionTimeoutId);
      toolbarTransitionTimeoutId = null;
    }
    globalState.isToolbarTransitioning = false;
  }

  $effect(() => {
    void globalState.toolbarState;

    untrack(() => {
      if (!isMapReady) return;

      globalState.isToolbarTransitioning = true;

      cleanupTransitionListener();
      if (toolbarTransitionTimeoutId) {
        clearTimeout(toolbarTransitionTimeoutId);
      }

      toolbarTransitionTimeoutId = setTimeout(
        finishToolbarTransition,
        TOOLBAR_TRANSITION_SAFETY_MS
      );

      const toolbar = document.getElementById('khartis-main-toolbar');
      if (toolbar) {
        const handler = (event: TransitionEvent) => {
          if (event.propertyName === 'width') {
            finishToolbarTransition();
          }
        };
        toolbar.addEventListener(EVENT.TRANSITIONEND, handler, { once: true });
        transitionEndCleanup = () =>
          toolbar.removeEventListener(EVENT.TRANSITIONEND, handler);
      }
    });
  });

  onMount(() => {
    startResponsiveMapObservers();
    void mapDisplayData.initialize();

    return () => {
      if (toolbarTransitionTimeoutId) {
        clearTimeout(toolbarTransitionTimeoutId);
      }
      if (skeletonTimeoutId) {
        clearTimeout(skeletonTimeoutId);
      }
      cleanupTransitionListener();
      stopResponsiveMapObservers();
      handleResizeUp();
    };
  });

  let skeletonTimeoutId: ReturnType<typeof setTimeout> | null = null;

  function handleMapReady() {
    const elapsed = Date.now() - skeletonShownAt;
    const remaining = Math.max(0, MAP_TIMING.MIN_SKELETON_DISPLAY_MS - elapsed);
    if (remaining === 0) {
      isMapReady = true;
    } else {
      skeletonTimeoutId = setTimeout(() => {
        skeletonTimeoutId = null;
        isMapReady = true;
      }, remaining);
    }
  }

  $effect(() => {
    globalActions.setPageZoomScale(renderedPageScale);
  });

  type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
  const RESIZE_EDGES: ResizeEdge[] = [
    'n',
    's',
    'e',
    'w',
    'ne',
    'nw',
    'se',
    'sw'
  ];
  const MIN_MAP_SIZE = 100;

  const showResizeHandles = $derived(
    globalState.selectedStep === ToolbarStep.Styling && isMapReady
  );
  let hoveredResizeEdge = $state<ResizeEdge | null>(null);

  let resizeState = $state<{
    edge: ResizeEdge;
    startX: number;
    startY: number;
    startMargins: { top: number; right: number; bottom: number; left: number };
    pageW: number;
    pageH: number;
  } | null>(null);

  function clampMargin(value: number, max: number): number {
    return Math.min(Math.max(value, 0), Math.max(0, max));
  }

  function getKeyboardResizeStep(): number {
    return formatState.gridEnabled ? PAGE_GRID_SIZE_PX : 1;
  }

  function getKeyboardFastResizeStep(): number {
    return formatState.gridEnabled ? PAGE_GRID_SIZE_PX * 5 : 10;
  }

  function resizeMapFrame(
    edge: ResizeEdge,
    dx: number,
    dy: number,
    startMargins: { top: number; right: number; bottom: number; left: number },
    pageW: number,
    pageH: number
  ): void {
    let { top, right, bottom, left } = startMargins;

    if (edge.includes('e')) right = startMargins.right - dx;
    if (edge.includes('w')) left = startMargins.left + dx;
    if (edge.includes('s')) bottom = startMargins.bottom - dy;
    if (edge.includes('n')) top = startMargins.top + dy;

    left = clampMargin(left, pageW - startMargins.right - MIN_MAP_SIZE);
    right = clampMargin(right, pageW - startMargins.left - MIN_MAP_SIZE);
    top = clampMargin(top, pageH - startMargins.bottom - MIN_MAP_SIZE);
    bottom = clampMargin(bottom, pageH - startMargins.top - MIN_MAP_SIZE);

    formatActions.setMargins({
      top: Math.round(top),
      right: Math.round(right),
      bottom: Math.round(bottom),
      left: Math.round(left)
    });
  }

  function handleResizePointerDown(
    event: PointerEvent,
    edge: ResizeEdge
  ): void {
    event.preventDefault();
    event.stopPropagation();
    globalState.isResizingMapFrame = true;
    resizeState = {
      edge,
      startX: event.clientX,
      startY: event.clientY,
      startMargins: { ...formatState.margins },
      pageW: formatState.width,
      pageH: formatState.height
    };
    window.addEventListener(EVENT.POINTERMOVE, handleResizeMove);
    window.addEventListener(EVENT.POINTERUP, handleResizeUp);
  }

  // Edge drag adjusts margins, not page format.
  function handleResizeMove(event: PointerEvent): void {
    if (!resizeState) return;
    const { edge, startX, startY, startMargins, pageW, pageH } = resizeState;
    const scale = Math.max(globalState.zoom.pageZoomScale, 0.1);
    const dx = (event.clientX - startX) / scale;
    const dy = (event.clientY - startY) / scale;

    resizeMapFrame(edge, dx, dy, startMargins, pageW, pageH);
  }

  function handleResizeUp(): void {
    globalState.isResizingMapFrame = false;
    resizeState = null;
    hoveredResizeEdge = null;
    window.removeEventListener(EVENT.POINTERMOVE, handleResizeMove);
    window.removeEventListener(EVENT.POINTERUP, handleResizeUp);
  }

  function handleResizeKeyDown(event: KeyboardEvent, edge: ResizeEdge): void {
    const delta = getKeyboardMoveDelta(
      event,
      getKeyboardResizeStep(),
      getKeyboardFastResizeStep()
    );
    if (!delta) {
      return;
    }

    const dx = edge.includes('e') || edge.includes('w') ? delta.x : 0;
    const dy = edge.includes('n') || edge.includes('s') ? delta.y : 0;
    if (dx === 0 && dy === 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    resizeMapFrame(
      edge,
      dx,
      dy,
      { ...formatState.margins },
      formatState.width,
      formatState.height
    );
  }
</script>

<div class="main-map-container" class:resizable={showResizeHandles}>
  <div
    class="skeleton-loader"
    class:hidden={isMapReady && !shouldHideMapOutput}
    class:held={shouldHideMapOutput}
    style="width: {renderedPageWidth}px; height: {renderedPageHeight}px;"
  >
    <MapSkeleton paused={isMapReady && !shouldHideMapOutput} />
  </div>

  {#if !isInitializing && hasError}
    <div class="error-state" in:fade={{ duration: 300 }}>
      <div class="error-icon">
        <WarningAlt size={32} />
      </div>
      <InlineNotification
        kind="error"
        title={m.error_loading_title()}
        subtitle={errorMessage ?? m.error_loading_subtitle()}
        hideCloseButton
        lowContrast
      />
    </div>
  {:else if !isInitializing}
    <div
      class="thematic-map-wrapper"
      class:held={shouldHideMapOutput}
      class:visible={isMapReady && !shouldHideMapOutput}
    >
      {#if facetsEnabled && facetVisualizations.length > 0}
        <FacetsPage
          visualizations={facetVisualizations}
          tables={displayTables}
          densityTables={displayDensityTables}
          splitData={displaySplitData}
          geoJSONs={displayGeoJSONs}
          layout={facetsLayout}
          width={renderedPageWidth}
          height={renderedPageHeight}
          logicalWidth={formatState.width}
          logicalHeight={formatState.height}
          displayScale={renderedPageScale}
          onReady={handleMapReady}
        />
      {:else}
        <ThematicMap
          tables={displayTables}
          densityTables={displayDensityTables}
          splitData={displaySplitData}
          geoJSONs={displayGeoJSONs}
          dataVersion={displayDataVersion}
          width={renderedPageWidth}
          height={renderedPageHeight}
          logicalWidth={formatState.width}
          logicalHeight={formatState.height}
          displayScale={renderedPageScale}
          onReady={handleMapReady}
        />
      {/if}
      {#if showMapStatusLoader}
        <div
          class="map-status-loader"
          role="status"
          aria-live="polite"
          transition:fade={{ duration: 150 }}
        >
          <span class="map-status-loader-spinner" aria-hidden="true"></span>
          <span class="map-status-loader-text">{mapStatusLoaderText}</span>
        </div>
      {/if}

      {#if showResizeHandles}
        <div
          class="resize-handles-frame"
          class:highlighted={hoveredResizeEdge !== null || resizeState !== null}
          style="left: {mapAreaInsetLeftPx}px; top: {mapAreaInsetTopPx}px; width: {mapAreaWidthPx}px; height: {mapAreaHeightPx}px;"
        >
          {#each RESIZE_EDGES as edge (edge)}
            <div
              class="resize-handle resize-{edge}"
              role="button"
              tabindex="0"
              aria-label={m.map_resize_handle()}
              onpointerenter={() => (hoveredResizeEdge = edge)}
              onpointerleave={() => {
                if (hoveredResizeEdge === edge) {
                  hoveredResizeEdge = null;
                }
              }}
              onpointerdown={(e: PointerEvent) =>
                handleResizePointerDown(e, edge)}
              onkeydown={(e: KeyboardEvent) => handleResizeKeyDown(e, edge)}
            ></div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .map-status-loader {
    position: absolute;
    top: var(--cds-spacing-04);
    right: var(--cds-spacing-04);
    display: inline-flex;
    align-items: center;
    gap: var(--cds-spacing-03);
    padding: var(--cds-spacing-02) var(--cds-spacing-04);
    background: var(--cds-layer-01, rgba(255, 255, 255, 0.95));
    border: 1px solid var(--cds-border-subtle-01, #e0e0e0);
    border-radius: 999px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
    font-size: 0.75rem;
    color: var(--cds-text-secondary, #525252);
    pointer-events: none;
    z-index: 3;
  }

  .map-status-loader-spinner {
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 1.5px solid var(--cds-border-subtle-02, #c6c6c6);
    border-top-color: var(--cds-interactive-01, #0f62fe);
    border-radius: 50%;
    animation: map-status-loader-spin 0.75s linear infinite;
  }

  @keyframes map-status-loader-spin {
    to {
      transform: rotate(360deg);
    }
  }

  .main-map-container {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    position: relative;
    overflow: visible;
  }

  .main-map-container.resizable {
    user-select: none;
  }

  .thematic-map-wrapper {
    opacity: 0;
    position: relative;
  }

  .thematic-map-wrapper.visible {
    opacity: 1;
    transition: none;
  }

  .thematic-map-wrapper.held {
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transition: none;
  }

  .skeleton-loader {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: var(--z-content);
    overflow: hidden;
    pointer-events: none;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
    border-radius: 2px;
    opacity: 1;
    transition: opacity 0.3s cubic-bezier(0.33, 1, 0.68, 1);
  }

  .skeleton-loader.hidden {
    opacity: 0;
    pointer-events: none;
  }

  .skeleton-loader.held {
    opacity: 1;
    visibility: visible;
    transition: none;
  }

  .error-state {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 2rem;
    background: var(--cds-ui-01, #f4f4f4);
  }

  .error-icon {
    color: var(--cds-support-error, #da1e28);
  }

  .error-state :global(.bx--inline-notification) {
    max-width: 400px;
  }

  .resize-handles-frame {
    --resize-hit-reach: 8px;
    position: absolute;
    pointer-events: none;
    border: 1px dashed transparent;
    border-radius: 2px;
    transition:
      border-color 120ms ease,
      box-shadow 120ms ease;
  }

  .resize-handles-frame.highlighted {
    border-color: rgba(15, 98, 254, 0.55);
    box-shadow: inset 0 0 0 1px rgba(15, 98, 254, 0.15);
  }

  .resize-handle {
    position: absolute;
    pointer-events: auto;
    z-index: var(--z-content-raised, 2);
    touch-action: none;
    padding: 0;
    border: 0;
    background: transparent;
  }

  /* The hit area reaches well past the frame edge so brushing it is enough to
     reveal the resize affordance; ::after keeps the painted grip on the edge. */
  .resize-handle::after {
    position: absolute;
    border-radius: 1px;
    background: var(--cds-interactive-01, #0f62fe);
    opacity: 0;
    transition: opacity 120ms ease;
    content: '';
  }

  .resize-handle:hover::after {
    opacity: 0.4;
  }

  .resize-handle:focus-visible::after {
    outline: 2px solid var(--cds-focus, #0f62fe);
    outline-offset: 2px;
    opacity: 0.5;
  }

  .resize-n,
  .resize-s {
    left: var(--resize-hit-reach);
    right: var(--resize-hit-reach);
    height: calc(2 * var(--resize-hit-reach));
  }

  .resize-e,
  .resize-w {
    top: var(--resize-hit-reach);
    bottom: var(--resize-hit-reach);
    width: calc(2 * var(--resize-hit-reach));
  }

  .resize-ne,
  .resize-nw,
  .resize-se,
  .resize-sw {
    width: calc(2 * var(--resize-hit-reach));
    height: calc(2 * var(--resize-hit-reach));
  }

  .resize-n {
    top: calc(-1 * var(--resize-hit-reach));
    cursor: n-resize;
  }

  .resize-s {
    bottom: calc(-1 * var(--resize-hit-reach));
    cursor: s-resize;
  }

  .resize-e {
    right: calc(-1 * var(--resize-hit-reach));
    cursor: e-resize;
  }

  .resize-w {
    left: calc(-1 * var(--resize-hit-reach));
    cursor: w-resize;
  }

  .resize-ne {
    top: calc(-1 * var(--resize-hit-reach));
    right: calc(-1 * var(--resize-hit-reach));
    cursor: ne-resize;
  }

  .resize-nw {
    top: calc(-1 * var(--resize-hit-reach));
    left: calc(-1 * var(--resize-hit-reach));
    cursor: nw-resize;
  }

  .resize-se {
    bottom: calc(-1 * var(--resize-hit-reach));
    right: calc(-1 * var(--resize-hit-reach));
    cursor: se-resize;
  }

  .resize-sw {
    bottom: calc(-1 * var(--resize-hit-reach));
    left: calc(-1 * var(--resize-hit-reach));
    cursor: sw-resize;
  }

  .resize-n::after,
  .resize-s::after {
    left: 0;
    right: 0;
    top: calc(var(--resize-hit-reach) - 3px);
    height: 6px;
  }

  .resize-e::after,
  .resize-w::after {
    top: 0;
    bottom: 0;
    left: calc(var(--resize-hit-reach) - 3px);
    width: 6px;
  }

  .resize-ne::after,
  .resize-nw::after,
  .resize-se::after,
  .resize-sw::after {
    inset: calc(var(--resize-hit-reach) - 4px);
  }
</style>
