<script lang="ts">
  import {
    DistanceUnit,
    OrientationIndicatorStyle
  } from '$lib/features/commons/constants/ui.constants';
  import { hslToHex } from '$lib/features/commons/utils/color-utils';
  import { geoIndicationsState } from '$lib/features/step-toolbar/tools/geo-indications/geo-indications.store.svelte';
  import { mapInstanceStore } from '$lib/features/commons/store/map-instance.store.svelte';

  const EARTH_CIRCUMFERENCE_KM = 40075.017;
  const KM_TO_MILES = 0.621371;

  const scaleColor = $derived(
    hslToHex(
      geoIndicationsState.scale.color.hue,
      geoIndicationsState.scale.color.saturation,
      geoIndicationsState.scale.color.lightness
    )
  );

  const orientationColor = $derived(
    hslToHex(
      geoIndicationsState.orientation.color.hue,
      geoIndicationsState.orientation.color.saturation,
      geoIndicationsState.orientation.color.lightness
    )
  );

  const scaleWidth = $derived.by(() => {
    const zoom = mapInstanceStore.currentZoom ?? 2;
    const distanceKm =
      geoIndicationsState.scale.units === DistanceUnit.KILOMETERS
        ? geoIndicationsState.scale.distance
        : geoIndicationsState.scale.distance / KM_TO_MILES;

    const metersPerPixel =
      (EARTH_CIRCUMFERENCE_KM * 1000) / Math.pow(2, zoom + 8);
    const distanceMeters = distanceKm * 1000;
    const width = Math.round(distanceMeters / metersPerPixel);

    return Math.min(Math.max(width, 30), 300);
  });

  const scaleLabel = $derived.by(() => {
    const distance = geoIndicationsState.scale.distance;
    const units = geoIndicationsState.scale.units;
    const unitLabel = units === DistanceUnit.KILOMETERS ? 'km' : 'mi';
    return `${distance} ${unitLabel}`;
  });

  const orientationSize = $derived(geoIndicationsState.orientation.size * 3);
</script>

<div class="geo-indications-overlay">
  {#if geoIndicationsState.scale.enabled}
    <div class="scale-bar">
      <svg width={scaleWidth + 20} height="30" aria-label="Scale bar">
        <line
          x1="10"
          y1="20"
          x2={scaleWidth + 10}
          y2="20"
          stroke={scaleColor}
          stroke-width="2"
        />
        <line
          x1="10"
          y1="15"
          x2="10"
          y2="25"
          stroke={scaleColor}
          stroke-width="2"
        />
        <line
          x1={scaleWidth + 10}
          y1="15"
          x2={scaleWidth + 10}
          y2="25"
          stroke={scaleColor}
          stroke-width="2"
        />
        <text
          x={scaleWidth / 2 + 10}
          y="12"
          text-anchor="middle"
          fill={scaleColor}
          font-size="11"
          font-family="Arial, sans-serif"
        >
          {scaleLabel}
        </text>
      </svg>
    </div>
  {/if}

  {#if geoIndicationsState.orientation.enabled}
    <div class="north-arrow">
      <svg
        width={orientationSize}
        height={orientationSize}
        viewBox="0 0 40 50"
        aria-label="North indicator"
      >
        {#if geoIndicationsState.orientation.style === OrientationIndicatorStyle.ARROW}
          <polygon
            points="20,5 30,35 20,28 10,35"
            fill={orientationColor}
            stroke={orientationColor}
            stroke-width="1"
          />
          <text
            x="20"
            y="47"
            text-anchor="middle"
            font-size="12"
            font-weight="bold"
            fill={orientationColor}
            font-family="Arial, sans-serif"
          >
            N
          </text>
        {:else}
          <circle
            cx="20"
            cy="20"
            r="15"
            fill="none"
            stroke={orientationColor}
            stroke-width="2"
          />
          <polygon points="20,7 23,20 20,15 17,20" fill={orientationColor} />
          <polygon
            points="20,33 23,20 20,25 17,20"
            fill="none"
            stroke={orientationColor}
            stroke-width="1"
          />
          <line
            x1="7"
            y1="20"
            x2="33"
            y2="20"
            stroke={orientationColor}
            stroke-width="1"
          />
          <text
            x="20"
            y="47"
            text-anchor="middle"
            font-size="10"
            font-weight="bold"
            fill={orientationColor}
            font-family="Arial, sans-serif"
          >
            N
          </text>
        {/if}
      </svg>
    </div>
  {/if}
</div>

<style>
  .geo-indications-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 10;
  }

  .scale-bar {
    position: absolute;
    bottom: 16px;
    left: 16px;
    background: rgba(255, 255, 255, 0.85);
    padding: 4px 6px;
    border-radius: 4px;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
  }

  .north-arrow {
    position: absolute;
    top: 16px;
    right: 16px;
    background: rgba(255, 255, 255, 0.85);
    padding: 6px;
    border-radius: 4px;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
  }
</style>
