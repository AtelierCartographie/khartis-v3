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
  import { duckDBOrchestrator } from '$lib/features/duckdb';
  import { basemapService } from '$lib/features/map/services/basemap.service.svelte';
  import { EVENT } from '$lib/features/commons/constants/dom.constants';

  initializeStores();
  import { setLocale, locales, cookieName } from '$lib/paraglide/runtime.js';
  import Header from '$lib/features/header/header.svelte';
  import MainToolbar from '$lib/features/main-toolbar/main-toolbar.svelte';
  import MobileToolbar from '$lib/features/main-toolbar/mobile-toolbar.svelte';
  import MobileOpenPanelButton from '$lib/features/map/components/mobile-open-panel-button.svelte';
  import ZoomToolbar from '$lib/features/map/components/zoom-toolbar.svelte';
  import Sidenav from '$lib/features/side-nav.svelte';
  import {
    annotationsActions,
    getAnnotationsState
  } from '$lib/features/step-toolbar/tools/annotations/annotations.store.svelte';
  import StepToolbar from '$lib/features/step-toolbar/step-toolbar.svelte';
  import { Tag, Theme } from 'carbon-components-svelte';
  import { WarningAltFilled } from 'carbon-icons-svelte';
  import { onMount } from 'svelte';
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

    const initApp = async () => {
      try {
        await duckDBOrchestrator.initialize();
        await basemapService.initialize();
        isLoading = false;

        logger.info(
          'App ready - continuing background initialization',
          LogCategory.SYSTEM
        );
      } catch (error) {
        logger.error(
          'DuckDB initialization failed - application cannot continue',
          LogCategory.DUCKDB,
          error
        );
        isLoading = false;
        globalState.isCreateProjectModalOpen = true;
        return;
      }

      try {
        await projectStore.waitForInit();
        await dataOrchestratorService.initialize();

        if (!projectStore.currentProject) {
          globalState.isCreateProjectModalOpen = true;
        }

        logger.success(
          'Background initialization complete',
          LogCategory.SYSTEM
        );
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

    return () => {
      window.removeEventListener(EVENT.RESIZE, handleResize);
      if (ENABLE_BEFOREUNLOAD_CONFIRMATION) {
        window.removeEventListener(EVENT.BEFOREUNLOAD, handleBeforeUnload);
      }
    };
  });

  function handleCloseModal() {
    globalState.isCreateProjectModalOpen = false;
  }

  const pageZoomScale = $derived(globalState.zoom.pageZoomLevel / 100);
  const pageTransformStyle = $derived(
    `transform: scale(${pageZoomScale}); transform-origin: center center;`
  );

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

    if (shouldInitStylingElements) {
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

    <article class="main-content">
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
    </article>

    {#if globalState.isMobileView}
      <MobileToolbar />
    {:else}
      <MainToolbar />
    {/if}

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

  .unsaved-indicator {
    position: absolute;
    top: var(--cds-spacing-03);
    right: var(--cds-spacing-03);
    z-index: var(--z-content);
    pointer-events: none;
    opacity: 0.85;
  }
</style>
