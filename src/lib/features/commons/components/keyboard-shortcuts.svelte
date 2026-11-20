<script lang="ts">
  import { onMount } from 'svelte';
  import { globalActions, globalState } from '../stores/global.svelte';
  import { mapInstanceStore } from '../stores/map-instance.store.svelte';
  import { zoomModeStore } from '../stores/zoom-mode.store.svelte';
  import { createProjectActions } from '../stores/create-project.store.svelte';
  import { projectStore } from '../stores/project.store.svelte';
  import { ExportTab, useExportModal } from '$lib/features/header';
  import { selectTool } from '$lib/features/step-toolbar';
  import { formatActions } from '$lib/features/step-toolbar/tools/format';
  import { StylingTools, ToolbarState, ToolbarStep } from '../types/global';
  import {
    detectApplePlatform,
    hasAnyPrimaryModifier,
    hasPlatformPrimaryModifier,
    PRIMARY_KEY_SHORTCUTS,
    resolveShortcutLocale,
    resolveSingleKeyAction,
    type ShortcutAction
  } from '../utils/keyboard-shortcuts.utils';
  import { getLocale } from '$lib/paraglide/runtime';
  import { EVENT, KEY } from '../constants/dom.constants';
  import { stepNumberInputOnShiftArrow } from '../utils/number-input-step.utils';

  const STYLING_TOOL_IDS: readonly string[] = [
    StylingTools.Format,
    StylingTools.Legend,
    StylingTools.GeoIndications,
    StylingTools.Annotations,
    StylingTools.ColorBlindness
  ];
  const TYPING_TARGET_SELECTOR =
    'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"], [role="combobox"]';
  const VISIBLE_MODAL_SELECTOR = '.bx--modal.is-visible';

  const WORKSPACE_SELECTOR = '.workspace-viewport';
  const WHEEL_LINE_HEIGHT_PX = 16;
  const PAGE_WHEEL_STEP_PX = 50;

  function isStylingTool(tool: string | undefined): boolean {
    return tool !== undefined && STYLING_TOOL_IDS.includes(tool);
  }

  onMount(() => {
    const isApplePlatform = detectApplePlatform();

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

    function isTypingTarget(target: EventTarget | null): boolean {
      return (
        target instanceof Element &&
        target.closest(TYPING_TARGET_SELECTOR) !== null
      );
    }

    function isModalOpen(): boolean {
      return (
        globalState.isCreateProjectModalOpen ||
        document.querySelector(VISIBLE_MODAL_SELECTOR) !== null
      );
    }

    function handleEscapeKey(): boolean {
      if (globalState.isCreateProjectModalOpen) {
        createProjectActions.dismissModal();
        return true;
      }

      if (document.querySelector('.bx--modal.is-visible')) {
        return false;
      }

      if (globalState.isSideNavOpen) {
        createProjectActions.dismissSideNav();
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

      return false;
    }

    function handleNavigationStep(step: ToolbarStep): void {
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
        useExportModal().open(ExportTab.PROJECT);
      }
    }

    function runSingleKeyAction(action: ShortcutAction): void {
      switch (action.kind) {
        case 'step':
          handleNavigationStep(action.step);
          return;
        case 'tool':
          selectTool(action.tool);
          return;
        case 'menu':
          if (globalState.isSideNavOpen) {
            createProjectActions.dismissSideNav();
          } else {
            globalState.isSideNavOpen = true;
          }
          return;
        case 'zoomMode':
          zoomModeStore.toggle();
          return;
        case 'toggleGrid':
          formatActions.toggleGrid();
          return;
      }
    }

    function handlePrimaryShortcut(event: KeyboardEvent): boolean {
      const pressed = event.key.toUpperCase();

      switch (pressed) {
        case PRIMARY_KEY_SHORTCUTS.newProject:
          handleNewProject();
          return true;
        case PRIMARY_KEY_SHORTCUTS.openProject:
          handleOpenProject();
          return true;
        case PRIMARY_KEY_SHORTCUTS.saveProject:
          void handleSaveProject();
          return true;
        case PRIMARY_KEY_SHORTCUTS.download:
          useExportModal().open();
          return true;
        default:
          return false;
      }
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (stepNumberInputOnShiftArrow(event)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (event.key === KEY.ESCAPE) {
        if (handleEscapeKey()) {
          event.preventDefault();
        }
        return;
      }

      if (event.isComposing || isModalOpen()) {
        return;
      }

      const hasPrimaryModifier = hasPlatformPrimaryModifier(
        event,
        isApplePlatform
      );

      if (hasPrimaryModifier && !event.altKey && !event.shiftKey) {
        // Project commands also work from a text field, like in any editor.
        if (handlePrimaryShortcut(event)) {
          event.preventDefault();
          return;
        }
      }

      if (isTypingTarget(event.target)) {
        return;
      }

      if (hasPrimaryModifier && handleZoomKey(event.key)) {
        event.preventDefault();
        return;
      }

      if (
        event.key === KEY.QUESTION_MARK &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        event.preventDefault();
        globalState.isShortcutsSheetOpen = true;
        return;
      }

      if (
        event.repeat ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey
      ) {
        return;
      }

      const action = resolveSingleKeyAction(
        event.key,
        resolveShortcutLocale(getLocale()),
        globalState.selectedStep
      );
      if (action) {
        event.preventDefault();
        runSingleKeyAction(action);
      }
    }

    let pageWheelDelta = 0;

    function handlePlainPageWheel(event: WheelEvent): void {
      const target = event.target instanceof Element ? event.target : null;
      if (!zoomModeStore.isPageMode || !target?.closest(WORKSPACE_SELECTOR)) {
        return;
      }

      // In page mode the wheel belongs to the page zoom alone, also between
      // two of its steps.
      event.preventDefault();
      event.stopPropagation();
      // A trackpad fires many small deltas where a mouse notch fires one large
      // one: accumulate so both step the page zoom at a comparable pace.
      const deltaPx =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? event.deltaY * WHEEL_LINE_HEIGHT_PX
          : event.deltaY;
      pageWheelDelta += deltaPx;
      if (Math.abs(pageWheelDelta) < PAGE_WHEEL_STEP_PX) {
        return;
      }

      if (pageWheelDelta < 0) {
        globalActions.zoomInPage();
      } else {
        globalActions.zoomOutPage();
      }
      pageWheelDelta = 0;
    }

    function handleWheel(event: WheelEvent): void {
      if (!hasAnyPrimaryModifier(event)) {
        handlePlainPageWheel(event);
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
