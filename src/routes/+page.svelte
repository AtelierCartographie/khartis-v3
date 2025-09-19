<script lang="ts">
  import MainMap from '$lib/features/map/main-map.svelte';
</script>

<article class="page-content app-shadow">
  <MainMap />
</article>

<style>
  .page-content {
    display: flex;
    justify-content: center;
    align-items: center;
  }

  article {
    position: relative;
    background-color: white;
    padding: 40px;
  }
</style>
