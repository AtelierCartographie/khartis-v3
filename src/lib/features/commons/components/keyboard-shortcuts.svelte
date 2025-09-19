<script lang="ts">
  import { onMount } from 'svelte';
  import { globalActions, globalState } from '../store/global.svelte';
  import { ZoomMode } from '../types/global';

  onMount(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.contentEditable === 'true'
      ) {
        return;
      }

      if (event.ctrlKey || event.metaKey) {
        switch (event.key) {
          case '+':
          case '=':
            event.preventDefault();
            globalActions.zoomIn();
            break;
          case '-':
            event.preventDefault();
            globalActions.zoomOut();
            break;
          case '0':
            event.preventDefault();
            globalActions.resetZoom();
            break;
        }
      }

      if (event.altKey && event.key === 'z') {
        event.preventDefault();
        const newMode =
          globalState.zoom.mode === ZoomMode.Map ? ZoomMode.Page : ZoomMode.Map;
        globalActions.setZoomMode(newMode);
      }
    }

    function handleWheel(event: WheelEvent): void {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();

        if (event.deltaY < 0) {
          globalActions.zoomIn();
        } else {
          globalActions.zoomOut();
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
