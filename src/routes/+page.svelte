<script lang="ts">
  import MainMap from '$lib/features/map/main-map.svelte';
</script>

<!-- Map page does NOT use page zoom transform - map has its own zoom via MapLibre -->
<article class="page-content app-shadow">
  <MainMap />
</article>

<style>
  .page-content {
    display: flex;
    justify-content: center;
    align-items: center;
    flex: 1;
    width: 100%;
    height: 100%;
    background-color: white;
    overflow: hidden;
    /* Override parent transform to keep map at 1:1 for correct pointer events */
    transform: none !important;
  }
</style>
