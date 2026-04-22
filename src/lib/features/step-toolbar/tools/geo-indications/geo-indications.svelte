<script lang="ts">
  import InsetMapSection from './inset-map-section.svelte';
  import OrientationSection from './orientation-section.svelte';
  import ScaleSection from './scale-section.svelte';
</script>

<div id="khartis-geo-indications-tool">
  <div class="expandable-stack">
    <ScaleSection />
    <OrientationSection />
    <InsetMapSection />
  </div>
</div>
