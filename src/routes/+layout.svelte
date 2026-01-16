<script lang="ts">
  import AppLoader from '$lib/features/commons/components/app-loader.svelte';
  import KeyboardShortcuts from '$lib/features/commons/components/keyboard-shortcuts.svelte';
  import NotificationContainer from '$lib/features/commons/components/notification-container.svelte';
  import PwaUpdatePrompt from '$lib/features/commons/components/pwa-update-prompt.svelte';
  import { dataOrchestratorService } from '$lib/features/commons/services/data-orchestrator.service.svelte';
  import {
    globalActions,
    globalState,
    MOBILE_BREAKPOINT
  } from '$lib/features/commons/store/global.svelte';
  import { projectStore } from '$lib/features/commons/store/project.store.svelte';
  import { LogCategory, logger } from '$lib/features/commons/utils/logger';
  import CreateProject from '$lib/features/create-project/create-project.svelte';
  import { duckDBOrchestrator } from '$lib/features/duckdb';
  import { basemapService } from '$lib/features/map/services/basemap.service.svelte';
  import { setLocale, locales, cookieName } from '$lib/paraglide/runtime.js';
  import Header from '$lib/features/header/header.svelte';
  import MainToolbar from '$lib/features/main-toolbar/main-toolbar.svelte';
  import MobileToolbar from '$lib/features/main-toolbar/mobile-toolbar.svelte';
  import MobileOpenPanelButton from '$lib/features/map/components/mobile-open-panel-button.svelte';
  import ZoomToolbar from '$lib/features/map/components/zoom-toolbar.svelte';
  import Sidenav from '$lib/features/side-nav.svelte';
  import StepToolbar from '$lib/features/step-toolbar/step-toolbar.svelte';
  import { Theme } from 'carbon-components-svelte';
  import { onMount } from 'svelte';

  import 'carbon-components-svelte/css/all.css';

  import '$lib/features/commons/assets/styles/dimension.css';
  import '$lib/features/commons/assets/styles/flex.css';
  import '$lib/features/commons/assets/styles/global.css';
  import '$lib/features/commons/assets/styles/spacing.css';
  import '$lib/features/commons/assets/styles/theming.css';

  let { children } = $props();
  let isLoading = $state(true);

  const handleResize = () => {
    globalActions.setMobileView(window.innerWidth < MOBILE_BREAKPOINT);
  };

  onMount(() => {
    // Auto-detect browser language on first load (if no cookie is set)
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

    // Initialize tab state from URL query params
    globalActions.initializeFromUrl();

    handleResize();
    window.addEventListener('resize', handleResize);

    const initApp = async () => {
      try {
        // Initialize DuckDB WASM runtime (critical for app functionality)
        await duckDBOrchestrator.initialize();

        // Initialize basemap service (loads metadata catalog for world background)
        await basemapService.initialize();

        // Hide loader as soon as DuckDB and basemaps are ready
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

      // Continue initialization in background (non-blocking)
      try {
        // Wait for project store to initialize from IndexedDB
        await projectStore.waitForInit();

        // Initialize data orchestrator to process any existing files
        await dataOrchestratorService.initialize();

        // Show modal only if no project exists
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
        // Show modal to allow user to create a new project
        globalState.isCreateProjectModalOpen = true;
      }
    };

    initApp();

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  });

  function handleCloseModal() {
    globalState.isCreateProjectModalOpen = false;
  }

  // Reactive transform style for page zoom
  // Note: The map component must apply a counter-transform to preserve pointer event coordinates
  const pageZoomScale = $derived(globalState.zoom.pageZoomLevel / 100);
  const pageTransformStyle = $derived(
    `transform: scale(${pageZoomScale}); transform-origin: center center;`
  );
</script>

<Theme persist />

{#if isLoading}
  <AppLoader />
{:else}
  <Header />

  <Sidenav />

  <KeyboardShortcuts />

  <main class:mobile-view={globalState.isMobileView}>
    <article class="main-content">
      {#if !globalState.isMobileView}
        <StepToolbar />
      {/if}

      <div class="page-content-wrapper" style={pageTransformStyle}>
        {@render children()}
      </div>

      <ZoomToolbar />

      <MobileOpenPanelButton />

      <div></div>
    </article>

    <CreateProject
      open={!isLoading && globalState.isCreateProjectModalOpen}
      onClose={handleCloseModal}
    />

    {#if globalState.isMobileView}
      <MobileToolbar />
    {:else}
      <MainToolbar />
    {/if}
    <NotificationContainer />
    <PwaUpdatePrompt />
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
    justify-content: space-between;
    gap: var(--cds-spacing-06);
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
    padding: var(--cds-spacing-05);
  }
</style>
