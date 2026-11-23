<script lang="ts">
  import { untrack } from 'svelte';
  import * as m from '$lib/paraglide/messages';
  import { createAccordionGroup } from '$lib/features/commons/utils/accordion-group.svelte';
  import { geoIndicationsState } from './geo-indications.store.svelte';
  import {
    clearGeoIndicationFocus,
    getPendingGeoIndicationFocus,
    type GeoIndicationSection
  } from './geo-indications-focus.svelte';
  import InsetMapSection from './inset-map-section.svelte';
  import OrientationSection from './orientation-section.svelte';
  import ScaleSection from './scale-section.svelte';

  const sectionAccordion = createAccordionGroup(() => {
    if (geoIndicationsState.scale.enabled) return 'scale';
    if (geoIndicationsState.orientation.enabled) return 'orientation';
    if (geoIndicationsState.insetMap.enabled) return 'inset';
    return undefined;
  });

  function sectionProps(section: GeoIndicationSection) {
    return {
      open: sectionAccordion.isOpen(section),
      onToggle: (expanded: boolean) =>
        sectionAccordion.setOpen(section, expanded)
    };
  }

  $effect(() => {
    const section = getPendingGeoIndicationFocus();
    if (!section) return;

    untrack(() => {
      clearGeoIndicationFocus();
      sectionAccordion.setOpen(section, true);
    });
  });
</script>

<div id="khartis-geo-indications-tool">
  <p class="kh-help">{m.styling_drag_helper()}</p>

  <div class="expandable-stack">
    <ScaleSection {...sectionProps('scale')} />
    <OrientationSection {...sectionProps('orientation')} />
    <InsetMapSection {...sectionProps('inset')} />
  </div>
</div>

<style>
  #khartis-geo-indications-tool .kh-help {
    margin-bottom: var(--kh-gap-param);
  }
</style>
