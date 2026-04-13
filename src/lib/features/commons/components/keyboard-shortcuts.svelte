<script lang="ts">
  import { onMount } from 'svelte';
  import { globalActions, globalState } from '../store/global.svelte';
  import { mapInstanceStore } from '../store/map-instance.store.svelte';
  import { zoomModeStore } from '../store/zoom-mode.store.svelte';
  import { createProjectActions } from '../store/create-project.store.svelte';
  import { projectStore } from '../store/project.store.svelte';
  import { ToolbarState, ToolbarStep } from '../types/global';
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

    function isInputField(target: HTMLElement): boolean {
      return (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.contentEditable === 'true'
      );
    }

    function handleEscapeKey(): boolean {
      if (globalState.isCreateProjectModalOpen) {
        globalState.isCreateProjectModalOpen = false;
        return true;
      }

      if (globalState.toolbarState === ToolbarState.Full) {
        globalActions.setToolbarState(ToolbarState.Collapsed);
        return true;
      }

      if (globalState.selectedTool) {
        globalState.selectedTool = undefined;
        return true;
      }

      return false;
    }

    function handleNavigationKey(key: string): void {
      const step = NAVIGATION_SHORTCUTS[key];
      if (!step) return;

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

    function handleNewProject(): void {
      createProjectActions.selectTab(1);
      globalState.isCreateProjectModalOpen = true;
    }

    function handleOpenProject(): void {
      createProjectActions.selectTab(2);
      globalState.isCreateProjectModalOpen = true;
    }

    async function handleSaveProject(): Promise<void> {
      if (!projectStore.currentProject) return;
      await projectStore.saveCurrentProject();
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
        handleSaveProject();
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

    document.addEventListener(EVENT.KEYDOWN, handleKeyDown);
    document.addEventListener(EVENT.WHEEL, handleWheel, {
      passive: false,
      capture: true
    });

    return () => {
      document.removeEventListener(EVENT.KEYDOWN, handleKeyDown);
      document.removeEventListener(EVENT.WHEEL, handleWheel, { capture: true });
    };
  });
</script>
