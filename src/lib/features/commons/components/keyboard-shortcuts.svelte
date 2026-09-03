<script lang="ts">
  import { onMount } from 'svelte';
  import { globalActions, globalState } from '../stores/global.svelte';
  import { mapInstanceStore } from '../stores/map-instance.store.svelte';
  import { zoomModeStore } from '../stores/zoom-mode.store.svelte';
  import { createProjectActions } from '../stores/create-project.store.svelte';
  import { projectStore } from '../stores/project.store.svelte';
  import { useExportModal } from '$lib/features/header';
  import {
    StylingTools,
    ToolbarState,
    ToolbarStep,
    VisualizationTools
  } from '../types/global';
  import {
    detectApplePlatform,
    hasAnyPrimaryModifier,
    hasPlatformPrimaryModifier,
    PROJECT_SHORTCUT_TIMEOUT_MS,
    isShortcutCode,
    SHORTCUT_CODE
  } from '../utils/keyboard-shortcuts.utils';
  import { KEY, EVENT } from '../constants/dom.constants';

  const NAVIGATION_SHORTCUTS: Record<string, ToolbarStep> = {
    '1': ToolbarStep.Data,
    '2': ToolbarStep.Visualizations,
    '3': ToolbarStep.Styling
  };
  const STYLING_TOOL_IDS: readonly string[] = [
    StylingTools.Format,
    StylingTools.Legend,
    StylingTools.GeoIndications,
    StylingTools.Annotations,
    StylingTools.ColorBlindness
  ];
  const TOOL_SHORTCUTS_BY_STEP = {
    [ToolbarStep.Visualizations]: {
      '1': VisualizationTools.Search,
      '2': VisualizationTools.Layers,
      '3': VisualizationTools.Projection,
      '4': VisualizationTools.Simplification,
      '5': VisualizationTools.Facets
    },
    [ToolbarStep.Styling]: {
      '1': StylingTools.Format,
      '2': StylingTools.Legend,
      '3': StylingTools.GeoIndications,
      '4': StylingTools.Annotations,
      '5': StylingTools.ColorBlindness
    }
  } as const;

  function isStylingTool(tool: string | undefined): boolean {
    return tool !== undefined && STYLING_TOOL_IDS.includes(tool);
  }

  onMount(() => {
    const isApplePlatform = detectApplePlatform();
    let projectShortcutExpiresAt = 0;

    function clearProjectShortcutPrefix(): void {
      projectShortcutExpiresAt = 0;
    }

    function hasProjectShortcutPrefix(): boolean {
      return projectShortcutExpiresAt > Date.now();
    }

    function setProjectShortcutPrefix(): void {
      projectShortcutExpiresAt = Date.now() + PROJECT_SHORTCUT_TIMEOUT_MS;
    }

    function clearSelectedTool(): void {
      const selectedTool = globalState.selectedTool;
      if (!selectedTool) {
        return;
      }

      globalActions.setSelectedTool(undefined);
      if (isStylingTool(selectedTool)) {
        globalActions.resetPagePan();
      }
    }

    function isInputField(target: HTMLElement): boolean {
      return (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.contentEditable === 'true'
      );
    }

    function handleEscapeKey(): boolean {
      if (globalState.isCreateProjectModalOpen) {
        globalState.isCreateProjectModalOpen = false;
        createProjectActions.resetAllTabs();
        return true;
      }

      if (document.querySelector('.bx--modal.is-visible')) {
        return false;
      }

      if (globalState.isSideNavOpen) {
        globalState.isSideNavOpen = false;
        return true;
      }

      if (globalState.isMobileToolbarOpen) {
        globalActions.closeMobileToolbar();
        return true;
      }

      if (globalState.selectedTool) {
        clearSelectedTool();
        return true;
      }

      if (globalState.toolbarState === ToolbarState.Full) {
        globalActions.setToolbarState(ToolbarState.Collapsed);
        return true;
      }

      return false;
    }

    function handleNavigationKey(key: string): void {
      const step = NAVIGATION_SHORTCUTS[key];
      if (!step) return;

      clearSelectedTool();
      globalActions.setNavigationState(step);
      if (
        step !== ToolbarStep.Styling &&
        globalState.toolbarState === ToolbarState.Collapsed
      ) {
        globalActions.setToolbarState(ToolbarState.Full);
      }
    }

    function handleZoomKey(key: string): boolean {
      switch (key) {
        case KEY.PLUS:
        case KEY.EQUALS:
          if (zoomModeStore.isMapMode) {
            mapInstanceStore.zoomIn();
          } else {
            globalActions.zoomInPage();
          }
          return true;

        case KEY.MINUS:
          if (zoomModeStore.isMapMode) {
            mapInstanceStore.zoomOut();
          } else {
            globalActions.zoomOutPage();
          }
          return true;

        case KEY.ZERO:
          if (zoomModeStore.isMapMode) {
            mapInstanceStore.resetZoom();
          } else {
            globalActions.resetPageZoom();
          }
          return true;

        default:
          return false;
      }
    }

    function handleZoomModeToggle(): void {
      zoomModeStore.toggle();
    }

    function handleToolShortcut(event: KeyboardEvent): boolean {
      const shortcuts =
        TOOL_SHORTCUTS_BY_STEP[
          globalState.selectedStep as keyof typeof TOOL_SHORTCUTS_BY_STEP
        ];
      const tool = shortcuts?.[event.key as keyof typeof shortcuts];
      if (!tool) return false;

      event.preventDefault();
      globalActions.setSelectedTool(tool);
      return true;
    }

    function handleNewProject(): void {
      createProjectActions.resetAllTabs();
      createProjectActions.selectTab(1);
      globalState.isCreateProjectModalOpen = true;
    }

    function handleOpenProject(): void {
      createProjectActions.resetAllTabs();
      createProjectActions.selectTab(2);
      globalState.isCreateProjectModalOpen = true;
    }

    async function handleSaveProject(): Promise<void> {
      if (!projectStore.currentProject) return;
      try {
        await projectStore.saveCurrentProject();
      } finally {
        useExportModal().open();
      }
    }

    function handleDuplicateProject(): void {
      if (!projectStore.currentProject) return;
      globalState.isDuplicateModalOpen = true;
    }

    function handleDeleteProject(): void {
      if (!projectStore.currentProject) return;
      globalState.isDeleteModalOpen = true;
    }

    function handleOpenSideNav(): void {
      globalState.isSideNavOpen = true;
    }

    function handleProjectShortcutChord(event: KeyboardEvent): boolean {
      if (!hasProjectShortcutPrefix()) {
        return false;
      }

      if (event.metaKey || event.altKey || event.shiftKey) {
        clearProjectShortcutPrefix();
        return false;
      }

      if (isShortcutCode(event.code, SHORTCUT_CODE.openSideNav)) {
        event.preventDefault();
        handleOpenSideNav();
        clearProjectShortcutPrefix();
        return true;
      }

      if (isShortcutCode(event.code, SHORTCUT_CODE.newProject)) {
        event.preventDefault();
        handleNewProject();
        clearProjectShortcutPrefix();
        return true;
      }

      if (isShortcutCode(event.code, SHORTCUT_CODE.openProject)) {
        event.preventDefault();
        handleOpenProject();
        clearProjectShortcutPrefix();
        return true;
      }

      if (isShortcutCode(event.code, SHORTCUT_CODE.duplicateProject)) {
        event.preventDefault();
        handleDuplicateProject();
        clearProjectShortcutPrefix();
        return true;
      }

      if (isShortcutCode(event.code, SHORTCUT_CODE.deleteProject)) {
        event.preventDefault();
        handleDeleteProject();
        clearProjectShortcutPrefix();
        return true;
      }

      if (isShortcutCode(event.code, SHORTCUT_CODE.saveProject)) {
        event.preventDefault();
        void handleSaveProject();
        clearProjectShortcutPrefix();
        return true;
      }

      clearProjectShortcutPrefix();
      return false;
    }

    function handleKeyDown(event: KeyboardEvent): void {
      const target = event.target as HTMLElement;

      if (event.key === KEY.ESCAPE) {
        const handled = handleEscapeKey();
        if (handled) {
          event.preventDefault();
        }
        return;
      }

      if (isInputField(target)) {
        return;
      }

      if (handleProjectShortcutChord(event)) {
        return;
      }

      const hasShortcutModifier = hasPlatformPrimaryModifier(
        event,
        isApplePlatform
      );
      const hasModifier = hasShortcutModifier || event.altKey;

      if (!hasModifier && event.key in NAVIGATION_SHORTCUTS) {
        event.preventDefault();
        handleNavigationKey(event.key);
        return;
      }

      if (
        event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        handleToolShortcut(event)
      ) {
        return;
      }

      if (hasShortcutModifier && handleZoomKey(event.key)) {
        event.preventDefault();
        return;
      }

      if (
        hasShortcutModifier &&
        !event.altKey &&
        isShortcutCode(event.code, SHORTCUT_CODE.undo)
      ) {
        if (event.shiftKey) {
          event.preventDefault();
          projectStore.redo();
          return;
        }
        event.preventDefault();
        projectStore.undo();
        return;
      }

      if (
        hasShortcutModifier &&
        !event.altKey &&
        !event.shiftKey &&
        isShortcutCode(event.code, SHORTCUT_CODE.redo)
      ) {
        event.preventDefault();
        projectStore.redo();
        return;
      }

      if (
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        event.altKey &&
        isShortcutCode(event.code, SHORTCUT_CODE.zoomModeToggle)
      ) {
        event.preventDefault();
        handleZoomModeToggle();
        return;
      }

      const startsProjectShortcutPrefix =
        event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !event.shiftKey &&
        isShortcutCode(event.code, SHORTCUT_CODE.projectPrefix);

      if (startsProjectShortcutPrefix) {
        event.preventDefault();
        setProjectShortcutPrefix();
        return;
      }
    }

    function handleWheel(event: WheelEvent): void {
      if (!hasAnyPrimaryModifier(event)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (event.deltaY < 0) {
        if (zoomModeStore.isMapMode) {
          mapInstanceStore.zoomIn();
        } else {
          globalActions.zoomInPage();
        }
      } else if (event.deltaY > 0) {
        if (zoomModeStore.isMapMode) {
          mapInstanceStore.zoomOut();
        } else {
          globalActions.zoomOutPage();
        }
      }
    }

    document.addEventListener(EVENT.KEYDOWN, handleKeyDown, {
      capture: true
    });
    document.addEventListener(EVENT.WHEEL, handleWheel, {
      passive: false,
      capture: true
    });

    return () => {
      document.removeEventListener(EVENT.KEYDOWN, handleKeyDown, {
        capture: true
      });
      document.removeEventListener(EVENT.WHEEL, handleWheel, { capture: true });
    };
  });
</script>
