<script lang="ts">
  import { onMount } from 'svelte';
  import { globalActions, globalState } from '../store/global.svelte';
  import { mapInstanceStore } from '../store/map-instance.store.svelte';
  import { createProjectActions } from '../store/create-project.store.svelte';
  import { projectStore } from '../store/project.store.svelte';
  import { ToolbarState, ToolbarStep } from '../types/global';

  const NAVIGATION_SHORTCUTS: Record<string, ToolbarStep> = {
    '1': ToolbarStep.Data,
    '2': ToolbarStep.Visualizations,
    '3': ToolbarStep.Styling
  };

  let isMapZoomActive = $state(true);

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
          if (isMapZoomActive) {
            mapInstanceStore.map?.zoomIn();
          } else {
            globalActions.zoomInPage();
          }
          return true;

        case '-':
          if (isMapZoomActive) {
            mapInstanceStore.map?.zoomOut();
          } else {
            globalActions.zoomOutPage();
          }
          return true;

        case '0':
          if (isMapZoomActive) {
            const baseZoom = mapInstanceStore.baseZoomLevel;
            mapInstanceStore.map?.setZoom(baseZoom);
          } else {
            globalActions.resetPageZoom();
          }
          return true;

        default:
          return false;
      }
    }

    function handleZoomModeToggle(): void {
      isMapZoomActive = !isMapZoomActive;
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
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.shiftKey) {
        if (event.key === 'n' || event.key === 'N') {
          event.preventDefault();
          handleNewProject();
          return;
        }
        if (event.key === 'o' || event.key === 'O') {
          event.preventDefault();
          handleOpenProject();
          return;
        }
        if (event.key === 'd' || event.key === 'D') {
          event.preventDefault();
          handleDuplicateProject();
          return;
        }
        if (event.key === 'Backspace') {
          event.preventDefault();
          handleDeleteProject();
          return;
        }
      }

      if (
        (event.ctrlKey || event.metaKey) &&
        (event.key === 's' || event.key === 'S')
      ) {
        event.preventDefault();
        handleSaveProject();
      }
    }

    function handleWheel(event: WheelEvent): void {
      if (!(event.ctrlKey || event.metaKey)) {
        return;
      }

      event.preventDefault();

      if (event.deltaY < 0) {
        if (isMapZoomActive) {
          mapInstanceStore.map?.zoomIn();
        } else {
          globalActions.zoomInPage();
        }
      } else {
        if (isMapZoomActive) {
          mapInstanceStore.map?.zoomOut();
        } else {
          globalActions.zoomOutPage();
        }
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
