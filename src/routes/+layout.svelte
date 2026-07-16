<script lang="ts">
  import AppLoader from '$lib/features/commons/components/app-loader.svelte';
  import KeyboardShortcuts from '$lib/features/commons/components/keyboard-shortcuts.svelte';
  import NotificationContainer from '$lib/features/commons/components/notification-container.svelte';
  import CookiebotConsent from '$lib/features/commons/components/cookiebot-consent.svelte';
  import PwaServiceWorker from '$lib/features/commons/components/pwa-service-worker.svelte';
  import WorkspaceViewport from '$lib/features/commons/components/workspace-viewport.svelte';
  import {
    globalActions,
    globalState,
    MOBILE_BREAKPOINT
  } from '$lib/features/commons/stores/global.svelte';
  import { fontAssetsStore } from '$lib/features/commons/stores/font-assets.store.svelte';
  import { createProjectActions } from '$lib/features/commons/stores/create-project.store.svelte';
  import '$lib/features/commons/utils/uuid.utils';
  import { ToolbarStep } from '$lib/features/commons/types/global';
  import { projectStore } from '$lib/features/commons/stores/project.store.svelte';
  import { projectRuntime } from '$lib/features/commons/stores/project/project-runtime.svelte';
  import { initializeStores } from '$lib/features/commons/stores/stores-init';
  import { LogCategory, logger } from '$lib/features/commons/utils/logger';
  import { forceNextMapThumbnailCapture } from '$lib/features/commons/utils/map-thumbnail.utils';
  import { showError } from '$lib/features/commons/utils/notification.utils.svelte';
  import * as m from '$lib/paraglide/messages';
  import { EVENT } from '$lib/features/commons/constants/dom.constants';
  import { persistenceRegistry } from '$lib/features/project-management/core';
  import { factoryResetPwa } from '$lib/features/commons/utils/pwa-reset';

  import '$lib/features/commons/stores/locale.store.svelte';
  import { setLocale, locales, cookieName } from '$lib/paraglide/runtime.js';
  import Header from '$lib/features/header/header.svelte';
  import { MainToolbar, MobileToolbar } from '$lib/features/main-toolbar';
  import MobileOpenPanelButton from '$lib/features/map/components/mobile-open-panel-button.svelte';
  import MapTooltipOverlay from '$lib/features/map/components/map-tooltip-overlay.svelte';
  import ZoomToolbar from '$lib/features/map/components/zoom-toolbar.svelte';
  import Sidenav from '$lib/features/side-nav/side-nav.svelte';
  import {
    annotationsActions,
    getAnnotationsState
  } from '$lib/features/step-toolbar/tools/annotations/annotations.store.svelte';
  import {
    colorBlindnessActions,
    getColorBlindnessState,
    isColorBlindnessActive
  } from '$lib/features/step-toolbar/tools/color-blindness/color-blindness.store.svelte';
  import { zoomModeStore } from '$lib/features/commons/stores/zoom-mode.store.svelte';
  import StepToolbar from '$lib/features/step-toolbar/step-toolbar.svelte';
  import { Modal, Theme } from 'carbon-components-svelte';
  import GlobalLoadingIndicator from '$lib/features/commons/components/global-loading-indicator.svelte';
  import { onMount, untrack } from 'svelte';
  import { replaceState } from '$app/navigation';
  import { page } from '$app/state';
  import ColorBlindnessNotification from '$lib/features/step-toolbar/tools/color-blindness/color-blindness-notification.svelte';
  import CreateProject from '$lib/features/create-project/create-project.svelte';
  import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
  import { basemapService } from '$lib/features/map/services/basemap.service.svelte';
  import { dataOrchestratorService } from '$lib/features/commons/services/data-orchestrator.service.svelte';

  import '$lib/features/commons/assets/styles/dimension.css';
  import '$lib/features/commons/assets/styles/flex.css';
  import '$lib/features/commons/assets/styles/fonts.css';
  import 'carbon-components-svelte/css/all.css';
  import '$lib/features/commons/assets/styles/global.css';
  import '$lib/features/commons/assets/styles/figma-tokens.css';
  import '$lib/features/commons/assets/styles/spacing.css';
  import '$lib/features/commons/assets/styles/theming.css';

  initializeStores();

  type PendingKhImport = {
    khProjectUrl: string;
    startDataServices: () => Promise<void>;
  };

  const PWA_RECOVERY_FLUSH_TIMEOUT_MS = 10_000;

  let { children } = $props();
  let isLoading = $state(true);
  let pendingKhImport = $state<PendingKhImport | null>(null);
  let previousStep = $state<ToolbarStep | null>(null);
  let stylingElementsInitializedForProject = $state<string | null>(null);

  const handleResize = () => {
    globalActions.setMobileView(window.innerWidth < MOBILE_BREAKPOINT);
  };

  function removeKhUrlParameter(): void {
    const url = new URL(window.location.href);
    url.searchParams.delete('kh');
    replaceState(`${url.pathname}${url.search}${url.hash}`, page.state);
  }

  $effect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle(
        'mobile-view',
        globalState.isMobileView
      );
    }
  });

  // `?kh=` imports a remote .kh through the regular browser import path.
  async function importProjectFromKhUrl(
    khProjectUrl: string,
    startDataServices: () => Promise<void>
  ): Promise<void> {
    try {
      await startDataServices();
      const response = await fetch(khProjectUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const blob = await response.blob();
      const fileName =
        khProjectUrl.split('/').pop()?.split('?')[0] || 'project.kh';
      const file = new File([blob], fileName, { type: 'application/zip' });
      await projectStore.importProject(file);
      removeKhUrlParameter();
    } catch (error) {
      logger.error('Failed to import project from kh URL', LogCategory.SYSTEM, {
        khProjectUrl,
        error
      });
      showError(
        m.project_import_url_error_title(),
        m.project_import_url_error_subtitle()
      );
      if (!projectStore.currentProject) {
        globalState.isCreateProjectModalOpen = true;
      }
    }
  }

  async function loadProjectFromKhUrl(
    khProjectUrl: string,
    startDataServices: () => Promise<void>
  ): Promise<void> {
    if (projectStore.isDirty) {
      pendingKhImport = { khProjectUrl, startDataServices };
      return;
    }

    await importProjectFromKhUrl(khProjectUrl, startDataServices);
  }

  function cancelPendingKhImport(): void {
    pendingKhImport = null;
  }

  async function confirmPendingKhImport(): Promise<void> {
    const pending = pendingKhImport;
    if (!pending) return;

    pendingKhImport = null;
    await importProjectFromKhUrl(
      pending.khProjectUrl,
      pending.startDataServices
    );
  }

  // Preload cartographic fonts only once a project (map) exists — map rendering already
  // gates on fontAssetsStore.ready, so this keeps the ~36 map woff2 off the cold-start path.
  $effect(() => {
    if (projectStore.currentProject) {
      void fontAssetsStore.ensureLoaded();
    }
  });

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

    const handleRescueShortcut = (event: KeyboardEvent) => {
      const isModifier = event.metaKey || event.ctrlKey;
      if (isModifier && event.altKey && event.code === 'KeyR') {
        event.preventDefault();
        event.stopPropagation();
        void factoryResetPwa({ reload: true });
      }
    };
    window.addEventListener(EVENT.KEYDOWN, handleRescueShortcut, {
      capture: true
    });

    const handleLifecycleFlush = () => {
      forceNextMapThumbnailCapture();
      void persistenceRegistry.flush();
    };

    const flushBeforePwaRecovery = async (): Promise<boolean> => {
      forceNextMapThumbnailCapture();
      let timeoutId: ReturnType<typeof setTimeout> | undefined;

      try {
        await Promise.race([
          persistenceRegistry.flush(),
          new Promise<never>((_, reject) => {
            timeoutId = setTimeout(
              () => reject(new Error('PWA recovery save timed out')),
              PWA_RECOVERY_FLUSH_TIMEOUT_MS
            );
          })
        ]);

        if (persistenceRegistry.isDirty) {
          throw new Error('Project persistence is still dirty');
        }

        return true;
      } catch (error) {
        logger.error(
          'PWA recovery stopped because project persistence was not confirmed',
          LogCategory.PERSISTENCE,
          error
        );
        showError(
          m.pwa_update_save_error_title(),
          m.pwa_update_save_error_subtitle()
        );
        return false;
      } finally {
        if (timeoutId !== undefined) {
          clearTimeout(timeoutId);
        }
      }
    };

    window.__khartisFlushBeforePwaRecovery = flushBeforePwaRecovery;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        handleLifecycleFlush();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handleLifecycleFlush);
    window.addEventListener(EVENT.BEFOREUNLOAD, handleLifecycleFlush);

    const initializeDataServices = async () => {
      await duckDBOrchestrator.initialize();
      await basemapService.initialize();
      await dataOrchestratorService.initialize();
    };

    const initApp = async () => {
      let dataServicesReadyPromise: Promise<void> | null = null;

      const startDataServices = () => {
        dataServicesReadyPromise ??= initializeDataServices();
        return dataServicesReadyPromise;
      };

      try {
        await projectStore.waitForInit();
        isLoading = false;

        const khProjectUrl = new URLSearchParams(window.location.search).get(
          'kh'
        );
        if (khProjectUrl) {
          await loadProjectFromKhUrl(khProjectUrl, startDataServices);
          return;
        }

        if (!projectStore.currentProject) {
          globalState.isCreateProjectModalOpen = true;
        }

        startDataServices().catch((error) => {
          logger.error(
            'Background initialization failed',
            LogCategory.SYSTEM,
            error
          );
          showError(
            m.error_data_services_init_title(),
            m.error_data_services_init_message()
          );
          globalState.isCreateProjectModalOpen = true;
        });
      } catch (error) {
        logger.error(
          'Project store initialization failed',
          LogCategory.SYSTEM,
          error
        );
        isLoading = false;
        globalState.isCreateProjectModalOpen = true;
      }
    };

    initApp();

    // Carbon ComboBox renders a listbox wrapper; remap it so ARIA owns options only.
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
      window.removeEventListener(EVENT.KEYDOWN, handleRescueShortcut, {
        capture: true
      });
      ariaObserver.disconnect();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handleLifecycleFlush);
      window.removeEventListener(EVENT.BEFOREUNLOAD, handleLifecycleFlush);
      if (window.__khartisFlushBeforePwaRecovery === flushBeforePwaRecovery) {
        delete window.__khartisFlushBeforePwaRecovery;
      }
    };
  });

  function handleCloseModal() {
    globalState.isCreateProjectModalOpen = false;
    createProjectActions.resetAllTabs();
  }

  const colorBlindnessState = $derived(getColorBlindnessState());
  const hasActiveColorBlindnessSimulation = $derived(
    isColorBlindnessActive(colorBlindnessState)
  );
  let mobileColorBlindnessNotificationDismissed = $state(false);
  const showMobileColorBlindnessNotification = $derived(
    globalState.isMobileView &&
      hasActiveColorBlindnessSimulation &&
      globalState.selectedStep !== ToolbarStep.Styling &&
      !globalState.selectedTool &&
      !mobileColorBlindnessNotificationDismissed
  );
  function handleDeactivateColorBlindness() {
    colorBlindnessActions.reset();
  }

  $effect(() => {
    if (!hasActiveColorBlindnessSimulation) {
      mobileColorBlindnessNotificationDismissed = false;
    }
  });

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

    // Initial render preserves the user's zoom mode preference.
    if (previousStep !== null) {
      if (enteringStylingStep) {
        zoomModeStore.setPageMode();
      } else if (leavingStylingStep) {
        zoomModeStore.setMapMode();
      }
    }

    if (shouldInitStylingElements) {
      // Avoid a read/write loop; currentStep/projectId are the intended triggers.
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
<PwaServiceWorker />

{#if isLoading}
  <AppLoader />
{:else}
  <Header />

  <Sidenav />

  <KeyboardShortcuts />

  <main class:mobile-view={globalState.isMobileView}>
    {#if globalState.isCreateProjectModalOpen}
      <CreateProject open onClose={handleCloseModal} />
    {/if}

    <Modal
      open={pendingKhImport !== null}
      modalHeading={m.project_import_url_confirm_title()}
      primaryButtonText={m.project_import_url_confirm_replace()}
      secondaryButtonText={m.cancel()}
      danger
      size="xs"
      on:click:button--primary={confirmPendingKhImport}
      on:click:button--secondary={cancelPendingKhImport}
      on:close={cancelPendingKhImport}
      on:submit={confirmPendingKhImport}
    >
      <p class="kh-import-confirm-body">
        {m.project_import_url_confirm_discard()}
      </p>
    </Modal>

    {#if !globalState.isMobileView}
      <StepToolbar />
    {/if}

    {#key projectRuntime.runtimeKey}
      {#snippet workspaceOverlays()}
        <ZoomToolbar />

        <MobileOpenPanelButton />

        <GlobalLoadingIndicator />

        {#if showMobileColorBlindnessNotification}
          <div class="colorblind-notification">
            <ColorBlindnessNotification
              ondeactivate={handleDeactivateColorBlindness}
              onclose={() => (mobileColorBlindnessNotificationDismissed = true)}
            />
          </div>
        {/if}
      {/snippet}

      <WorkspaceViewport overlays={workspaceOverlays}>
        {@render children()}
      </WorkspaceViewport>

      {#if globalState.isMobileView}
        <MobileToolbar />
      {:else}
        <MainToolbar />
      {/if}

      <MapTooltipOverlay />
    {/key}

    <NotificationContainer />
    <CookiebotConsent />
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

  .kh-import-confirm-body {
    margin: 0;
  }

  .colorblind-notification {
    position: absolute;
    bottom: calc(var(--cds-spacing-05) + var(--safe-area-bottom));
    right: calc(var(--cds-spacing-05) + var(--safe-area-right));
    z-index: var(--z-content);
    max-width: 320px;
  }

  .colorblind-notification :global(.bx--inline-notification) {
    margin: 0;
    max-width: 100%;
  }

  @media (max-width: 672px) {
    .colorblind-notification {
      left: calc(var(--cds-spacing-05) + var(--safe-area-left));
      right: calc(var(--cds-spacing-05) + var(--safe-area-right));
      max-width: none;
    }
  }
</style>
