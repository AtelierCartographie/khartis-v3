<script lang="ts">
  import KeyboardShortcuts from '$lib/features/commons/components/keyboard-shortcuts.svelte';
  import NotificationContainer from '$lib/features/commons/components/notification-container.svelte';
  import PwaUpdatePrompt from '$lib/features/commons/components/pwa-update-prompt.svelte';
  import { dataOrchestratorService } from '$lib/features/commons/services/data-orchestrator.service.svelte';
  import { globalState } from '$lib/features/commons/store/global.svelte';
  import { projectStore } from '$lib/features/commons/store/project.store.svelte';
  import { LogCategory, logger } from '$lib/features/commons/utils/logger';
  import CreateProject from '$lib/features/create-project/create-project.svelte';
  import DataTypeSelectionModal from '$lib/features/commons/components/data-type-selection/data-type-selection-modal.svelte';
  import { duckDBOrchestrator } from '$lib/features/duckdb';
  import Header from '$lib/features/header/header.svelte';
  import Logo from '$lib/features/header/logo.svelte';
  import MainToolbar from '$lib/features/main-toolbar/main-toolbar.svelte';
  import ZoomToolbar from '$lib/features/map/components/zoom-toolbar.svelte';
  import Sidenav from '$lib/features/side-nav.svelte';
  import StepToolbar from '$lib/features/step-toolbar/step-toolbar.svelte';
  import { onMount } from 'svelte';

  import 'carbon-components-svelte/css/all.css';

  import '$lib/features/commons/assets/styles/dimension.css';
  import '$lib/features/commons/assets/styles/flex.css';
  import '$lib/features/commons/assets/styles/global.css';
  import '$lib/features/commons/assets/styles/spacing.css';
  import '$lib/features/commons/assets/styles/theming.css';

  let { children } = $props();
  let isLoading = $state(true);

  onMount(async () => {
    try {
      // Initialize DuckDB WASM runtime (critical for app functionality)
      await duckDBOrchestrator.initialize();

      // Hide loader as soon as DuckDB is ready
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

      logger.success('Background initialization complete', LogCategory.SYSTEM);
    } catch (error) {
      logger.error(
        'Background initialization failed',
        LogCategory.SYSTEM,
        error
      );
      // Show modal to allow user to create a new project
      globalState.isCreateProjectModalOpen = true;
    }
  });

  function handleCloseModal() {
    globalState.isCreateProjectModalOpen = false;
  }

  // Reactive transform style for page zoom
  const pageTransformStyle = $derived(
    `transform: scale(${globalState.zoom.pageZoomLevel / 100}); transform-origin: center center;`
  );
</script>

{#if isLoading}
  <div class="loading-container">
    <div class="loading-inner">
      <Logo />
      <div class="loading-spinner"></div>
    </div>
  </div>
{:else}
  <Header />

  <Sidenav />

  <KeyboardShortcuts />

  <main>
    <article class="main-content">
      <StepToolbar />

      <div class="page-content-wrapper" style={pageTransformStyle}>
        {@render children()}
      </div>

      <ZoomToolbar />

      <div></div>
    </article>

    <CreateProject
      open={!isLoading && globalState.isCreateProjectModalOpen}
      onClose={handleCloseModal}
    />

    <DataTypeSelectionModal />

    <MainToolbar />
    <NotificationContainer />
    <PwaUpdatePrompt />
  </main>
{/if}

<style>
  .loading-container {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: var(--cds-ui-background);
    z-index: 9999;
  }

  .loading-inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--cds-spacing-08);
  }

  .loading-inner :global(#khartis-logo) {
    transform: scale(1.2);
  }

  .loading-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--cds-border-subtle);
    border-top-color: var(--cds-interactive-01);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  main {
    margin-top: var(--cds-header-height);
    position: relative;
    display: flex;
    height: calc(100dvh - var(--cds-header-height));
    overflow: hidden;
    background-color: var(--cds-ui-01);
  }

  .main-content {
    position: relative;
    flex: 1;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--cds-spacing-06);
  }

  .page-content-wrapper {
    flex: 1;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.2s ease-in-out;
  }
</style>
