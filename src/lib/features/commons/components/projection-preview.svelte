<script lang="ts">
  import { geoGraticule10, geoPath, type GeoPermissibleObjects } from 'd3-geo';
  import { getProjectionById } from '$lib/features/commons/utils/projection.utils';

  interface Props {
    projectionId?: string;
    label: string;
    theme?: 'default' | 'suggestion';
  }

  type PreviewPaths = {
    sphere: string;
    graticule: string;
    land: string;
    composite: boolean;
  };

  let { projectionId, label, theme = 'default' }: Props = $props();

  const WIDTH = 120;
  const HEIGHT = 120;
  const FALLBACK_PROJECTION_ID = 'natural-earth';

  const SPHERE = { type: 'Sphere' } satisfies GeoPermissibleObjects;
  const GRATICULE = geoGraticule10() satisfies GeoPermissibleObjects;
  const WORLD_LAND = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-168, 12],
              [-140, 55],
              [-96, 72],
              [-55, 49],
              [-82, 7],
              [-118, 18],
              [-168, 12]
            ]
          ]
        }
      },
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-82, 11],
              [-52, 6],
              [-35, -20],
              [-63, -55],
              [-80, -25],
              [-82, 11]
            ]
          ]
        }
      },
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-12, 36],
              [38, 70],
              [122, 62],
              [158, 35],
              [104, 6],
              [42, 24],
              [10, 36],
              [-12, 36]
            ]
          ]
        }
      },
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-18, 32],
              [34, 30],
              [50, 4],
              [28, -35],
              [2, -34],
              [-16, 6],
              [-18, 32]
            ]
          ]
        }
      },
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [112, -11],
              [154, -24],
              [144, -43],
              [113, -34],
              [112, -11]
            ]
          ]
        }
      },
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-180, -66],
              [180, -66],
              [180, -82],
              [-180, -82],
              [-180, -66]
            ]
          ]
        }
      }
    ]
  } satisfies GeoPermissibleObjects;

  const paths = $derived.by(() => buildPreviewPaths(projectionId));
  const previewClass = $derived(
    theme === 'suggestion'
      ? 'projection-preview projection-preview--suggestion'
      : 'projection-preview'
  );

  function buildPreviewPaths(id?: string): PreviewPaths {
    const composite = Boolean(id?.startsWith('composite:'));
    const resolvedId = composite ? FALLBACK_PROJECTION_ID : id;
    const projectionInfo =
      (resolvedId ? getProjectionById(resolvedId) : undefined) ??
      getProjectionById(FALLBACK_PROJECTION_ID);
    const projection = projectionInfo?.projection();

    if (!projection) {
      return { sphere: '', graticule: '', land: '', composite };
    }

    projection.fitExtent(
      [
        [10, 10],
        [WIDTH - 10, HEIGHT - 10]
      ],
      SPHERE
    );

    const path = geoPath(projection);

    return {
      sphere: path(SPHERE) ?? '',
      graticule: path(GRATICULE) ?? '',
      land: path(WORLD_LAND) ?? '',
      composite
    };
  }
</script>

<svg
  class={previewClass}
  viewBox="0 0 {WIDTH} {HEIGHT}"
  role="img"
  aria-label={label}
  preserveAspectRatio="xMidYMid meet"
>
  <rect class="preview-background" x="0" y="0" width={WIDTH} height={HEIGHT} />
  {#if paths.sphere}
    <path class="projection-sphere" d={paths.sphere} />
  {/if}
  {#if paths.graticule}
    <path class="projection-graticule" d={paths.graticule} />
  {/if}
  {#if paths.land}
    <path class="projection-land" d={paths.land} />
  {/if}
  {#if paths.composite}
    <g class="projection-insets" aria-hidden="true">
      <rect x="78" y="73" width="18" height="13" />
      <rect x="98" y="78" width="12" height="9" />
      <rect x="87" y="91" width="16" height="10" />
    </g>
  {/if}
</svg>

<style>
  .projection-preview {
    display: block;
    width: 100%;
    height: 100%;
    background: #ffffff;
  }

  .preview-background {
    fill: #ffffff;
  }

  .projection-sphere {
    fill: #edf5ff;
    stroke: #78a9ff;
    stroke-width: 1.5;
  }

  .projection-graticule {
    fill: none;
    stroke: #a6c8ff;
    stroke-width: 0.7;
    opacity: 0.75;
  }

  .projection-land {
    fill: #0f62fe;
    stroke: #ffffff;
    stroke-width: 1.1;
  }

  .projection-preview--suggestion .projection-sphere {
    fill: #e5f6ff;
    stroke: #82cfff;
  }

  .projection-preview--suggestion .projection-graticule {
    stroke: #82cfff;
  }

  .projection-preview--suggestion .projection-land {
    fill: #0072c3;
  }

  .projection-insets rect {
    fill: #ffffff;
    stroke: currentColor;
    stroke-width: 1.3;
  }
</style>
