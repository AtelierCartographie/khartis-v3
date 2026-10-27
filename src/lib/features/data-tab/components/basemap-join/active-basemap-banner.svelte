<script lang="ts">
  import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';
  import * as m from '$lib/paraglide/messages';
  import { getLocale } from '$lib/paraglide/runtime';
  import { Earth } from 'carbon-icons-svelte';
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
  // The reference basemap's title already names its origin.
  const originLabel = $derived(
    origin === 'osm'
      ? null
      : origin === 'import'
        ? m.basemap_import_file_imported()
        : m.basemap_catalog()
  );
</script>

<div class="active-basemap" role="status">
  <Earth size={16} aria-hidden="true" class="active-basemap-icon" />
  <span class="active-basemap-label">{m.basemap_active_label()}</span>
  <span class="active-basemap-title" title={title}>{title}</span>
  {#if originLabel}
    <span class="active-basemap-origin">{originLabel}</span>
  {/if}
</div>

<style>
  .active-basemap {
    display: flex;
    align-items: baseline;
    gap: var(--cds-spacing-03);
    padding: var(--cds-spacing-03) var(--cds-spacing-04);
    background: var(--cds-layer-01, #f4f4f4);
    border-left: 3px solid var(--cds-interactive-01, #0f62fe);
    white-space: nowrap;
  }

  .active-basemap :global(.active-basemap-icon) {
    flex-shrink: 0;
    align-self: center;
  }

  .active-basemap-label,
  .active-basemap-origin {
    flex-shrink: 0;
    font-size: 0.75rem;
    color: var(--cds-text-02);
  }

  .active-basemap-title {
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--cds-text-01);
  }
</style>
