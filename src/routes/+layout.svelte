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
      if (ENABLE_BEFOREUNLOAD_CONFIRMATION) {
        window.removeEventListener(EVENT.BEFOREUNLOAD, handleBeforeUnload);
      }
      ariaObserver.disconnect();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  });

  function handleCloseModal() {
    globalState.isCreateProjectModalOpen = false;
  }

  const colorBlindnessState = $derived(getColorBlindnessState());
  const isColorBlindnessActive = $derived(
    colorBlindnessState.simulationType !== ColorBlindnessType.NONE
  );

  function handleDeactivateColorBlindness() {
    colorBlindnessActions.setSimulationType(ColorBlindnessType.NONE);
  }

  const pageZoomScale = $derived(globalState.zoom.pageZoomLevel / 100);
  const pagePan = $derived(globalState.zoom.pagePanOffset);
  const pageTransformStyle = $derived(
    pagePan.x === 0 && pagePan.y === 0
      ? `transform: scale(${pageZoomScale}); transform-origin: center center;`
      : `transform: translate(${pagePan.x}px, ${pagePan.y}px) scale(${pageZoomScale}); transform-origin: center center;`
  );

  const MIDDLE_BUTTON = 1;
  let pageDragState = $state<{ lastX: number; lastY: number } | null>(null);

  function handleMainContentPointerDown(event: PointerEvent): void {
    if (event.button !== MIDDLE_BUTTON) return;
    event.preventDefault();
    pageDragState = { lastX: event.clientX, lastY: event.clientY };
    window.addEventListener(EVENT.POINTERMOVE, handlePagePanMove);
    window.addEventListener(EVENT.POINTERUP, handlePagePanUp);
  }

  function handlePagePanMove(event: PointerEvent): void {
    if (!pageDragState) return;
    const dx = event.clientX - pageDragState.lastX;
    const dy = event.clientY - pageDragState.lastY;
    pageDragState = { lastX: event.clientX, lastY: event.clientY };
    globalActions.panPageBy(dx, dy);
  }

  function handlePagePanUp(): void {
    pageDragState = null;
    window.removeEventListener(EVENT.POINTERMOVE, handlePagePanMove);
    window.removeEventListener(EVENT.POINTERUP, handlePagePanUp);
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
      class:page-panning={pageDragState !== null}
      onpointerdown={handleMainContentPointerDown}
    >
      <div class="page-content-wrapper" style={pageTransformStyle}>
        {@render children()}
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
    overflow: hidden;
    background-color: var(--cds-ui-01);
  }

  main.mobile-view {
    padding-bottom: calc(60px + env(safe-area-inset-bottom, 0px));
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

  .page-content-wrapper {
    flex: 1;
    min-width: 0;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.2s ease-in-out;
    overflow: visible;
    padding: var(--cds-spacing-03) var(--cds-spacing-05);
  }

  .page-panning .page-content-wrapper {
    transition: none;
  }

  .page-panning {
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
