<script lang="ts">
  import { onMount } from 'svelte';
  import { globalActions, globalState } from '../store/global.svelte';
  import { ToolbarState, ToolbarStep, ZoomMode } from '../types/global';

  const NAVIGATION_SHORTCUTS: Record<string, ToolbarStep> = {
    '1': ToolbarStep.Data,
    '2': ToolbarStep.Visualizations,
    '3': ToolbarStep.Styling
  };

  onMount(() => {
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
      if (globalState.toolbarState === ToolbarState.Collapsed) {
        globalActions.setToolbarState(ToolbarState.Full);
      }
    }

    function handleZoomKey(key: string): boolean {
      switch (key) {
        case '+':

        // fallthrough
        case '=':
          globalActions.zoomIn();
          return true;

        case '-':
          globalActions.zoomOut();
          return true;

        case '0':
          globalActions.resetZoom();
          return true;

        default:
          return false;
      }
    }

    function handleZoomModeToggle(): void {
      const newMode =
        globalState.zoom.mode === ZoomMode.Map ? ZoomMode.Page : ZoomMode.Map;
      globalActions.setZoomMode(newMode);
    }

    function handleKeyDown(event: KeyboardEvent): void {
      const target = event.target as HTMLElement;

      if (event.key === 'Escape') {
        const handled = handleEscapeKey();
        if (handled) {
          event.preventDefault();
        }
        return;
      }

      if (isInputField(target)) {
        return;
      }

      const hasModifier = event.ctrlKey || event.metaKey || event.altKey;

      if (!hasModifier && event.key in NAVIGATION_SHORTCUTS) {
        event.preventDefault();
        handleNavigationKey(event.key);
        return;
      }

      if ((event.ctrlKey || event.metaKey) && handleZoomKey(event.key)) {
        event.preventDefault();
        return;
      }

      if (event.altKey && event.key === 'z') {
        event.preventDefault();
        handleZoomModeToggle();
      }
    }

    function handleWheel(event: WheelEvent): void {
      if (!(event.ctrlKey || event.metaKey)) {
        return;
      }

      event.preventDefault();

      if (event.deltaY < 0) {
        globalActions.zoomIn();
      } else {
        globalActions.zoomOut();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('wheel', handleWheel);
    };
  });
</script>
