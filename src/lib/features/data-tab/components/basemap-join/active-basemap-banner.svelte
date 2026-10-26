<script lang="ts">
  import Button from '$lib/features/commons/components/carbon/button.svelte';
  import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';
  import * as m from '$lib/paraglide/messages';
  import { getLocale } from '$lib/paraglide/runtime';
  import { Earth } from 'carbon-icons-svelte';
  import type { ActiveBasemapOrigin } from '../../utils/active-basemap.utils';

  interface Props {
    basemap: BasemapMetadata;
    origin: ActiveBasemapOrigin;
    isSourceShown: boolean;
    onShowSource: () => void;
  }

  let { basemap, origin, isSourceShown, onShowSource }: Props = $props();

  const title = $derived(
    origin === 'osm'
      ? m.basemap_osm()
      : getLocale() === 'fr'
        ? basemap.title_fr
        : basemap.title_en
  );
  const subtitle = $derived(
    origin === 'osm'
      ? ''
      : ((getLocale() === 'fr' ? basemap.subtitle_fr : basemap.subtitle_en) ??
          '')
  );
  const originLabel = $derived.by(() => {
    switch (origin) {
      case 'osm':
        return m.basemap_osm();
      case 'project':
        return m.basemap_project_file_source();
      case 'import':
        return m.basemap_import_file_imported();
      case 'catalog':
      default:
        return m.basemap_catalog();
    }
  });
  const sourceTabLabel = $derived(
    origin === 'osm'
      ? m.basemap_osm()
      : origin === 'catalog'
        ? m.basemap_catalog()
        : m.basemap_import()
  );
</script>

<div class="active-basemap" role="status">
  <Earth size={20} aria-hidden="true" />
  <div class="active-basemap-copy">
    <span class="active-basemap-label">{m.basemap_active_label()}</span>
    <span class="active-basemap-title">
      {title}{#if subtitle.trim()}{m.aria_label_separator()}{subtitle.trim()}{/if}
    </span>
    <span class="active-basemap-origin">{originLabel}</span>
  </div>
  {#if !isSourceShown}
    <Button
      kind="ghost"
      size="small"
      on:click={onShowSource}
      aria-label={m.basemap_active_show_source_aria({ tab: sourceTabLabel })}
    >
      {m.basemap_active_show_source()}
    </Button>
  {/if}
</div>

<style>
  .active-basemap {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-04);
    padding: var(--cds-spacing-04);
    background: var(--cds-layer-01, #f4f4f4);
    border-left: 3px solid var(--cds-interactive-01, #0f62fe);
  }

  .active-basemap-copy {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
  }

  .active-basemap-label,
  .active-basemap-origin {
    font-size: 0.75rem;
    color: var(--cds-text-02);
  }

  .active-basemap-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--cds-text-01);
    overflow-wrap: anywhere;
  }
</style>
