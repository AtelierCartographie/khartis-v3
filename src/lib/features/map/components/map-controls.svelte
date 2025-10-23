<script lang="ts">
  import { Button } from 'carbon-components-svelte';
  import { Add, Subtract, CenterCircle } from 'carbon-icons-svelte';
  import type { Map as MapLibreMap } from 'maplibre-gl';

  interface MapControlsProps {
    map: MapLibreMap | null;
  }

  let { map }: MapControlsProps = $props();

  const ZOOM_DELTA = 1;
  const ZOOM_DURATION = 300;

  function zoomIn(): void {
    if (!map) return;
    const currentZoom = map.getZoom();
    map.easeTo({
      zoom: currentZoom + ZOOM_DELTA,
      duration: ZOOM_DURATION
    });
  }

  function zoomOut(): void {
    if (!map) return;
    const currentZoom = map.getZoom();
    map.easeTo({
      zoom: currentZoom - ZOOM_DELTA,
      duration: ZOOM_DURATION
    });
  }

  function recenter(): void {
    if (!map) return;
    map.easeTo({
      center: [0, 20],
      zoom: 1.5,
      duration: ZOOM_DURATION
    });
  }
</script>

<div class="map-controls">
  <Button
    kind="tertiary"
    size="small"
    icon={Add}
    iconDescription="Zoom in"
    tooltipPosition="left"
    onclick={zoomIn}
  />
  <Button
    kind="tertiary"
    size="small"
    icon={Subtract}
    iconDescription="Zoom out"
    tooltipPosition="left"
    onclick={zoomOut}
  />
  <Button
    kind="tertiary"
    size="small"
    icon={CenterCircle}
    iconDescription="Recenter"
    tooltipPosition="left"
    onclick={recenter}
  />
</div>

<style>
  .map-controls {
    position: absolute;
    top: 10px;
    right: 10px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    z-index: 1;
  }
</style>
