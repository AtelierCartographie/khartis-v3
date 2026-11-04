<script lang="ts">
  import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';
  import * as m from '$lib/paraglide/messages';
  import { getLocale } from '$lib/paraglide/runtime';
  import { Grid, List, Upload } from 'carbon-icons-svelte';
  import type { ActiveBasemapOrigin } from '../../utils/active-basemap.utils';

  interface Props {
    basemap: BasemapMetadata;
    origin: ActiveBasemapOrigin;
  }

  let { basemap, origin }: Props = $props();

  const title = $derived.by(() => {
    if (origin === 'osm') return m.basemap_osm();
    const name = getLocale() === 'fr' ? basemap.title_fr : basemap.title_en;
    const subtitle = (
      (getLocale() === 'fr' ? basemap.subtitle_fr : basemap.subtitle_en) ?? ''
    ).trim();
    return subtitle ? `${name}${m.aria_label_separator()}${subtitle}` : name;
  });
  // The icon and wording of the tab the basemap comes from.
  const OriginIcon = $derived(
    origin === 'osm' ? Grid : origin === 'import' ? Upload : List
  );
  // The reference basemap's title already names its origin.
  const originLabel = $derived(
    origin === 'osm'
      ? null
      : origin === 'import'
        ? m.basemap_active_origin_import()
        : m.basemap_active_origin_catalog()
  );
</script>

<div class="active-basemap" role="status">
  <OriginIcon size={20} aria-hidden="true" class="active-basemap-icon" />
  <p class="active-basemap-text">
    <span class="active-basemap-label">{m.basemap_active_label()}</span>
    <span class="active-basemap-title" title={title}>{title}</span>
    {#if originLabel}
      <span class="active-basemap-origin">({originLabel})</span>
    {/if}
  </p>
</div>

<style>
  .active-basemap {
    display: flex;
    align-items: center;
    gap: var(--kh-gap-inline);
    padding: var(--kh-pad-panel);
    background-color: color-mix(
      in srgb,
      var(--cds-support-info, #0043ce) 8%,
      var(--cds-ui-01, #ffffff)
    );
    border-left: 3px solid var(--cds-support-info, #0043ce);
  }

  .active-basemap :global(.active-basemap-icon) {
    flex-shrink: 0;
    fill: var(--cds-support-info, #0043ce);
  }

  .active-basemap-text {
    display: flex;
    align-items: baseline;
    gap: var(--cds-spacing-02);
    min-width: 0;
    margin: 0;
    font-size: 0.875rem;
    line-height: 1.25rem;
    color: var(--cds-text-01);
    white-space: nowrap;
  }

  .active-basemap-label {
    flex-shrink: 0;
    font-weight: 600;
  }

  .active-basemap-title {
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .active-basemap-origin {
    flex-shrink: 0;
    color: var(--cds-text-02);
  }
</style>
