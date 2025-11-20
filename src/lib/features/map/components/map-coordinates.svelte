<script lang="ts">
  import type { Map as MapLibreMap, MapMouseEvent } from 'maplibre-gl';
  import { onMount } from 'svelte';

  interface MapCoordinatesProps {
    map: MapLibreMap | null;
  }

  let { map }: MapCoordinatesProps = $props();

  let coordinates = $state({ lng: 0, lat: 0 });
  let isMapReady = $state(false);

  const handleMouseMove = (e: MapMouseEvent): void => {
    coordinates = {
      lng: parseFloat(e.lngLat.lng.toFixed(4)),
      lat: parseFloat(e.lngLat.lat.toFixed(4))
    };
  };

  onMount(() => {
    const checkAndAttach = (): void => {
      if (!map) {
        setTimeout(checkAndAttach, 100);
        return;
      }

      if (map.loaded()) {
        attachListeners();
      } else {
        map.once('load', attachListeners);
      }
    };

    const attachListeners = (): void => {
      if (!map) return;
      map.on('mousemove', handleMouseMove);
      isMapReady = true;
    };

    checkAndAttach();

    return () => {
      if (map && isMapReady) {
        map.off('mousemove', handleMouseMove);
      }
    };
  });
</script>

<div class="map-coordinates">
  <span>Lat: {coordinates.lat}°</span>
  <span>Lon: {coordinates.lng}°</span>
</div>

<style>
  .map-coordinates {
    position: absolute;
    bottom: 10px;
    right: 10px;
    background-color: rgba(255, 255, 255, 0.9);
    padding: 6px 12px;
    border-radius: 4px;
    font-size: 12px;
    font-family: monospace;
    display: flex;
    gap: 12px;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
    z-index: 1;
    pointer-events: none;
  }

  .map-coordinates span {
    color: #161616;
  }
</style>
