<script lang="ts">
  import { COLOR_BLINDNESS_FILTER_ID } from './color-blindness.filter';

  interface Props {
    matrix: string | null;
  }

  let { matrix }: Props = $props();
</script>

<svg aria-hidden="true" class="color-blindness-svg-defs">
  <defs>
    <filter id={COLOR_BLINDNESS_FILTER_ID} color-interpolation-filters="sRGB">
      <feColorMatrix
        type="matrix"
        values={matrix ?? '1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0'}
      />
    </filter>
  </defs>
</svg>

<style>
  .color-blindness-svg-defs {
    position: absolute;
    width: 0;
    height: 0;
    overflow: hidden;
    pointer-events: none;
  }
</style>
