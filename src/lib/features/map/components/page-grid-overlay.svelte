<script lang="ts">
  import { PAGE_GRID_SIZE_PX } from '$lib/features/commons/utils/page-grid.utils';
</script>

<div
  aria-hidden="true"
  class="page-grid"
  style={`--page-grid-size:${PAGE_GRID_SIZE_PX}px;`}
></div>

<style>
  .page-grid {
    position: absolute;
    inset: 0;
    z-index: var(--z-map-layer);
    pointer-events: none;
    background-image: radial-gradient(
      circle,
      rgba(22, 22, 22, 0.28) 0.75px,
      transparent 0.75px
    );
    background-size: var(--page-grid-size) var(--page-grid-size);
    background-position: 0 0;
  }
</style>
