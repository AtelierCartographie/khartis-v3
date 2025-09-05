<script lang="ts">
  import { onMount } from 'svelte';
  import { globalActions, globalState } from '../store/global.svelte';
  import { ZoomMode } from '../types/global';

  onMount(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      // Vérifier si l'utilisateur tape dans un input ou textarea
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.contentEditable === 'true'
      ) {
        return;
      }

      // Raccourcis pour le zoom
      if (event.ctrlKey || event.metaKey) {
        switch (event.key) {
          case '+':
          case '=':
            event.preventDefault();
            globalActions.zoomIn();
            console.log('Keyboard zoom in');
            break;
          case '-':
            event.preventDefault();
            globalActions.zoomOut();
            console.log('Keyboard zoom out');
            break;
          case '0':
            event.preventDefault();
            globalActions.resetZoom();
            console.log('Keyboard zoom reset');
            break;
        }
      }

      // Raccourci pour changer le mode de zoom (Alt + Z)
      if (event.altKey && event.key === 'z') {
        event.preventDefault();
        const newMode =
          globalState.zoom.mode === ZoomMode.Map ? ZoomMode.Page : ZoomMode.Map;
        globalActions.setZoomMode(newMode);
        console.log(`Keyboard switch to ${newMode} mode`);
      }
    }

    // Gérer le zoom avec la molette (Ctrl + wheel)
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

<!-- Ce composant n'a pas de rendu visuel, il gère juste les événements globaux -->
