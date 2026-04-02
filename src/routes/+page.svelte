<script lang="ts">
  import { onMount } from 'svelte';
  import type { Component } from 'svelte';

  let MainMap = $state<Component | null>(null);

  onMount(() => {
    import('$lib/features/map/main-map.svelte').then((mod) => {
      MainMap = mod.default;
    });
  });
</script>

<div class="map-page">
  {#if MainMap}
    <MainMap />
  {/if}
</div>

<style>
  .map-page {
    flex: 1;
    width: 100%;
    height: 100%;
  }
</style>
