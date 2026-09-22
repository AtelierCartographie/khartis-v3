<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import InsetMapSection from './inset-map-section.svelte';
  import OrientationSection from './orientation-section.svelte';
  import ScaleSection from './scale-section.svelte';
</script>

<div id="khartis-geo-indications-tool">
  <p class="kh-help">{m.styling_drag_helper()}</p>

  <div class="expandable-stack">
    <ScaleSection />
    <OrientationSection />
    <InsetMapSection />
  </div>
</div>

<style>
  #khartis-geo-indications-tool .kh-help {
    margin-bottom: var(--kh-gap-param);
  }
</style>
