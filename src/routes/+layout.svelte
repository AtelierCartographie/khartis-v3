<script lang="ts">
  import AppLoader from '$lib/features/commons/components/app-loader.svelte';
  import KeyboardShortcuts from '$lib/features/commons/components/keyboard-shortcuts.svelte';
  import NotificationContainer from '$lib/features/commons/components/notification-container.svelte';
  import ConsentBanner from '$lib/features/commons/components/consent-banner.svelte';
  import PwaUpdatePrompt from '$lib/features/commons/components/pwa-update-prompt.svelte';
  import { dataOrchestratorService } from '$lib/features/commons/services/data-orchestrator.service.svelte';
  import {
    globalActions,
    globalState,
    MOBILE_BREAKPOINT
  } from '$lib/features/commons/store/global.svelte';
  import '$lib/features/commons/utils/uuid.utils';
  import { ToolbarStep } from '$lib/features/commons/types/global';
  import { projectStore } from '$lib/features/commons/store/project.store.svelte';
  import { initializeStores } from '$lib/features/commons/store/stores-init';
  import { LogCategory, logger } from '$lib/features/commons/utils/logger';
  import CreateProject from '$lib/features/create-project/create-project.svelte';

  import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
  import { basemapService } from '$lib/features/map/services/basemap.service.svelte';
  import { EVENT } from '$lib/features/commons/constants/dom.constants';
  import { persistenceRegistry } from '$lib/features/project-management/core/persistence-registry';

  initializeStores();
  import '$lib/features/commons/store/locale.store.svelte';
  import { setLocale, locales, cookieName } from '$lib/paraglide/runtime.js';
  import Header from '$lib/features/header/header.svelte';
  import MainToolbar from '$lib/features/main-toolbar/main-toolbar.svelte';
  import MobileToolbar from '$lib/features/main-toolbar/mobile-toolbar.svelte';
  import MobileOpenPanelButton from '$lib/features/map/components/mobile-open-panel-button.svelte';
  import MapTooltipOverlay from '$lib/features/map/components/map-tooltip-overlay.svelte';
  import ZoomToolbar from '$lib/features/map/components/zoom-toolbar.svelte';
  import Sidenav from '$lib/features/side-nav.svelte';
  import {
    annotationsActions,
    getAnnotationsState
  } from '$lib/features/step-toolbar/tools/annotations/annotations.store.svelte';
  import {
    colorBlindnessActions,
    getColorBlindnessState
  } from '$lib/features/step-toolbar/tools/color-blindness/color-blindness.store.svelte';
  import { ColorBlindnessType } from '$lib/features/commons/constants/ui.constants';
  import { zoomModeStore } from '$lib/features/commons/store/zoom-mode.store.svelte';
  import {
    DEFAULT_WORKSPACE_VIEWPORT_BOUNDS,
    WORKSPACE_FIT_EVENT,
    clampWorkspacePanOffset,
    isWorkspacePanTarget,
    resolveWorkspaceViewportBounds,
    type WorkspaceViewportBounds
  } from '$lib/features/commons/utils/workspace-viewport.utils';
  import StepToolbar from '$lib/features/step-toolbar/step-toolbar.svelte';
  import { Button, Tag, Theme } from 'carbon-components-svelte';
  import { WarningAltFilled } from 'carbon-icons-svelte';
  import { onMount, untrack } from 'svelte';
  import * as m from '$lib/paraglide/messages';

  import 'carbon-components-svelte/css/all.css';

  import '$lib/features/commons/assets/styles/dimension.css';
  import '$lib/features/commons/assets/styles/flex.css';
  import '$lib/features/commons/assets/styles/global.css';
  import '$lib/features/commons/assets/styles/figma-tokens.css';
  import '$lib/features/commons/assets/styles/spacing.css';
  import '$lib/features/commons/assets/styles/theming.css';

  let { children } = $props();
  let isLoading = $state(true);
  let previousStep = $state<ToolbarStep | null>(null);
  let stylingElementsInitializedForProject = $state<string | null>(null);
  const ENABLE_BEFOREUNLOAD_CONFIRMATION = false;

  const handleResize = () => {
    globalActions.setMobileView(window.innerWidth < MOBILE_BREAKPOINT);
  };

  onMount(() => {
    const hasCookie = document.cookie.includes(cookieName);
    if (!hasCookie && typeof navigator !== 'undefined') {
      const browserLang = navigator.language?.split('-')[0];
      if (
        browserLang &&
        locales.includes(browserLang as (typeof locales)[number])
      ) {
        setLocale(browserLang as (typeof locales)[number]);
      }
    }

    handleResize();
    window.addEventListener(EVENT.RESIZE, handleResize);

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (projectStore.isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    if (ENABLE_BEFOREUNLOAD_CONFIRMATION) {
      window.addEventListener(EVENT.BEFOREUNLOAD, handleBeforeUnload);
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        persistenceRegistry.flush();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

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
    observeStepToolbar();

    window.addEventListener(EVENT.KEYDOWN, handleGlobalKeyDown);
    window.addEventListener(EVENT.KEYUP, handleGlobalKeyUp);
    window.addEventListener(WORKSPACE_FIT_EVENT, handleWorkspaceFitEvent);

    const initApp = async () => {
      // Start DuckDB in background — don't block UI on it (LCP optimization)
      const duckDBReadyPromise = duckDBOrchestrator
        .initialize()
        .then(() => basemapService.initialize())
        .catch((error) => {
          logger.error(
            'DuckDB initialization failed',
            LogCategory.DUCKDB,
            error
          );
        });

      try {
        // Project store uses IndexedDB only — fast (~100ms), independent of DuckDB
        await projectStore.waitForInit();
        isLoading = false;

        if (!projectStore.currentProject) {
          globalState.isCreateProjectModalOpen = true;
        }

        logger.debug(
          'UI ready — DuckDB loading in background',
          LogCategory.SYSTEM
        );
      } catch (error) {
        logger.error(
          'Project store initialization failed',
          LogCategory.SYSTEM,
          error
        );
        isLoading = false;
        globalState.isCreateProjectModalOpen = true;
      }

      // Wait for DuckDB, then restore any existing project data
      try {
        await duckDBReadyPromise;
        await dataOrchestratorService.initialize();

        logger.debug('Background initialization complete', LogCategory.SYSTEM);
      } catch (error) {
        logger.error(
          'Background initialization failed',
          LogCategory.SYSTEM,
          error
        );
        globalState.isCreateProjectModalOpen = true;
      }
    };

    initApp();

    // Fix Carbon ComboBox ARIA: outer wrapper incorrectly has role="listbox"
    // causing "ARIA required children" violations. Options list (.bx--list-box__menu)
    // keeps its correct role="listbox".
    const fixComboboxAria = (root: Element | Document = document) => {
      (root as Element)
        .querySelectorAll?.('.bx--combo-box[role="listbox"]')
        .forEach((el) => el.setAttribute('role', 'group'));
    };
    fixComboboxAria();
    const ariaObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            fixComboboxAria(node as Element);
          }
        }
      }
    });
    ariaObserver.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.removeEventListener(EVENT.RESIZE, handleResize);
      window.removeEventListener(EVENT.KEYDOWN, handleGlobalKeyDown);
      window.removeEventListener(EVENT.KEYUP, handleGlobalKeyUp);
      window.removeEventListener(WORKSPACE_FIT_EVENT, handleWorkspaceFitEvent);
      if (ENABLE_BEFOREUNLOAD_CONFIRMATION) {
        window.removeEventListener(EVENT.BEFOREUNLOAD, handleBeforeUnload);
      }
      ariaObserver.disconnect();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
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

  function observeStepToolbar(): void {
    if (!stepToolbarResizeObserver) return;
    const el = document.getElementById('khartis-step-toolbar');
    if (!el) {
      requestAnimationFrame(observeStepToolbar);
      return;
    }
    stepToolbarResizeObserver.observe(el);
    stepToolbarWidth = Math.round(el.getBoundingClientRect().width);
  }

  $effect(() => {
    void pageZoomScale;
    void zoomModeStore.mode;

    requestAnimationFrame(() => {
      updateWorkspaceViewportState();
    });
  });

  $effect(() => {
    globalActions.setPageZoomScale(pageZoomScale);
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

  function handleCloseModal() {
    globalState.isCreateProjectModalOpen = false;
  }

  const colorBlindnessState = $derived(getColorBlindnessState());
  const isColorBlindnessActive = $derived(
    colorBlindnessState.simulationType !== ColorBlindnessType.NONE
  );
  const isPageMode = $derived(zoomModeStore.isPageMode);

  function handleDeactivateColorBlindness() {
    colorBlindnessActions.setSimulationType(ColorBlindnessType.NONE);
  }

  const LEFT_BUTTON = 0;
  const MIDDLE_BUTTON = 1;
  const WORKSPACE_FIT_PADDING_PX = 30;
  let workspaceViewportElement = $state<HTMLElement | null>(null);
  let stepToolbarWidth = $state(0);
  let workspaceWidth = $state(0);
  let workspaceHeight = $state(0);
  let pageIntrinsicWidth = $state(0);
  let pageIntrinsicHeight = $state(0);
  let stepToolbarResizeObserver: ResizeObserver | null = null;
  let observedPageElement: HTMLElement | null = null;

  const fitScale = $derived.by(() => {
    if (
      workspaceWidth <= 0 ||
      workspaceHeight <= 0 ||
      pageIntrinsicWidth <= 0 ||
      pageIntrinsicHeight <= 0
    ) {
      return 1;
    }
    const effectiveWidth = Math.max(
      1,
      workspaceWidth - stepToolbarWidth - WORKSPACE_FIT_PADDING_PX * 2
    );
    const effectiveHeight = Math.max(
      1,
      workspaceHeight - WORKSPACE_FIT_PADDING_PX * 2
    );
    return Math.min(
      1,
      effectiveWidth / pageIntrinsicWidth,
      effectiveHeight / pageIntrinsicHeight
    );
  });

  const pageZoomScale = $derived(
    fitScale * (globalState.zoom.pageZoomLevel / 100)
  );
  const pagePan = $derived(globalState.zoom.pagePanOffset);
  const workspaceCenteringOffsetX = $derived(stepToolbarWidth / 2);
  const workspaceCameraStyle = $derived(
    `transform: translate(${pagePan.x + workspaceCenteringOffsetX}px, ${pagePan.y}px);`
  );
  const pageScaleStyle = $derived(`zoom: ${pageZoomScale};`);
  let workspaceViewportBounds = $state<WorkspaceViewportBounds>(
    DEFAULT_WORKSPACE_VIEWPORT_BOUNDS
  );
  let isWorkspacePanDraggable = $state(false);
  let hasWorkspaceOverflow = $state(false);
  let isSpacePanArmed = $state(false);
  let workspaceDragState = $state<{ lastX: number; lastY: number } | null>(
    null
  );
  let pageResizeObserver: ResizeObserver | null = null;
  let workspaceResizeObserver: ResizeObserver | null = null;
  let pageMutationObserver: MutationObserver | null = null;

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

    workspaceWidth = viewportElement.clientWidth;
    workspaceHeight = viewportElement.clientHeight;
    pageIntrinsicWidth = pageElement.offsetWidth;
    pageIntrinsicHeight = pageElement.offsetHeight;

    const nextBounds = resolveWorkspaceViewportBounds({
      viewportWidth: viewportElement.clientWidth,
      viewportHeight: viewportElement.clientHeight,
      pageWidth: pageElement.offsetWidth,
      pageHeight: pageElement.offsetHeight,
      pageZoomScale
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

  function handleWorkspaceFitEvent(): void {
    fitPageToWorkspace();
  }

  function handleGlobalKeyDown(event: KeyboardEvent): void {
    if (isTypingTarget(event.target)) return;

    if (event.code === 'Space' && !event.repeat) {
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

  $effect(() => {
    const currentStep = globalState.selectedStep;
    const currentProjectId = projectStore.currentProject?.id ?? null;
    const enteringStylingStep =
      currentStep === ToolbarStep.Styling &&
      previousStep !== ToolbarStep.Styling;
    const shouldInitStylingElements =
      enteringStylingStep &&
      currentProjectId !== null &&
      stylingElementsInitializedForProject !== currentProjectId;

    const leavingStylingStep =
      previousStep === ToolbarStep.Styling &&
      currentStep !== ToolbarStep.Styling;

    // Only switch zoom mode on actual step transitions, not on initial render.
    // On page refresh, the user's zoom mode preference should be preserved.
    if (previousStep !== null) {
      if (enteringStylingStep) {
        zoomModeStore.setPageMode();
      } else if (leavingStylingStep) {
        zoomModeStore.setMapMode();
      }
    }

    if (shouldInitStylingElements) {
      // untrack: these calls read+write s.items; tracking them would cause
      // a write-triggers-read loop. currentStep/projectId are the right triggers.
      untrack(() => {
        const hasPageElements = getAnnotationsState().items.some(
          (item) => item.role != null
        );
        if (hasPageElements) {
          annotationsActions.setPageElementsVisibility(true);
        } else {
          annotationsActions.initPageElements({
            withPlaceholders: true,
            visible: true
          });
        }
      });
      stylingElementsInitializedForProject = currentProjectId;
    }

    previousStep = currentStep;
  });
</script>

<Theme persist />

{#if isLoading}
  <AppLoader />
{:else}
  <Header />

  <Sidenav />

  <KeyboardShortcuts />

  <main class:mobile-view={globalState.isMobileView}>
    <CreateProject
      open={!isLoading && globalState.isCreateProjectModalOpen}
      onClose={handleCloseModal}
    />

    {#if !globalState.isMobileView}
      <StepToolbar />
    {/if}

    <article
      class="main-content"
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
          <div class="page-scale-layer" style={pageScaleStyle}>
            <div class="page-content-wrapper">
              {@render children()}
            </div>
          </div>
        </div>
      </div>

      <ZoomToolbar />

      <MobileOpenPanelButton />

      {#if projectStore.isDirty}
        <div class="unsaved-indicator">
          <Tag type="warm-gray" size="sm" icon={WarningAltFilled}>
            {m.unsaved_changes_notice()}
          </Tag>
        </div>
      {/if}

      {#if isColorBlindnessActive}
        <div class="colorblind-notification">
          <div class="colorblind-notification-content">
            <strong>{m.colorblind_notification_title()}</strong>
            <p>{m.colorblind_notification_message()}</p>
            <Button
              kind="ghost"
              size="small"
              on:click={handleDeactivateColorBlindness}
            >
              {m.colorblind_deactivate()}
            </Button>
          </div>
        </div>
      {/if}
    </article>

    {#if globalState.isMobileView}
      <MobileToolbar />
    {:else}
      <MainToolbar />
    {/if}

    <MapTooltipOverlay />
    <NotificationContainer />
    <PwaUpdatePrompt />
    <ConsentBanner />
  </main>
{/if}

<style>
  main {
    margin-top: var(--cds-header-height);
    position: relative;
    display: flex;
    height: calc(100dvh - var(--cds-header-height));
    overflow: visible;
    background-color: var(--cds-ui-01);
  }

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

  .mobile-view .main-content {
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

  .unsaved-indicator {
    position: absolute;
    top: var(--cds-spacing-03);
    right: var(--cds-spacing-03);
    z-index: var(--z-content);
    pointer-events: none;
    opacity: 0.85;
  }

  .colorblind-notification {
    position: absolute;
    bottom: var(--cds-spacing-05);
    right: var(--cds-spacing-05);
    z-index: var(--z-content);
  }

  .colorblind-notification-content {
    background: var(--cds-ui-01);
    border: 1px solid var(--cds-border-subtle);
    border-left: 3px solid var(--cds-support-warning, #f1c21b);
    padding: var(--cds-spacing-04);
    max-width: 320px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
  }

  .colorblind-notification-content strong {
    display: block;
    margin-bottom: var(--cds-spacing-02);
    font-size: 0.875rem;
  }

  .colorblind-notification-content p {
    font-size: 0.75rem;
    color: var(--cds-text-secondary);
    margin-bottom: var(--cds-spacing-03);
    line-height: 1.3;
  }
</style>
