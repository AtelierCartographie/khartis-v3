<script lang="ts">
  import {
    DistanceUnit,
    InsetMapType,
    OrientationIndicatorStyle
  } from '$lib/features/commons/constants/ui.constants';
  import { mapInstanceStore } from '$lib/features/commons/store/map-instance.store.svelte';
  import { hslToHex } from '$lib/features/commons/utils/color-utils';
  import { geoIndicationsState } from '$lib/features/step-toolbar/tools/geo-indications/geo-indications.store.svelte';
  import { basemapLayersStore } from '../stores/basemap-layers.store.svelte';
  import * as m from '$lib/paraglide/messages';

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
  const insetSize = $derived(Math.max(40, geoIndicationsState.insetMap.size));

  const basemapContinentColor = $derived.by(() => {
    const terreLayer = basemapLayersStore.getLayer('terre');
    return terreLayer ? terreLayer.fillColor : '#d9d9d9';
  });

  const basemapSeaColor = $derived.by(() => {
    const seaLayer = basemapLayersStore.getLayer('mers');
    return seaLayer ? seaLayer.color : '#d0e2ff';
  });

  const insetContinentColor = $derived.by(() => {
    if (geoIndicationsState.insetMap.useBasemapColors) {
      return basemapContinentColor;
    }

    return hslToHex(
      geoIndicationsState.insetMap.continentColor.hue,
      geoIndicationsState.insetMap.continentColor.saturation,
      geoIndicationsState.insetMap.continentColor.lightness
    );
  });

  const insetSeaColor = $derived.by(() => {
    if (geoIndicationsState.insetMap.useBasemapColors) {
      return basemapSeaColor;
    }

    return hslToHex(
      geoIndicationsState.insetMap.seaColor.hue,
      geoIndicationsState.insetMap.seaColor.saturation,
      geoIndicationsState.insetMap.seaColor.lightness
    );
  });

  const insetWindowColor = $derived(
    hslToHex(
      geoIndicationsState.insetMap.windowColor.hue,
      geoIndicationsState.insetMap.windowColor.saturation,
      geoIndicationsState.insetMap.windowColor.lightness
    )
  );

  function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  const insetWindowStyle = $derived.by(() => {
    const zoomRatio = clamp(geoIndicationsState.insetMap.zoom / 100, 0, 1);
    const widthPercent = 48 - zoomRatio * 36;
    const heightPercent = widthPercent * 0.62;

    const centerX =
      ((geoIndicationsState.insetMap.centerLongitude + 180) / 360) * 100;
    const centerY =
      ((90 - geoIndicationsState.insetMap.centerLatitude) / 180) * 100;

    const left = clamp(centerX - widthPercent / 2, 0, 100 - widthPercent);
    const top = clamp(centerY - heightPercent / 2, 0, 100 - heightPercent);

    return `left: ${left}%; top: ${top}%; width: ${widthPercent}%; height: ${heightPercent}%; border-color: ${insetWindowColor};`;
  });
</script>

<div class="geo-indications-overlay">
  {#if geoIndicationsState.scale.enabled}
    <div class="scale-bar">
      <svg
        width={scaleWidth + 20}
        height="30"
        aria-label={m.geo_scale_bar_aria()}
      >
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
        aria-label={m.geo_north_indicator_aria()}
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

  {#if geoIndicationsState.insetMap.enabled}
    <div class="inset-map-panel">
      <div
        class="inset-map {geoIndicationsState.insetMap.type ===
        InsetMapType.GLOBE
          ? 'inset-map-globe'
          : 'inset-map-planisphere'}"
        style="width: {insetSize}px; height: {geoIndicationsState.insetMap
          .type === InsetMapType.GLOBE
          ? insetSize
          : Math.round(insetSize * 0.64)}px; background-color: {insetSeaColor};"
      >
        <div
          class="continent continent-a"
          style="background-color: {insetContinentColor};"
        ></div>
        <div
          class="continent continent-b"
          style="background-color: {insetContinentColor};"
        ></div>
        <div
          class="continent continent-c"
          style="background-color: {insetContinentColor};"
        ></div>
        <div class="inset-window" style={insetWindowStyle}></div>
      </div>
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

  .inset-map-panel {
    position: absolute;
    bottom: 16px;
    right: 16px;
    background: rgba(255, 255, 255, 0.85);
    padding: 6px;
    border-radius: 4px;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
  }

  .inset-map {
    position: relative;
    overflow: hidden;
    border: 1px solid rgba(22, 22, 22, 0.2);
  }

  .inset-map-globe {
    border-radius: 50%;
  }

  .inset-map-planisphere {
    border-radius: 6px;
  }

  .continent {
    position: absolute;
    opacity: 0.95;
  }

  .inset-map-globe .continent-a {
    left: 14%;
    top: 22%;
    width: 30%;
    height: 35%;
    border-radius: 48% 52% 44% 56%;
  }

  .inset-map-globe .continent-b {
    right: 15%;
    top: 18%;
    width: 26%;
    height: 42%;
    border-radius: 58% 42% 51% 49%;
  }

  .inset-map-globe .continent-c {
    left: 40%;
    bottom: 16%;
    width: 24%;
    height: 23%;
    border-radius: 46% 54% 59% 41%;
  }

  .inset-map-planisphere .continent-a {
    left: 8%;
    top: 18%;
    width: 30%;
    height: 42%;
    border-radius: 24% 48% 42% 36%;
  }

  .inset-map-planisphere .continent-b {
    left: 41%;
    top: 24%;
    width: 22%;
    height: 33%;
    border-radius: 36% 44% 38% 42%;
  }

  .inset-map-planisphere .continent-c {
    right: 8%;
    top: 20%;
    width: 25%;
    height: 45%;
    border-radius: 41% 35% 39% 45%;
  }

  .inset-window {
    position: absolute;
    border: 2px solid;
    border-radius: 3px;
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.55) inset;
  }

  .inset-map-globe .inset-window {
    border-radius: 999px;
  }
</style>
