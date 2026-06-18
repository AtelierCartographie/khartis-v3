<script lang="ts">
  interface PreviewPaths {
    sphere: string;
    graticule: string;
    land: string;
    borders: string;
  }

  interface Props {
    paths: PreviewPaths;
    label: string;
    theme?: 'default' | 'suggestion';
  }

  let { paths, label, theme = 'default' }: Props = $props();

  const WIDTH = 120;
  const HEIGHT = 120;

  const previewClass = $derived(
    theme === 'suggestion'
      ? 'projection-preview projection-preview--suggestion'
      : 'projection-preview'
  );
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
  {#if paths.borders}
    <path class="projection-borders" d={paths.borders} />
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
  }

  .projection-borders {
    fill: none;
    stroke: #ffffff;
    stroke-width: 0.5;
    opacity: 0.9;
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

  .projection-preview--suggestion .projection-borders {
    stroke: #e5f6ff;
  }
</style>
