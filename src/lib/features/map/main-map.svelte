<script lang="ts">
  import placeholderGlobe from '$lib/features/commons/assets/images/commons/placeholder-globe.png';
  import { globalActions, globalState } from '../commons/store/global.svelte';
  import { ZoomMode } from '../commons/types/global';

  const transformStyle = $derived(
    globalState.zoom.mode === ZoomMode.Map
      ? `transform: scale(${globalState.zoom.mapZoomLevel}); transform-origin: center center;`
      : ''
  );

  function handleDoubleClick(): void {
    if (globalState.zoom.mode === ZoomMode.Map) {
      globalActions.resetZoom();
    }
  }

  function handleWheel(event: WheelEvent): void {
    if (globalState.zoom.mode !== ZoomMode.Map) return;

    event.preventDefault();

    if (event.deltaY < 0) {
      globalActions.zoomIn();
    } else {
      globalActions.zoomOut();
    }
  }
</script>

<div class="map-container">
  <img
    class="placeholder-globe"
    src={placeholderGlobe}
    alt="placeholder map"
    style={transformStyle}
    ondblclick={handleDoubleClick}
    onwheel={handleWheel}
  />
</div>

<style>
  .map-container {
    width: 100%;
    height: 100%;
    max-height: 80vh;
    max-width: 80vw;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .placeholder-globe {
    width: 100%;
    height: 100%;
    object-fit: contain;
    transition: transform 0.2s ease-in-out;
    cursor: grab;
  }

  .placeholder-globe:active {
    cursor: grabbing;
  }
</style>
